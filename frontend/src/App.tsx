import { useState } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import Chat from "./components/Chat";
import Header from "./components/Header";

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
  const [autoEdit, setAutoEdit] = useState(
    () => localStorage.getItem("claudeweb-auto-edit") !== "false"
  );

  const handleAutoEditChange = (value: boolean) => {
    setAutoEdit(value);
    localStorage.setItem("claudeweb-auto-edit", String(value));
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Header
        repoId={repoId}
        onRepoChange={setRepoId}
        onNewChat={() => {
          setChatKey((k) => k + 1);
          setSessionId(null);
        }}
        sessionId={sessionId}
        autoEdit={autoEdit}
        onAutoEditChange={handleAutoEditChange}
      />
      <Chat
        key={`${repoId}-${chatKey}`}
        repoId={repoId}
        autoEdit={autoEdit}
        onSessionIdChange={setSessionId}
      />
    </ThemeProvider>
  );
}
