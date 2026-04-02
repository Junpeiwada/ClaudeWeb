import { useState } from "react";
import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import type { GitCommitDetail as CommitDetail } from "../../hooks/useGitHistory";

interface Props {
  commit: CommitDetail | null;
  loading: boolean;
  selectedHash: string | null;
  onBack?: () => void;
}

interface FileDiff {
  fileName: string;
  status: string;
  lines: string[];
}

const STATUS_COLORS: Record<string, string> = {
  M: "#ED6C02",
  A: "#2E7D32",
  D: "#D32F2F",
  R: "#1976D2",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** diffテキストをファイル単位に分割する */
function splitDiffByFile(
  diff: string,
  files: Array<{ path: string; status: string }>,
): FileDiff[] {
  const allLines = diff.split("\n");
  const fileDiffs: FileDiff[] = [];
  let current: { lines: string[]; header: string } | null = null;

  for (const line of allLines) {
    if (line.startsWith("diff --git")) {
      if (current) {
        fileDiffs.push(resolveFileDiff(current.header, current.lines, files));
      }
      current = { header: line, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    fileDiffs.push(resolveFileDiff(current.header, current.lines, files));
  }

  return fileDiffs;
}

function resolveFileDiff(
  header: string,
  lines: string[],
  files: Array<{ path: string; status: string }>,
): FileDiff {
  // "diff --git a/path b/path" からパスを抽出
  const match = header.match(/^diff --git a\/.+ b\/(.+)$/);
  const fileName = match ? match[1] : header;
  const fileInfo = files.find((f) => f.path === fileName);
  return {
    fileName,
    status: fileInfo?.status ?? "M",
    lines,
  };
}

/** 追加行・削除行の数をカウント */
function countChanges(lines: string[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++ ")) additions++;
    else if (line.startsWith("-") && !line.startsWith("--- ")) deletions++;
  }
  return { additions, deletions };
}

export default function GitCommitDetail({ commit, loading, selectedHash, onBack }: Props) {
  if (!selectedHash) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>コミットを選択してください</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {onBack && <DetailHeader onBack={onBack} />}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <CircularProgress size={24} />
        </Box>
      </Box>
    );
  }

  if (!commit) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {onBack && <DetailHeader onBack={onBack} />}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>コミット情報を取得できませんでした</Typography>
        </Box>
      </Box>
    );
  }

  const fileDiffs = splitDiffByFile(commit.diff, commit.files);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {onBack && <DetailHeader onBack={onBack} />}

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {/* コミット情報ヘッダー */}
        <Box
          sx={(theme) => ({
            p: 2,
            borderBottom: `1px solid ${theme.palette.border}`,
          })}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5, whiteSpace: "pre-wrap" }}>
            {commit.message}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              {commit.author}
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: "text.secondary",
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
              }}
            >
              {commit.hash.slice(0, 7)}
            </Typography>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              {formatDate(commit.date)}
            </Typography>
          </Box>
        </Box>

        {/* ファイルごとのDiffアコーディオン */}
        {fileDiffs.map((fileDiff) => (
          <FileDiffAccordion key={fileDiff.fileName} fileDiff={fileDiff} />
        ))}
      </Box>
    </Box>
  );
}

function FileDiffAccordion({ fileDiff }: { fileDiff: FileDiff }) {
  const [open, setOpen] = useState(false);
  const { additions, deletions } = countChanges(fileDiff.lines);

  return (
    <Box sx={(theme) => ({ borderBottom: `1px solid ${theme.palette.border}` })}>
      {/* ファイルヘッダー（クリックで開閉） */}
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          cursor: "pointer",
          bgcolor: theme.palette.bgSecondary,
          "&:hover": { opacity: 0.85 },
          userSelect: "none",
        })}
      >
        {open ? (
          <ExpandMoreRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        ) : (
          <ChevronRightRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        )}
        <Box
          sx={{
            width: 16,
            height: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "3px",
            fontSize: 9,
            fontWeight: 700,
            color: "#fff",
            bgcolor: STATUS_COLORS[fileDiff.status] ?? "#9E9E9E",
            flexShrink: 0,
          }}
        >
          {fileDiff.status}
        </Box>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {fileDiff.fileName}
        </Typography>
        {/* 追加・削除行数 */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
          {additions > 0 && (
            <Typography sx={{ fontSize: 11, color: "#2E7D32", fontWeight: 600 }}>
              +{additions}
            </Typography>
          )}
          {deletions > 0 && (
            <Typography sx={{ fontSize: 11, color: "#D32F2F", fontWeight: 600 }}>
              -{deletions}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Diff本体 */}
      {open && (
        <Box
          sx={{
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {fileDiff.lines.map((line, i) => {
            let bgcolor = "transparent";
            let color = "text.primary";

            if (line.startsWith("+++ ") || line.startsWith("--- ")) {
              color = "text.secondary";
            } else if (line.startsWith("+")) {
              bgcolor = "rgba(46, 125, 50, 0.08)";
              color = "#2E7D32";
            } else if (line.startsWith("-")) {
              bgcolor = "rgba(211, 47, 47, 0.08)";
              color = "#D32F2F";
            } else if (line.startsWith("@@")) {
              bgcolor = "rgba(25, 118, 210, 0.08)";
              color = "#1976D2";
            }

            return (
              <Box
                key={i}
                sx={{
                  px: 2,
                  bgcolor,
                  color,
                  whiteSpace: "pre",
                  minHeight: "1.6em",
                }}
              >
                {line || " "}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function DetailHeader({ onBack }: { onBack: () => void }) {
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderBottom: `1px solid ${theme.palette.border}`,
        flexShrink: 0,
      })}
    >
      <IconButton size="small" onClick={onBack} sx={{ p: 0.5 }}>
        <ArrowBackRoundedIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
        コミット一覧に戻る
      </Typography>
    </Box>
  );
}
