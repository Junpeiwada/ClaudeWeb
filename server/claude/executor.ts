import { query } from "@anthropic-ai/claude-code";
import type { SDKMessage, PermissionResult } from "@anthropic-ai/claude-code";
import { randomUUID } from "crypto";
import { appendFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(import.meta.dirname, "../../debug.log");

function log(label: string, data: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${label}: ${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n`;
  appendFileSync(LOG_FILE, line);
}

export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface Session {
  repoId: string;
  repoPath: string;
  sessionId: string | null;
  pendingPermission: PendingPermission | null;
  abortController: AbortController;
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

export interface ChatCallbacks {
  onText: (content: string) => void;
  onActivity: (activity: string) => void;
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
  };
  currentSession = session;

  log("REQUEST", { message: message.slice(0, 200), repoId, repoPath, resumeSessionId });

  try {
    await runQuery(message, repoPath, abortController, resumeSessionId, autoEdit, session, callbacks);
    callbacks.onDone(session.sessionId);
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      callbacks.onDone(session.sessionId);
      return;
    }

    // resume失敗時はsessionIdなしでリトライ
    if (resumeSessionId && String(err.message).includes("exited with code 1")) {
      log("RETRY", "resume failed, retrying without sessionId");
      session.sessionId = null;
      try {
        await runQuery(message, repoPath, abortController, null, autoEdit, session, callbacks);
        callbacks.onDone(session.sessionId);
        return;
      } catch (retryErr: any) {
        if (retryErr.name === "AbortError" || abortController.signal.aborted) {
          callbacks.onDone(session.sessionId);
          return;
        }
        log("ERROR", { name: retryErr.name, message: retryErr.message, stack: retryErr.stack });
        callbacks.onError(retryErr.message ?? String(retryErr));
        return;
      }
    }

    log("ERROR", { name: err.name, message: err.message, stack: err.stack });
    callbacks.onError(err.message ?? String(err));
  }
}

async function runQuery(
  message: string,
  repoPath: string,
  abortController: AbortController,
  resumeSessionId: string | null,
  autoEdit: boolean,
  session: Session,
  callbacks: ChatCallbacks
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
      },
      canUseTool: async (toolName, input, { signal }) => {
        // autoEdit有効時はEdit/Writeを自動承認
        if (autoEdit) {
          const autoApproveTools = ["Edit", "Write", "MultiEdit"];
          if (autoApproveTools.includes(toolName)) {
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
        callbacks.onText(event.delta.text);
      }
      continue;
    }

    if (msg.type === "assistant") {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if ("type" in block && block.type === "tool_use") {
            const toolBlock = block as { name: string; input: Record<string, unknown> };
            const label = formatToolActivity(toolBlock.name, toolBlock.input);
            callbacks.onActivity(label);
          }
        }
      }
    }

    if (msg.type === "result") {
      if ("result" in msg && msg.result) {
        callbacks.onText(msg.result);
      }
    }
  }
}
