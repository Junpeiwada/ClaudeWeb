import { useState, useCallback, useRef } from "react";

export interface AssistantPart {
  type: "text" | "tool_result";
  content: string;
  toolName?: string;
}

export interface AssistantError {
  kind: "generic" | "limit";
  message: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  parts?: AssistantPart[];
  error?: AssistantError | null;
}

export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1500;

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
  initialSessionId?: string | null
) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [pendingPermission, setPendingPermission] =
    useState<PendingPermission | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** Parse SSE lines from a ReadableStream, calling handler for each event */
  const processSSEStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      signal: AbortSignal,
      handler: (data: any) => void
    ) => {
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            handler(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
    },
    []
  );

  /** Handle a single SSE event (shared between initial connection and reconnect) */
  const handleSSEEvent = useCallback(
    (data: any) => {
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

        await processSSEStream(reader, signal, (data) => {
          if (data.type === "reconnect_state") {
            // Restore accumulated state from the server snapshot
            if (data.sessionId) setSessionId(data.sessionId);
            if (data.pendingPermission) {
              setPendingPermission(data.pendingPermission);
            }
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
              // Session already finished while we were disconnected
              return;
            }
          } else {
            // Normal SSE events after reconnection
            handleSSEEvent(data);
          }
        });

        return true;
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
    async (message: string, repoId: string, autoEdit: boolean = true) => {
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setIsLoading(true);

      // Add empty assistant message that we'll stream into
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, repoId, sessionId, autoEdit }),
          signal: controller.signal,
        });

        const reader = res.body?.getReader();
        if (!reader) return;

        await processSSEStream(reader, controller.signal, handleSSEEvent);
      } catch (err: any) {
        if (err.name === "AbortError") {
          // User cancelled — don't reconnect
        } else {
          // Connection error — attempt reconnect
          setIsReconnecting(true);
          setActivity("Reconnecting...");
          const reconnected = await reconnectWithRetries(controller.signal);
          setIsReconnecting(false);

          if (!reconnected) {
            // All retries failed
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                const prefix =
                  last.content.trim().length > 0
                    ? last.content + "\n\n"
                    : "";
                updated[updated.length - 1] = {
                  ...last,
                  content: `${prefix}Connection lost. Reconnection failed.`,
                };
              }
              return updated;
            });
          }
        }
      } finally {
        setIsLoading(false);
        setActivity(null);
        setIsReconnecting(false);
        abortRef.current = null;
      }
    },
    [sessionId, processSSEStream, handleSSEEvent, reconnectWithRetries]
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

  const resetSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
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
  };
}
