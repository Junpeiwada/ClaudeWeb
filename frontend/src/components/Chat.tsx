import { useRef, useCallback } from "react";
import { Box } from "@mui/material";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import ActivityIndicator from "./ActivityIndicator";
import PermissionDialog from "./PermissionDialog";
import { useChat } from "../hooks/useChat";
import type { Message, ImageAttachment } from "../hooks/useChat";

interface Props {
  repoId: string;
  autoEdit: boolean;
  onSessionIdChange?: (sessionId: string | null) => void;
  initialMessages?: Message[];
  initialSessionId?: string | null;
}

export default function Chat({ repoId, autoEdit, onSessionIdChange, initialMessages, initialSessionId }: Props) {
  const {
    messages,
    isLoading,
    activity,
    sessionId,
    pendingPermission,
    sendMessage,
    respondPermission,
  } = useChat(initialMessages, initialSessionId);

  // sessionId変更時に親に通知
  const prevSessionIdRef = useRef(sessionId);
  if (prevSessionIdRef.current !== sessionId) {
    prevSessionIdRef.current = sessionId;
    onSessionIdChange?.(sessionId);
  }

  const handleStop = useCallback(async () => {
    await fetch("/api/interrupt", { method: "POST" });
  }, []);

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
          pb: { xs: "calc(12px + env(safe-area-inset-bottom))", sm: "calc(16px + env(safe-area-inset-bottom))" },
        }}
      >
        <ActivityIndicator activity={activity} isLoading={isLoading} />
        <MessageInput
          onSend={(msg, images) => sendMessage(msg, repoId, autoEdit, images)}
          onStop={handleStop}
          disabled={isLoading || !repoId || !!pendingPermission}
          isLoading={isLoading}
        />
      </Box>

      {pendingPermission && (
        <PermissionDialog
          permission={pendingPermission}
          onRespond={respondPermission}
        />
      )}
    </Box>
  );
}
