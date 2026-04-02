import { Box, Button, CircularProgress, Typography } from "@mui/material";
import type { GitCommitSummary } from "../../hooks/useGitHistory";

interface Props {
  commits: GitCommitSummary[];
  selectedHash: string | null;
  hasMore: boolean;
  loading: boolean;
  loadMoreLoading: boolean;
  onSelect: (hash: string) => void;
  onLoadMore: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 30) return `${diffDay}日前`;
  // それ以上は日付表示
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export default function GitCommitList({
  commits,
  selectedHash,
  hasMore,
  loading,
  loadMoreLoading,
  onSelect,
  onLoadMore,
}: Props) {
  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (commits.length === 0) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, p: 3 }}>
        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>コミット履歴がありません</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {commits.map((commit) => (
          <Box
            key={commit.hash}
            onClick={() => onSelect(commit.hash)}
            sx={(theme) => ({
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
              px: 1.5,
              py: 1,
              cursor: "pointer",
              bgcolor: selectedHash === commit.hash ? theme.palette.accent.soft : "transparent",
              "&:hover": {
                bgcolor: selectedHash === commit.hash
                  ? theme.palette.accent.soft
                  : theme.palette.bgSecondary,
              },
              borderBottom: `1px solid ${theme.palette.border}`,
            })}
          >
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {commit.message}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                {commit.author}
              </Typography>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                {formatRelativeTime(commit.date)}
              </Typography>
            </Box>
          </Box>
        ))}

        {/* さらに読み込むボタン */}
        {hasMore && (
          <Box sx={{ p: 1.5 }}>
            <Button
              size="small"
              fullWidth
              disabled={loadMoreLoading}
              onClick={onLoadMore}
              sx={(theme) => ({
                textTransform: "none",
                fontSize: 12,
                fontWeight: 500,
                color: theme.palette.text.secondary,
                borderColor: theme.palette.border,
                "&:hover": {
                  bgcolor: theme.palette.bgSecondary,
                },
              })}
              variant="outlined"
            >
              {loadMoreLoading ? (
                <CircularProgress size={14} sx={{ mr: 1 }} />
              ) : null}
              さらに読み込む
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
