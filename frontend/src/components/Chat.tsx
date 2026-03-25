import { Box } from "@mui/material";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import ActivityIndicator from "./ActivityIndicator";
import PermissionDialog from "./PermissionDialog";
import { useChat } from "../hooks/useChat";

interface Props {
  repoId: string;
}

export default function Chat({ repoId }: Props) {
  const {
    messages,
    isLoading,
    activity,
    pendingPermission,
    sendMessage,
    respondPermission,
  } = useChat();

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
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Bottom section: activity + input */}
      <Box
        sx={{
          flexShrink: 0,
          width: "100%",
          maxWidth: "var(--max-width)",
          mx: "auto",
          px: { xs: 1, sm: 2 },
          pb: { xs: 1.5, sm: 2 },
        }}
      >
        <ActivityIndicator activity={activity} />
        <MessageInput
          onSend={(msg) => sendMessage(msg, repoId)}
          disabled={isLoading || !repoId || !!pendingPermission}
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
