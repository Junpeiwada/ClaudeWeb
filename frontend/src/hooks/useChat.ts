import { useState, useCallback, useRef, useEffect } from "react";

export interface AssistantPart {
  type: "text" | "tool_result";
  content: string;
  toolName?: string;
}

export interface AssistantError {
  kind: "generic" | "limit";
  message: string;
}

export interface ImageAttachment {
  data: string;      // base64 (no data URL prefix)
  mediaType: string; // e.g. "image/png"
  preview: string;   // data URL for display
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  images?: ImageAttachment[];
  parts?: AssistantPart[];
  error?: AssistantError | null;
}

export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSE events have dynamic shapes
type SSEEvent = Record<string, any>;

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1500;
const KEEPALIVE_TIMEOUT_MS = 45_000; // サーバーkeepalive(15s)の3倍

function normalizeAssistantMessage(message: Message): Message {
  if (message.role !== "assistant") return message;
  if (message.parts) return message;
  return {
    ...message,
    parts: message.content ? [{ type: "text", content: message.content }] : [],
    error: message.error ?? null,
  };
}

function updateLastAssistant(
  messages: Message[],
  updater: (message: Message) => Message
): Message[] {
  const updated = [...messages];
  const last = updated[updated.length - 1];
  if (last?.role !== "assistant") return updated;
  updated[updated.length - 1] = updater(normalizeAssistantMessage(last));
  return updated;
}

function appendAssistantText(message: Message, content: string): Message {
  if (message.role !== "assistant") return message;
  const parts = [...(message.parts ?? [])];
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text") {
    parts[parts.length - 1] = {
      ...lastPart,
      content: lastPart.content + content,
    };
  } else {
    parts.push({ type: "text", content });
  }
  return {
    ...message,
    content: message.content + content,
    parts,
  };
}

function appendToolResult(
  message: Message,
  toolName: string,
  content: string
): Message {
  if (message.role !== "assistant") return message;
  return {
    ...message,
    parts: [...(message.parts ?? []), { type: "tool_result", toolName, content }],
  };
}

function setAssistantError(message: Message, error: AssistantError): Message {
  if (message.role !== "assistant") return message;
  return {
    ...message,
    error,
  };
}

