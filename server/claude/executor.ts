import { query } from "@anthropic-ai/claude-code";
import type { SDKMessage, PermissionResult } from "@anthropic-ai/claude-code";
import { randomUUID } from "crypto";

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
const permissionResolvers = new Map<string, (result: PermissionResult) => void>();

export function getSession(): Session | null {
  return currentSession;
}

export function abortCurrentSession(): void {
  if (currentSession) {
    currentSession.abortController.abort();
    currentSession = null;
  }
}

export function resolvePermission(requestId: string, approved: boolean): boolean {
  const resolver = permissionResolvers.get(requestId);
  if (!resolver) return false;

  if (approved) {
    resolver({ behavior: "allow", updatedInput: {} });
  } else {
    resolver({ behavior: "deny", message: "User denied this action", interrupt: true });
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
  onPermission: (permission: PendingPermission) => void;
  onDone: (sessionId: string | null) => void;
  onError: (error: string) => void;
}

export async function executeChat(
  message: string,
  repoId: string,
  repoPath: string,
  resumeSessionId: string | null,
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

  try {
    const stream = query({
      prompt: message,
      options: {
        cwd: repoPath,
        abortController,
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        permissionMode: "default",
        canUseTool: async (toolName, input, { signal }) => {
          return new Promise<PermissionResult>((resolve) => {
            const requestId = randomUUID();
            const permission: PendingPermission = {
              requestId,
              toolName,
              toolInput: input,
            };
            session.pendingPermission = permission;
            permissionResolvers.set(requestId, resolve);
            callbacks.onPermission(permission);

            // Auto-resolve if aborted
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
      }

      if (msg.type === "assistant") {
        const content = msg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if ("text" in block && typeof block.text === "string") {
              callbacks.onText(block.text);
            } else if ("type" in block && block.type === "tool_use") {
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

    callbacks.onDone(session.sessionId);
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      callbacks.onDone(session.sessionId);
    } else {
      callbacks.onError(err.message ?? String(err));
    }
  }
}
