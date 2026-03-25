import { useState } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import RepoSelector from "./RepoSelector";

interface Props {
  repoId: string;
  onRepoChange: (id: string) => void;
  onNewChat: () => void;
  sessionId?: string | null;
  autoEdit: boolean;
  onAutoEditChange: (value: boolean) => void;
}

export default function Header({ repoId, onRepoChange, onNewChat, sessionId, autoEdit, onAutoEditChange }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopySession = async () => {
    if (!sessionId) return;
    const command = `claude --resume ${sessionId}`;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: { xs: 2, sm: 3 },
        py: 1.5,
        borderBottom: "1px solid var(--color-border)",
        bgcolor: "var(--color-surface)",
        flexShrink: 0,
      }}
    >
      {/* Logo / Title */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "var(--radius-sm)",
            background: "linear-gradient(135deg, #C96442 0%, #D4845E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            C
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
            display: { xs: "none", sm: "block" },
          }}
        >
          ClaudeWeb
        </Typography>
      </Box>

      <Box sx={{ flex: 1 }} />

      {/* Repo Selector */}
      <RepoSelector value={repoId} onChange={onRepoChange} />

      {/* Auto Edit Toggle */}
      <Tooltip title={autoEdit ? "Auto Edit: ON" : "Auto Edit: OFF"} arrow>
        <Box
          onClick={() => onAutoEditChange(!autoEdit)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            color: autoEdit ? "var(--color-accent)" : "var(--color-text-tertiary)",
            border: "1px solid",
            borderColor: autoEdit ? "var(--color-accent)" : "var(--color-border)",
            borderRadius: "var(--radius-sm)",
            height: 34,
            px: 1.2,
            cursor: "pointer",
            transition: "all 0.15s ease",
            userSelect: "none",
            bgcolor: autoEdit ? "var(--color-accent-soft)" : "transparent",
            "&:hover": {
              bgcolor: "var(--color-accent-soft)",
              borderColor: "var(--color-accent)",
              color: "var(--color-accent)",
            },
          }}
        >
          <EditRoundedIcon sx={{ fontSize: 16 }} />
          <Typography
            sx={{
              fontSize: "12px",
              fontWeight: 500,
              lineHeight: 1,
              display: { xs: "none", sm: "block" },
            }}
          >
            Auto
          </Typography>
        </Box>
      </Tooltip>

      {/* Copy Session Button */}
      {sessionId && (
        <Tooltip title={copied ? "Copied!" : "Copy resume command"} arrow>
          <Box
            onClick={handleCopySession}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              color: copied ? "var(--color-accent)" : "var(--color-text-tertiary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              height: 34,
              px: 1.2,
              cursor: "pointer",
              transition: "all 0.15s ease",
              userSelect: "none",
              "&:hover": {
                bgcolor: "var(--color-accent-soft)",
                borderColor: "var(--color-accent)",
                color: "var(--color-accent)",
              },
            }}
          >
            {copied ? (
              <CheckRoundedIcon sx={{ fontSize: 16 }} />
            ) : (
              <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
            )}
            <Typography
              sx={{
                fontSize: "12px",
                fontWeight: 500,
                lineHeight: 1,
                display: { xs: "none", sm: "block" },
              }}
            >
              {copied ? "Copied" : "Resume"}
            </Typography>
          </Box>
        </Tooltip>
      )}

      {/* New Chat Button */}
      <Box
        onClick={onNewChat}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          height: 34,
          px: 1.2,
          cursor: "pointer",
          transition: "all 0.15s ease",
          userSelect: "none",
          "&:hover": {
            bgcolor: "var(--color-accent-soft)",
            borderColor: "var(--color-accent)",
            color: "var(--color-accent)",
          },
        }}
      >
        <AddRoundedIcon sx={{ fontSize: 18 }} />
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          New
        </Typography>
      </Box>
    </Box>
  );
}
