import { useState, useCallback } from "react";
import { Box, CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import Chat from "./components/Chat";
import FileExplorer from "./components/FileExplorer";
import Header from "./components/Header";
import type { Message } from "./hooks/useChat";

const theme = createTheme({
  palette: {
    primary: { main: "#C96442" },
    background: {
      default: "#FAF9F7",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#2D2B28",
      secondary: "#8C8985",
    },
  },
  typography: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#FAF9F7",
        },
      },
    },
  },
});

export default function App() {
  const [repoId, setRepoId] = useState("");
  const [chatKey, setChatKey] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [initialSessionId, setInitialSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "files">("chat");
  const [autoEdit, setAutoEdit] = useState(
    () => localStorage.getItem("claudeweb-auto-edit") !== "false"
  );

  const handleAutoEditChange = (value: boolean) => {
    setAutoEdit(value);
    localStorage.setItem("claudeweb-auto-edit", String(value));
  };

  const handleRepoChange = useCallback((newRepoId: string) => {
    setRepoId(newRepoId);
    // リポジトリ変更時にセッション関連の状態をリセット
    setSessionId(null);
    setInitialMessages([]);
    setInitialSessionId(null);
    setChatKey((k) => k + 1);
  }, []);

  const handleResumeSession = useCallback(
    async (selectedSessionId: string) => {
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(repoId)}/${selectedSessionId}/messages`
        );
        if (!res.ok) throw new Error();
        const messages: Message[] = await res.json();
        setInitialMessages(messages);
        setInitialSessionId(selectedSessionId);
        setSessionId(selectedSessionId);
        setChatKey((k) => k + 1);
      } catch {
        setInitialMessages([]);
        setInitialSessionId(selectedSessionId);
        setSessionId(selectedSessionId);
        setChatKey((k) => k + 1);
      }
      setActiveTab("chat");
    },
    [repoId]
  );

  const handleNewChat = useCallback(() => {
    setInitialMessages([]);
    setInitialSessionId(null);
    setSessionId(null);
    setChatKey((k) => k + 1);
    setActiveTab("chat");
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Header
        repoId={repoId}
        onRepoChange={handleRepoChange}
        onNewChat={handleNewChat}
        onResumeSession={handleResumeSession}
        sessionId={sessionId}
        autoEdit={autoEdit}
        onAutoEditChange={handleAutoEditChange}
      />

      {/* Tab Bar */}
      <Box
        sx={{
          display: "flex",
          borderBottom: "1px solid var(--color-border)",
          bgcolor: "var(--color-surface)",
          flexShrink: 0,
          px: { xs: 1, sm: 2 },
        }}
      >
        {([
          { key: "chat" as const, label: "チャット", icon: <ChatRoundedIcon sx={{ fontSize: 18 }} /> },
          { key: "files" as const, label: "ファイル", icon: <FolderRoundedIcon sx={{ fontSize: 18 }} /> },
        ]).map((tab) => (
          <Box
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: { xs: 1.5, sm: 2 },
              py: 1,
              cursor: "pointer",
              userSelect: "none",
              fontSize: "13px",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "var(--color-accent)" : "var(--color-text-secondary)",
              borderBottom: "2px solid",
              borderColor: activeTab === tab.key ? "var(--color-accent)" : "transparent",
              transition: "all 0.15s ease",
              "&:hover": {
                color: "var(--color-accent)",
              },
            }}
          >
            {tab.icon}
            {tab.label}
          </Box>
        ))}
      </Box>

      {/* Content */}
      <Box sx={{ display: activeTab === "chat" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <Chat
          key={`${repoId}-${chatKey}`}
          repoId={repoId}
          autoEdit={autoEdit}
          onSessionIdChange={setSessionId}
          initialMessages={initialMessages}
          initialSessionId={initialSessionId}
        />
      </Box>
      <Box sx={{ display: activeTab === "files" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <FileExplorer repoId={repoId} onSwitchToChat={() => setActiveTab("chat")} />
      </Box>
    </ThemeProvider>
  );
}
