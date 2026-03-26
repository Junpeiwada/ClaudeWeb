import { useState, useCallback } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import Chat from "./components/Chat";
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
  const [autoEdit, setAutoEdit] = useState(
    () => localStorage.getItem("claudeweb-auto-edit") !== "false"
  );

  const handleAutoEditChange = (value: boolean) => {
    setAutoEdit(value);
    localStorage.setItem("claudeweb-auto-edit", String(value));
  };

  const handleResumeSession = useCallback(
    async (selectedSessionId: string) => {
      // Fetch past messages for the selected session
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
        // If fetch fails, still open with the session ID (no history shown)
        setInitialMessages([]);
        setInitialSessionId(selectedSessionId);
        setSessionId(selectedSessionId);
        setChatKey((k) => k + 1);
      }
    },
    [repoId]
  );

  const handleNewChat = useCallback(() => {
    setInitialMessages([]);
    setInitialSessionId(null);
    setSessionId(null);
    setChatKey((k) => k + 1);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Header
        repoId={repoId}
        onRepoChange={setRepoId}
        onNewChat={handleNewChat}
        onResumeSession={handleResumeSession}
        sessionId={sessionId}
        autoEdit={autoEdit}
        onAutoEditChange={handleAutoEditChange}
      />
      <Chat
        key={`${repoId}-${chatKey}`}
        repoId={repoId}
        autoEdit={autoEdit}
        onSessionIdChange={setSessionId}
        initialMessages={initialMessages}
        initialSessionId={initialSessionId}
      />
    </ThemeProvider>
  );
}
