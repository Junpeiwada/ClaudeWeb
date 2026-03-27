import { useState, useCallback } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import { theme } from "../theme";
import Header from "../components/Header";

export default function MinimalLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // URLの最初のセグメントからリポジトリ名を取得
  const firstSegment = location.pathname.split("/")[1] ?? "";
  const repoId = firstSegment ? decodeURIComponent(firstSegment) : "";

  const [autoEdit, setAutoEdit] = useState(() => {
    const currentValue = localStorage.getItem("agent-nest-auto-edit");
    if (currentValue !== null) return currentValue !== "false";
    const legacyValue = localStorage.getItem("claudeweb-auto-edit");
    if (legacyValue !== null) {
      localStorage.setItem("agent-nest-auto-edit", legacyValue);
      localStorage.removeItem("claudeweb-auto-edit");
      return legacyValue !== "false";
    }
    return true;
  });
  const [newChatNonce, setNewChatNonce] = useState(0);
  // 履歴から選択されたセッションID（URLではなくstateで管理）
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);

  const handleAutoEditChange = (value: boolean) => {
    setAutoEdit(value);
    localStorage.setItem("agent-nest-auto-edit", String(value));
  };

  const handleRepoChange = useCallback((newRepoId: string) => {
    setResumeSessionId(null);
    setNewChatNonce((n) => n + 1);
    navigate(`/${encodeURIComponent(newRepoId)}/chat`);
  }, [navigate]);

  const handleNewChat = useCallback(() => {
    setResumeSessionId(null);
    setNewChatNonce((n) => n + 1);
    if (repoId) {
      navigate(`/${encodeURIComponent(repoId)}/chat`);
    } else {
      navigate("/");
    }
  }, [navigate, repoId]);

  const handleResumeSession = useCallback((sessionId: string) => {
    if (repoId) {
      setResumeSessionId(sessionId);
      navigate(`/${encodeURIComponent(repoId)}/chat/${sessionId}`);
    }
  }, [navigate, repoId]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Header
        repoId={repoId}
        onRepoChange={handleRepoChange}
        onNewChat={handleNewChat}
        onResumeSession={handleResumeSession}
        autoEdit={autoEdit}
        onAutoEditChange={handleAutoEditChange}
      />
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <Outlet context={{ autoEdit, newChatNonce, resumeSessionId }} />
      </Box>
    </ThemeProvider>
  );
}
