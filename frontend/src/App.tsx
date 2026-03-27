import { useState, useCallback } from "react";
import { Box, CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import Chat from "./components/Chat";
import FileExplorer from "./components/FileExplorer";
import Header from "./components/Header";
import type { Message } from "./hooks/useChat";

// MUIカスタムパレット型拡張
declare module "@mui/material/styles" {
  interface Palette {
    accent: {
      main: string;
      soft: string;
      hover: string;
      gradient: string;
    };
    border: string;
    userBubble: string;
    codeBg: string;
    bgSecondary: string;
    textTertiary: string;
    onAccent: string;
    error2: {
      main: string;
      light: string;
      border: string;
      bg: string;
    };
    fileIcon: {
      folder: string;
      image: string;
      code: string;
      doc: string;
    };
  }
  interface PaletteOptions {
    accent?: {
      main?: string;
      soft?: string;
      hover?: string;
      gradient?: string;
    };
    border?: string;
    userBubble?: string;
    codeBg?: string;
    bgSecondary?: string;
    textTertiary?: string;
    onAccent?: string;
    error2?: {
      main?: string;
      light?: string;
      border?: string;
      bg?: string;
    };
    fileIcon?: {
      folder?: string;
      image?: string;
      code?: string;
      doc?: string;
    };
  }
}

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
    accent: {
      main: "#C96442",
      soft: "rgba(201, 100, 66, 0.08)",
      hover: "#B5593A",
      gradient: "linear-gradient(135deg, #C96442 0%, #D4845E 100%)",
    },
    border: "#E8E6E3",
    userBubble: "#EDE9E3",
    codeBg: "#F0EDE8",
    bgSecondary: "#F3F1EE",
    textTertiary: "#B0ADA9",
    onAccent: "#FFFFFF",
    error2: {
      main: "#9F3E3E",
      light: "rgba(180, 87, 87, 0.24)",
      border: "#EF4444",
      bg: "#FEF2F2",
    },
    fileIcon: {
      folder: "#FFA726",
      image: "#66BB6A",
      code: "#42A5F5",
      doc: "#AB47BC",
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
  const loadAutoEditPreference = () => {
    const currentValue = localStorage.getItem("agent-nest-auto-edit");
    if (currentValue !== null) return currentValue !== "false";

    const legacyValue = localStorage.getItem("claudeweb-auto-edit");
    if (legacyValue !== null) {
      localStorage.setItem("agent-nest-auto-edit", legacyValue);
      localStorage.removeItem("claudeweb-auto-edit");
      return legacyValue !== "false";
    }

    return true;
  };

  const [repoId, setRepoId] = useState("");
  const [chatKey, setChatKey] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [initialSessionId, setInitialSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "files">("chat");
  const [autoEdit, setAutoEdit] = useState(loadAutoEditPreference);

  const handleAutoEditChange = (value: boolean) => {
    setAutoEdit(value);
    localStorage.setItem("agent-nest-auto-edit", String(value));
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
        sx={(theme) => ({
          display: "flex",
          borderBottom: `1px solid ${theme.palette.border}`,
          bgcolor: "background.paper",
          flexShrink: 0,
          px: { xs: 1, sm: 2 },
        })}
      >
        {([
          { key: "chat" as const, label: "チャット", icon: <ChatRoundedIcon sx={{ fontSize: 18 }} /> },
          { key: "files" as const, label: "ファイル", icon: <FolderRoundedIcon sx={{ fontSize: 18 }} /> },
        ]).map((tab) => (
          <Box
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            sx={(theme) => ({
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: { xs: 1.5, sm: 2 },
              py: 1,
              cursor: "pointer",
              userSelect: "none",
              fontSize: "13px",
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? theme.palette.accent.main : theme.palette.text.secondary,
              borderBottom: "2px solid",
              borderColor: activeTab === tab.key ? theme.palette.accent.main : "transparent",
              transition: "all 0.15s ease",
              "&:hover": {
                color: theme.palette.accent.main,
              },
            })}
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