export function useChat(
  initialMessages?: Message[],
  initialSessionId?: string | null,
  conversationKey?: string
) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [pendingPermission, setPendingPermission] =
    useState<PendingPermission | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(initialSessionId ?? null);
  const forceFreshSessionRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages(initialMessages ?? []);
    setIsLoading(false);
    setActivity(null);
    setSessionId(initialSessionId ?? null);
    sessionIdRef.current = initialSessionId ?? null;
    forceFreshSessionRef.current = initialSessionId == null;
    setPendingPermission(null);
    setIsReconnecting(false);
  }, [conversationKey, initialMessages, initialSessionId]);

  /** Parse SSE lines from a ReadableStream, calling handler for each event.
   *  onRawData is called on every reader.read() return (including keepalive). */
  const processSSEStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      signal: AbortSignal,
      handler: (data: SSEEvent) => void,
      onRawData?: () => void
    ) => {
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        onRawData?.();

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (signal.aborted) break;
          if (!line.startsWith("data: ")) continue;
          try {
            handler(JSON.parse(line.slice(6)));
          } catch { /* skip malformed SSE lines */ }
        }
      }
    },
    []
  );

  /** Handle a single SSE event (shared between initial connection and reconnect) */
  const handleSSEEvent = useCallback(
    (data: SSEEvent) => {
      if (data.type === "session_id") {
        setSessionId(data.sessionId);
      } else if (data.type === "activity") {
        setActivity(data.activity);
      } else if (data.type === "text") {
        setActivity(null);
        setMessages((prev) =>
          updateLastAssistant(prev, (last) => appendAssistantText(last, data.content))
        );
      } else if (data.type === "tool_result") {
        setActivity(null);
        setMessages((prev) =>
          updateLastAssistant(prev, (last) =>
            appendToolResult(last, data.toolName ?? "Tool", data.content)
          )
        );
      } else if (data.type === "limit_error") {
        setActivity(null);
        setMessages((prev) =>
          updateLastAssistant(prev, (last) =>
            setAssistantError(last, { kind: "limit", message: data.error })
          )
        );
      } else if (data.type === "permission") {
        console.log("[PERMISSION_RECEIVED]", data.toolName, data.requestId);
        setPendingPermission({
          requestId: data.requestId,
          toolName: data.toolName,
          toolInput: data.toolInput,
        });
      } else if (data.type === "done") {
        setActivity(null);
        if (data.sessionId) setSessionId(data.sessionId);
      } else if (data.type === "error") {
        setMessages((prev) =>
          updateLastAssistant(prev, (last) =>
            setAssistantError(last, { kind: "generic", message: data.error })
          )
        );
      }
    },
    []
  );

  /** Attempt to reconnect to an active session via /api/reconnect */
  const attemptReconnect = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      try {
        const res = await fetch("/api/reconnect", { signal });
        if (!res.ok) return false;

        const reader = res.body?.getReader();
        if (!reader) return false;

        let receivedTerminalEvent = false;
        let sessionCompleted = false;

        await processSSEStream(reader, signal, (data) => {
          if (data.type === "reconnect_state") {
            // Restore accumulated state from the server snapshot
            if (data.sessionId) setSessionId(data.sessionId);
            setPendingPermission(data.pendingPermission ?? null);
            if (data.assistantMessage) {
              setMessages((prev) =>
                updateLastAssistant(prev, () => normalizeAssistantMessage(data.assistantMessage))
              );
            } else if (typeof data.responseText === "string") {
              setMessages((prev) =>
                updateLastAssistant(prev, (last) => ({
                  ...normalizeAssistantMessage(last),
                  content: data.responseText,
                  parts: data.responseText
                    ? [{ type: "text", content: data.responseText }]
                    : [],
                }))
              );
            }
            if (data.completed) {
              sessionCompleted = true;
            }
          } else {
            // Normal SSE events after reconnection
            if (data.type === "done" || data.type === "error" || data.type === "limit_error") {
              receivedTerminalEvent = true;
            }
            handleSSEEvent(data);
          }
        });

        return sessionCompleted || receivedTerminalEvent;
      } catch {
        return false;
      }
    },
    [processSSEStream, handleSSEEvent]
  );

  /** Reconnect with retries */
  const reconnectWithRetries = useCallback(
    async (signal: AbortSignal): Promise<boolean> => {
      for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
        if (signal.aborted) return false;
        if (i > 0) {
          await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
        }
        if (signal.aborted) return false;
        const ok = await attemptReconnect(signal);
        if (ok) return true;
      }
      return false;
    },
    [attemptReconnect]
  );

  const sendMessage = useCallback(
    async (
      message: string,
      repoId: string,
      autoEdit: boolean = true,
      images?: ImageAttachment[],
      sessionIdOverride?: string | null,
    ) => {
      // Abort any existing connection (follow-up during loading)
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      const userMsg: Message = { role: "user", content: message };
      if (images?.length) userMsg.images = images;
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setActivity(null);

      // Add empty assistant message that we'll stream into
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortRef.current = controller;

      // Prepare API images (strip preview for smaller payload)
      const apiImages = images?.length
        ? images.map(({ data, mediaType }) => ({ data, mediaType }))
        : undefined;
      const requestSessionId = sessionIdOverride !== undefined
        ? sessionIdOverride
        : forceFreshSessionRef.current
          ? null
          : sessionIdRef.current;
      forceFreshSessionRef.current = false;

      let receivedDone = false;
      let receivedError = false;
      let lastDataTime = Date.now();
      let keepaliveTimedOut = false;

      // Keepaliveタイムアウト監視: サーバーから45秒以上データが来なければ接続断と判断
      const keepaliveMonitor = setInterval(() => {
        if (Date.now() - lastDataTime > KEEPALIVE_TIMEOUT_MS) {
          keepaliveTimedOut = true;
          controller.abort();
        }
      }, 5_000);

      const doReconnect = async () => {
        console.log("[RECONNECT] 再接続開始");
        const reconnectController = new AbortController();
        abortRef.current = reconnectController;
        setIsReconnecting(true);
        setActivity("再接続中...");
        const reconnected = await reconnectWithRetries(reconnectController.signal);
        setIsReconnecting(false);
        console.log("[RECONNECT]", reconnected ? "成功" : "全リトライ失敗");
        if (!reconnected) {
          setMessages((prev) =>
            updateLastAssistant(prev, (last) =>
              setAssistantError(last, {
                kind: "generic",
                message: "サーバーに接続できません。サーバーが起動しているか確認してください。",
              })
            )
          );
        }
        // まだ自分のcontrollerなら解放 → finallyでisLoadingがクリアされる
        // 新しいsendMessageが別controllerをセット済みなら上書きしない
        if (abortRef.current === reconnectController) {
          abortRef.current = null;
        }
      };

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, repoId, sessionId: requestSessionId, autoEdit, images: apiImages }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let errorMessage = `サーバーエラー (${res.status})`;
          try {
            const body = await res.text();
            if (body) errorMessage += `\n${body}`;
          } catch { /* ignore */ }
          setMessages((prev) =>
            updateLastAssistant(prev, (last) =>
              setAssistantError(last, { kind: "generic", message: errorMessage })
            )
          );
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) return;

        await processSSEStream(
          reader,
          controller.signal,
          (data) => {
            if (data.type === "done") receivedDone = true;
            if (data.type === "error" || data.type === "limit_error") receivedError = true;
            handleSSEEvent(data);
          },
          () => { lastDataTime = Date.now(); }
        );

        // ストリームが正常終了したがdone/errorイベントが来ていない → 接続断の可能性
        if (!receivedDone && !receivedError && (!controller.signal.aborted || keepaliveTimedOut)) {
          console.log("[RECONNECT] ストリーム終了（done/errorなし）→ 再接続を試行");
          await doReconnect();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          if (keepaliveTimedOut) {
            console.log("[RECONNECT] keepaliveタイムアウト → 再接続を試行");
            await doReconnect();
          }
          // else: ユーザーキャンセルまたは新しいsendMessageによる中断 → 再接続しない
        } else {
          console.log("[RECONNECT] 接続エラー → 再接続を試行", err);
          await doReconnect();
        }
      } finally {
        clearInterval(keepaliveMonitor);
        // Only cleanup if this is still the active controller
        // (a newer sendMessage call may have replaced it)
        if (abortRef.current === controller || abortRef.current === null) {
          console.log("[RECONNECT] クリーンアップ: isLoading解除");
          setIsLoading(false);
          setActivity(null);
          setIsReconnecting(false);
          abortRef.current = null;
        } else {
          console.log("[RECONNECT] クリーンアップスキップ（別のsendMessageがアクティブ）");
        }
      }
    },
    [processSSEStream, handleSSEEvent, reconnectWithRetries]
  );

  const respondPermission = useCallback(
    async (requestId: string, approved: boolean) => {
      setPendingPermission(null);
      await fetch("/api/permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, approved }),
      });
    },
    []
  );

  /** 現在の生成を停止する（UIの脱出口） */
  const stopGeneration = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // サーバー側のClaude Codeプロセスもinterrupt
    try {
      await fetch("/api/interrupt", { method: "POST" });
    } catch { /* サーバー到達不能でも無視 */ }
    setIsLoading(false);
    setActivity(null);
    setPendingPermission(null);
  }, []);

  const resetSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    sessionIdRef.current = null;
    forceFreshSessionRef.current = true;
    setIsLoading(false);
    setActivity(null);
    setPendingPermission(null);
    setIsReconnecting(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return {
    messages,
    isLoading,
    activity,
    sessionId,
    pendingPermission,
    isReconnecting,
    sendMessage,
    respondPermission,
    resetSession,
    stopGeneration,
  };
}
