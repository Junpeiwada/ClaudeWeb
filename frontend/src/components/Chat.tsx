import { useRef, useCallback, useEffect } from "react";
import { Box } from "@mui/material";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import ActivityIndicator from "./ActivityIndicator";
import PermissionDialog from "./PermissionDialog";
import QuestionDialog from "./QuestionDialog";
import { useChat } from "../hooks/useChat";
import { useWakeLock } from "../hooks/useWakeLock";
import type { Message } from "../hooks/useChat";

interface Props {
  repoId: string;
  autoEdit: boolean;
  onSessionIdChange?: (sessionId: string | null) => void;
  initialMessages?: Message[];
  initialSessionId?: string | null;
  resetNonce?: number;
  visible?: boolean;
}

export default function Chat({ repoId, autoEdit, onSessionIdChange, initialMessages, initialSessionId, resetNonce, visible }: Props) {
  const conversationKey = initialSessionId != null
    ? `session:${initialSessionId}`
    : `new:${resetNonce ?? 0}`;
  const {
    messages,
    isLoading,
    activity,
    sessionId,
    pendingPermission,
    pendingQuestion,
    sendMessage,
    respondPermission,
    respondQuestion,
    stopGeneration,
  } = useChat(initialMessages, initialSessionId, conversationKey);

  // AI応答待ち中はiPhoneのスリープを防止
  useWakeLock(isLoading);

  // sessionId変更時に親に通知
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      onSessionIdChange?.(sessionId);
    }
  }, [sessionId, onSessionIdChange]);

  const handleStop = useCallback(async () => {
    await stopGeneration();
  }, [stopGeneration]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
      <MessageList messages={messages} isLoading={isLoading} repoId={repoId} />

      {/* Bottom section: activity + input */}
      <Box
        sx={{
          flexShrink: 0,
          width: "100%",
          maxWidth: "var(--max-width)",
          mx: "auto",
          px: { xs: 1, sm: 2 },
          pb: {
            xs: "calc(12px + env(safe-area-inset-bottom) * (1 - var(--keyboard-visible, 0)))",
            sm: "calc(16px + env(safe-area-inset-bottom) * (1 - var(--keyboard-visible, 0)))"
          },
          transition: "padding-bottom 0.2s ease",
        }}
      >
        <ActivityIndicator activity={activity} isLoading={isLoading} />
        <MessageInput
          onSend={(msg, images) => sendMessage(msg, repoId, autoEdit, images)}
          onStop={handleStop}
          disabled={!repoId || !!pendingPermission || !!pendingQuestion}
          isLoading={isLoading}
          visible={visible}
        />
      </Box>

      {pendingPermission && (
        <PermissionDialog
          permission={pendingPermission}
          onRespond={respondPermission}
        />
      )}

      {pendingQuestion && (
        <QuestionDialog
          question={pendingQuestion}
          onRespond={respondQuestion}
        />
      )}
    </Box>
  );
}
