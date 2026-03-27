import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, useParams, useOutletContext } from "react-router-dom";
import { Box } from "@mui/material";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import Chat from "../components/Chat";
import type { Message } from "../hooks/useChat";

interface ParentContext {
  autoEdit: boolean;
  newChatNonce: number;
  resumeSessionId: string | null;
}

interface FetchedSession {
  sessionId: string;
  messages: Message[];
}

export default function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { repo } = useParams<{ repo: string }>();
  const repoId = repo ?? "";
  const { autoEdit, newChatNonce, resumeSessionId } = useOutletContext<ParentContext>();

  const isFilesTab = location.pathname.includes("/files");
  const activeTab = isFilesTab ? "files" : "chat";

  // --- Chat state（常にマウント）---
  const [fetchedSession, setFetchedSession] = useState<FetchedSession | null>(null);

  // セッション復帰: resumeSessionId（stateで管理）が変わった場合のみメッセージ履歴をfetch
  useEffect(() => {
    if (!resumeSessionId) return;

    let cancelled = false;
    fetch(`/api/sessions/${encodeURIComponent(repoId)}/${resumeSessionId}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((messages: Message[]) => {
        if (!cancelled) {
          setFetchedSession({ sessionId: resumeSessionId, messages });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedSession({ sessionId: resumeSessionId, messages: [] });
        }
      });

    return () => { cancelled = true; };
  }, [resumeSessionId, repoId]);

  // chatKey: URLからではなく、明示的アクションのstateから算出
  const initialMessages = resumeSessionId ? (fetchedSession?.messages ?? []) : [];
  const initialSessionId = resumeSessionId ? (fetchedSession?.sessionId ?? null) : null;
  const chatReady = !resumeSessionId || fetchedSession?.sessionId === resumeSessionId;
  const chatKey = resumeSessionId
    ? `session:${fetchedSession?.sessionId ?? "loading"}`
    : `new:${repoId}:${newChatNonce}`;

  // --- Tabs ---
  const tabs = [
    { key: "chat" as const, label: "チャット", icon: <ChatRoundedIcon sx={{ fontSize: 18 }} /> },
    { key: "files" as const, label: "ファイル", icon: <FolderRoundedIcon sx={{ fontSize: 18 }} /> },
  ];

  const handleTabClick = (tabKey: "chat" | "files") => {
    if (tabKey === "files") {
      navigate(`/${encodeURIComponent(repoId)}/files`);
    } else {
      // チャットタブ: 現在のチャット状態を維持したままURLだけ戻す（再マウントしない）
      const chatUrl = resumeSessionId
        ? `/${encodeURIComponent(repoId)}/chat/${encodeURIComponent(resumeSessionId)}`
        : `/${encodeURIComponent(repoId)}/chat`;
      navigate(chatUrl);
    }
  };

  return (
    <>
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
        {tabs.map((tab) => (
          <Box
            key={tab.key}
            onClick={() => handleTabClick(tab.key)}
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

      {/* Chat（常にマウント、display で切り替え） */}
      <Box sx={{ display: activeTab === "chat" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {chatReady && (
          <Chat
            key={chatKey}
            repoId={repoId}
            autoEdit={autoEdit}
            onSessionIdChange={(sessionId) => {
              // URL同期: replaceStateでReact Routerの再レンダリングを起こさない
              if (sessionId) {
                const newUrl = `/${encodeURIComponent(repoId)}/chat/${encodeURIComponent(sessionId)}`;
                window.history.replaceState(null, "", newUrl);
              }
            }}
            initialMessages={initialMessages}
            initialSessionId={initialSessionId}
            resetNonce={newChatNonce}
          />
        )}
      </Box>

      {/* Files（Outlet 経由、display で切り替え） */}
      <Box sx={{ display: activeTab === "files" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <Outlet context={{ autoEdit }} />
      </Box>
    </>
  );
}
