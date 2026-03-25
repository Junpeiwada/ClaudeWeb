import { Box, IconButton, Typography } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RepoSelector from "./RepoSelector";

interface Props {
  repoId: string;
  onRepoChange: (id: string) => void;
  onNewChat: () => void;
}

export default function Header({ repoId, onRepoChange, onNewChat }: Props) {
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

      {/* New Chat Button */}
      <IconButton
        onClick={onNewChat}
        size="small"
        sx={{
          color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          width: 34,
          height: 34,
          transition: "all 0.15s ease",
          "&:hover": {
            bgcolor: "var(--color-accent-soft)",
            borderColor: "var(--color-accent)",
            color: "var(--color-accent)",
          },
        }}
      >
        <AddRoundedIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  );
}
