import { Box, Typography } from "@mui/material";

export type GitViewMode = "changes" | "history";

interface Props {
  mode: GitViewMode;
  onChange: (mode: GitViewMode) => void;
}

export default function GitSubTabs({ mode, onChange }: Props) {
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        borderBottom: `1px solid ${theme.palette.border}`,
        flexShrink: 0,
      })}
    >
      <TabButton label="Changes" active={mode === "changes"} onClick={() => onChange("changes")} />
      <TabButton label="History" active={mode === "history"} onClick={() => onChange("history")} />
    </Box>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={(theme) => ({
        px: 2,
        py: 1,
        cursor: "pointer",
        borderBottom: active ? `2px solid ${theme.palette.accent.main}` : "2px solid transparent",
        "&:hover": {
          bgcolor: theme.palette.bgSecondary,
        },
      })}
    >
      <Typography
        sx={(theme) => ({
          fontSize: 12,
          fontWeight: active ? 600 : 400,
          color: active ? theme.palette.text.primary : theme.palette.text.secondary,
        })}
      >
        {label}
      </Typography>
    </Box>
  );
}
