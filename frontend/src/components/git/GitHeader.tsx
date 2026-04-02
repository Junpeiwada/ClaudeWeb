import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CallSplitRoundedIcon from "@mui/icons-material/CallSplitRounded";
import type { GitStatus } from "../../hooks/useGitStatus";

interface Props {
  status: GitStatus | null;
  loading: boolean;
  operationLoading: boolean;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
}

export default function GitHeader({ status, loading, operationLoading, onFetch, onPull, onPush }: Props) {
  const disabled = loading || operationLoading;

  // ボタンの表示を状態に応じて切り替え
  let buttonLabel = "Fetch origin";
  let buttonAction = onFetch;

  if (status) {
    if (status.behind > 0) {
      buttonLabel = `Pull origin (${status.behind})`;
      buttonAction = onPull;
    } else if (status.ahead > 0) {
      buttonLabel = `Push origin (${status.ahead})`;
      buttonAction = onPush;
    }
  }

  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 2,
        py: 1,
        borderBottom: `1px solid ${theme.palette.border}`,
        bgcolor: "background.paper",
        flexShrink: 0,
      })}
    >
      {/* ブランチ名 */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
        <CallSplitRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {status?.branch ?? "..."}
        </Typography>
      </Box>

      {/* Fetch / Pull / Push ボタン */}
      <Button
        size="small"
        variant="outlined"
        disabled={disabled}
        onClick={buttonAction}
        sx={(theme) => ({
          textTransform: "none",
          fontSize: 12,
          fontWeight: 500,
          borderColor: theme.palette.border,
          color: theme.palette.text.primary,
          minWidth: 120,
          "&:hover": {
            borderColor: theme.palette.accent.main,
            bgcolor: theme.palette.accent.soft,
          },
        })}
      >
        {operationLoading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
        {buttonLabel}
      </Button>
    </Box>
  );
}
