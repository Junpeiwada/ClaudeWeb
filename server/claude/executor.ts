import { query } from "@anthropic-ai/claude-code";
import type { SDKMessage, PermissionResult } from "@anthropic-ai/claude-code";
import { randomUUID } from "crypto";
import { appendFile, readdir, unlink, rename } from "fs/promises";
import { join } from "path";

const LOG_DIR = join(import.meta.dirname, "../../logs");
const LOG_RETENTION_DAYS = 10;

let currentLogDate = "";
let currentLogFile = "";

function getLogFile(): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (today !== currentLogDate) {
    currentLogDate = today;
    currentLogFile = join(LOG_DIR, `${today}.log`);
    cleanOldLogs().catch(() => {});
  }
  return currentLogFile;
}

async function cleanOldLogs(): Promise<void> {
  const files = await readdir(LOG_DIR).catch(() => [] as string[]);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOG_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  for (const file of files) {
    if (file.endsWith(".log") && file.slice(0, 10) < cutoffStr) {
      await unlink(join(LOG_DIR, file)).catch(() => {});
    }
  }
}

function log(label: string, data: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${label}: ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n`;
  appendFile(getLogFile(), line).catch(() => {});
}

export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface SessionEvent {
  type: string;
  [key: string]: unknown;
}

export interface AssistantPart {
  type: "text" | "tool_result";
  content: string;
  toolName?: string;
}

export interface AssistantError {
  kind: "generic" | "limit";
  message: string;
}

export interface AssistantMessageState {
  role: "assistant";
  content: string;
  parts: AssistantPart[];
  error: AssistantError | null;
}

export interface Session {
  repoId: string;
  repoPath: string;
  sessionId: string | null;
  pendingPermission: PendingPermission | null;
  abortController: AbortController;
  // Reconnection support
  assistantMessage: AssistantMessageState;
  listeners: Set<(data: SessionEvent) => void>;
  completed: boolean;
  leadingTextBuffer: string;
  leadingTextPending: boolean;
}

function notifyListeners(session: Session, event: SessionEvent): void {
  for (const listener of session.listeners) {
    try { listener(event); } catch {}
  }
}

export function subscribeToSession(): {
  session: Session;
  unsubscribe: () => void;
  addListener: (fn: (data: SessionEvent) => void) => void;
} | null {
  if (!currentSession) return null;
  const session = currentSession;
  const listeners = new Set<(data: SessionEvent) => void>();
  for (const fn of listeners) {
    session.listeners.add(fn);
  }
  return {
    session,
    addListener: (fn) => {
      listeners.add(fn);
      session.listeners.add(fn);
    },
    unsubscribe: () => {
      for (const fn of listeners) {
        session.listeners.delete(fn);
      }
    },
  };
}

function formatToolActivity(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "Read":
      return `Reading ${input.file_path ?? "file"}...`;
    case "Write":
      return `Writing ${input.file_path ?? "file"}...`;
    case "Edit":
      return `Editing ${input.file_path ?? "file"}...`;
    case "Bash":
      return `Running command...`;
    case "Glob":
      return `Searching files...`;
    case "Grep":
      return `Searching content...`;
    case "Agent":
      return `Thinking deeper...`;
    default:
      return `Using ${toolName}...`;
  }
}

let currentSession: Session | null = null;
let currentStream: AsyncGenerator<SDKMessage, void> & { interrupt?(): Promise<void> } | null = null;
const permissionResolvers = new Map<string, { resolve: (result: PermissionResult) => void; input: Record<string, unknown> }>();

export function getSession(): Session | null {
  return currentSession;
}

export function abortCurrentSession(): void {
  if (currentSession) {
    currentSession.abortController.abort();
    currentSession = null;
    currentStream = null;
  }
}

export async function interruptSession(): Promise<boolean> {
  if (currentStream?.interrupt) {
    await currentStream.interrupt();
    return true;
  }
  return false;
}

export function resolvePermission(requestId: string, approved: boolean): boolean {
  const entry = permissionResolvers.get(requestId);
  if (!entry) return false;

  if (approved) {
    entry.resolve({ behavior: "allow", updatedInput: entry.input });
  } else {
    entry.resolve({ behavior: "deny", message: "User denied this action", interrupt: true });
  }

  permissionResolvers.delete(requestId);
  if (currentSession) {
    currentSession.pendingPermission = null;
  }
  return true;
}

export interface ToolResult {
  toolName: string;
  content: string;
}

export interface ChatCallbacks {
  onText: (content: string) => void;
  onActivity: (activity: string) => void;
  onToolResult: (result: ToolResult) => void;
  onLimitError: (error: string) => void;
  onSessionId: (sessionId: string) => void;
  onPermission: (permission: PendingPermission) => void;
  onDone: (sessionId: string | null) => void;
  onError: (error: string) => void;
}

export async function executeChat(
  message: string,
  repoId: string,
  repoPath: string,
  resumeSessionId: string | null,
  autoEdit: boolean,
  callbacks: ChatCallbacks
): Promise<void> {
  // Abort any existing session
  abortCurrentSession();

  const abortController = new AbortController();
  const session: Session = {
    repoId,
    repoPath,
    sessionId: resumeSessionId,
    pendingPermission: null,
    abortController,
    assistantMessage: {
      role: "assistant",
      content: "",
      parts: [],
      error: null,
    },
    listeners: new Set(),
    completed: false,
    leadingTextBuffer: "",
    leadingTextPending: true,
  };
  currentSession = session;
  const stderrBuffer: string[] = [];

  log("REQUEST", { message: message.slice(0, 200), repoId, repoPath, resumeSessionId });

  // Wrap callbacks to also accumulate state and notify reconnect listeners
  const wrappedCallbacks: ChatCallbacks = {
    onText: (content) => {
      appendAssistantText(session, content);
      notifyListeners(session, { type: "text", content });
      callbacks.onText(content);
    },
    onActivity: (activity) => {
      flushLeadingTextBuffer(session, wrappedCallbacks);
      notifyListeners(session, { type: "activity", activity });
      callbacks.onActivity(activity);
    },
    onToolResult: (result) => {
      flushLeadingTextBuffer(session, wrappedCallbacks);
      session.assistantMessage.parts.push({
        type: "tool_result",
        toolName: result.toolName,
        content: result.content,
      });
      notifyListeners(session, { type: "tool_result", toolName: result.toolName, content: result.content });
      callbacks.onToolResult(result);
    },
    onLimitError: (error) => {
      session.leadingTextBuffer = "";
      session.leadingTextPending = false;
      session.assistantMessage.error = { kind: "limit", message: error };
      notifyListeners(session, { type: "limit_error", error });
      callbacks.onLimitError(error);
    },
    onSessionId: (sessionId) => {
      notifyListeners(session, { type: "session_id", sessionId });
      callbacks.onSessionId(sessionId);
    },
    onPermission: (permission) => {
      notifyListeners(session, { type: "permission", ...permission });
      callbacks.onPermission(permission);
    },
    onDone: (sid) => {
      flushLeadingTextBuffer(session, wrappedCallbacks);
      session.completed = true;
      notifyListeners(session, { type: "done", sessionId: sid });
      callbacks.onDone(sid);
    },
    onError: (error) => {
      session.completed = true;
      if (session.assistantMessage.error?.kind === "limit") {
        return;
      }
      if (session.leadingTextBuffer && isLimitErrorText(session.leadingTextBuffer)) {
        wrappedCallbacks.onLimitError(session.leadingTextBuffer.trim());
        return;
      }
      flushLeadingTextBuffer(session, wrappedCallbacks);
      session.assistantMessage.error = { kind: "generic", message: error };
      notifyListeners(session, { type: "error", error });
      callbacks.onError(error);
    },
  };

  try {
    await runQuery(message, repoPath, abortController, resumeSessionId, autoEdit, session, wrappedCallbacks, stderrBuffer);
    wrappedCallbacks.onDone(session.sessionId);
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      wrappedCallbacks.onDone(session.sessionId);
      return;
    }

    // resume失敗時はsessionIdなしでリトライ
    if (resumeSessionId && String(err.message).includes("exited with code 1")) {
      log("RETRY", "resume failed, retrying without sessionId");
      session.sessionId = null;
      try {
        stderrBuffer.length = 0;
        await runQuery(message, repoPath, abortController, null, autoEdit, session, wrappedCallbacks, stderrBuffer);
        wrappedCallbacks.onDone(session.sessionId);
        return;
      } catch (retryErr: any) {
        if (retryErr.name === "AbortError" || abortController.signal.aborted) {
          wrappedCallbacks.onDone(session.sessionId);
          return;
        }
        log("ERROR", { name: retryErr.name, message: retryErr.message, stack: retryErr.stack });
        wrappedCallbacks.onError(normalizeChatError(retryErr, stderrBuffer));
        return;
      }
    }

    log("ERROR", { name: err.name, message: err.message, stack: err.stack });
    wrappedCallbacks.onError(normalizeChatError(err, stderrBuffer));
  }
}

function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof (item as { text?: unknown }).text === "string") {
          return (item as { text: string }).text;
        }
        return JSON.stringify(item, null, 2);
      })
      .join("\n");
  }
  if (content == null) return "";
  return JSON.stringify(content, null, 2);
}

function appendAssistantText(session: Session, content: string): void {
  const message = session.assistantMessage;
  message.content += content;
  const lastPart = message.parts[message.parts.length - 1];
  if (lastPart?.type === "text") {
    lastPart.content += content;
  } else {
    message.parts.push({ type: "text", content });
  }
}

function isLimitErrorText(content: string): boolean {
  return /spending cap reached|you'?ve hit your limit/i.test(content)
    || (/resets\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)/i.test(content) && /limit|cap/i.test(content));
}

function flushLeadingTextBuffer(session: Session, callbacks: ChatCallbacks): void {
  if (!session.leadingTextBuffer) {
    session.leadingTextPending = false;
    return;
  }
  const buffered = session.leadingTextBuffer;
  session.leadingTextBuffer = "";
  session.leadingTextPending = false;
  callbacks.onText(buffered);
}

function normalizeChatError(error: unknown, stderrBuffer: string[]): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const stderrMessage = extractRelevantStderr(stderrBuffer);

  if (stderrMessage) {
    return stderrMessage;
  }

  if (/exited with code 1/i.test(rawMessage)) {
    return "Claude Code process exited with code 1. Check usage limits or authentication state.";
  }

  return rawMessage;
}

function extractRelevantStderr(stderrBuffer: string[]): string | null {
  const lines = stderrBuffer
    .flatMap((chunk) => chunk.split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Spawning Claude Code process:"))
    .filter((line) => !line.startsWith("Claude Code process exited with code"))
    .filter((line) => !line.startsWith("Claude Code stderr:"));

  if (lines.length === 0) {
    return null;
  }

  const joined = lines.join("\n");
  const limitLine = lines.find((line) => /you'?ve hit your limit|usage limit|rate limit|quota/i.test(line));
  if (limitLine) {
    return limitLine;
  }

  if (/you'?ve hit your limit|usage limit|rate limit|quota/i.test(joined)) {
    return joined;
  }

  return lines.slice(-3).join("\n");
}

async function runQuery(
  message: string,
  repoPath: string,
  abortController: AbortController,
  resumeSessionId: string | null,
  autoEdit: boolean,
  session: Session,
  callbacks: ChatCallbacks,
  stderrBuffer: string[]
): Promise<void> {
  // VSCodeデバッガ関連の環境変数を子プロセスに継承させない
  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_OPTIONS;
  delete cleanEnv.NODE_DEBUG_OPTION;
  delete cleanEnv.VSCODE_INSPECTOR_OPTIONS;

  const stream = currentStream = query({
    prompt: message,
    options: {
      cwd: repoPath,
      abortController,
      env: cleanEnv,
      ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      includePartialMessages: true,
      permissionMode: "default",
      stderr: (data: string) => {
        log("STDERR", data);
        stderrBuffer.push(data);
      },
      canUseTool: async (toolName, input, { signal }) => {
        log("TOOL", { toolName, autoEdit, inputKeys: Object.keys(input) });
        // autoEdit有効時はEdit/Writeを自動承認
        if (autoEdit) {
          const autoApproveTools = ["Edit", "Write", "MultiEdit"];
          if (autoApproveTools.includes(toolName)) {
            log("AUTO_APPROVE", toolName);
            return { behavior: "allow" as const, updatedInput: input };
          }
        }

        return new Promise<PermissionResult>((resolve) => {
          const requestId = randomUUID();
          const permission: PendingPermission = {
            requestId,
            toolName,
            toolInput: input,
          };
          session.pendingPermission = permission;
          permissionResolvers.set(requestId, { resolve, input });
          callbacks.onPermission(permission);

          signal.addEventListener("abort", () => {
            if (permissionResolvers.has(requestId)) {
              permissionResolvers.delete(requestId);
              resolve({ behavior: "deny", message: "Session aborted" });
            }
          });
        });
      },
    },
  });

  const toolUseNames = new Map<string, string>();
  let receivedTextDelta = false;

  for await (const msg of stream) {
    if (abortController.signal.aborted) break;

    if (msg.type === "system" && "subtype" in msg && msg.subtype === "init") {
      session.sessionId = msg.session_id;
      callbacks.onSessionId(msg.session_id);
    }

    // ストリーミングイベント（トークン単位のリアルタイム配信）
    if (msg.type === "stream_event") {
      const event = (msg as any).event;
      if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
        receivedTextDelta = true;
        const chunk = event.delta.text;
        if (
          session.leadingTextPending &&
          session.assistantMessage.parts.length === 0 &&
          !session.assistantMessage.error
        ) {
          session.leadingTextBuffer += chunk;
          if (isLimitErrorText(session.leadingTextBuffer)) {
            callbacks.onLimitError(session.leadingTextBuffer.trim());
          } else if (
            session.leadingTextBuffer.length >= 120 ||
            /\n/.test(session.leadingTextBuffer)
          ) {
            flushLeadingTextBuffer(session, callbacks);
          }
        } else {
          callbacks.onText(chunk);
        }
      }
      continue;
    }

    if (msg.type === "assistant") {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if ("type" in block && block.type === "tool_use") {
            const toolBlock = block as { id?: string; name: string; input: Record<string, unknown> };
            if (typeof toolBlock.id === "string") {
              toolUseNames.set(toolBlock.id, toolBlock.name);
            }
            const label = formatToolActivity(toolBlock.name, toolBlock.input);
            callbacks.onActivity(label);
          }
        }
      }
    }

    // ツール結果（user メッセージ内の tool_result）
    if (msg.type === "user") {
      const content = (msg as any).message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result") {
            const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : "";
            callbacks.onToolResult({
              toolName: toolUseNames.get(toolUseId) ?? "Tool",
              content: stringifyToolResultContent(block.content),
            });
          }
        }
      }
    }

    if (msg.type === "result" && "result" in msg && msg.result && !receivedTextDelta) {
      if (
        session.leadingTextPending &&
        session.assistantMessage.parts.length === 0 &&
        !session.assistantMessage.error &&
        isLimitErrorText(msg.result)
      ) {
        callbacks.onLimitError(msg.result.trim());
      } else {
        flushLeadingTextBuffer(session, callbacks);
        callbacks.onText(msg.result);
      }
    }
  }
}
