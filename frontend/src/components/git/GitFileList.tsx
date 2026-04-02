import { Box, Checkbox, Typography } from "@mui/material";
import type { GitFile } from "../../hooks/useGitStatus";

interface Props {
  files: GitFile[];
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  onStage: (files: string[]) => void;
  onUnstage: (files: string[]) => void;
}

const STATUS_COLORS: Record<string, string> = {
  M: "#ED6C02",  // オレンジ
  A: "#2E7D32",  // 緑
  D: "#D32F2F",  // 赤
  R: "#1976D2",  // 青
  "?": "#9E9E9E", // グレー
};

export default function GitFileList({ files, selectedFile, onSelectFile, onStage, onUnstage }: Props) {
  const allStaged = files.length > 0 && files.every((f) => f.staged);
  const noneStaged = files.every((f) => !f.staged);
  const stagedCount = files.filter((f) => f.staged).length;

  const handleToggleAll = () => {
    if (allStaged) {
      // 未追跡ファイルは unstage できないのでフィルタ
      const stageable = files.filter((f) => f.status !== "?").map((f) => f.path);
      if (stageable.length > 0) onUnstage(stageable);
    } else {
      const unstageable = files.filter((f) => !f.staged).map((f) => f.path);
      if (unstageable.length > 0) onStage(unstageable);
    }
  };

  const handleToggle = (file: GitFile) => {
    if (file.staged) {
      onUnstage([file.path]);
    } else {
      onStage([file.path]);
    }
  };

  if (files.length === 0) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, p: 3 }}>
        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>変更はありません</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* ヘッダー: 全選択 */}
      <Box
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          px: 1,
          py: 0.5,
          borderBottom: `1px solid ${theme.palette.border}`,
          flexShrink: 0,
        })}
      >
        <Checkbox
          size="small"
          checked={allStaged}
          indeterminate={!allStaged && !noneStaged}
          onChange={handleToggleAll}
          sx={{ p: 0.5 }}
        />
        <Typography sx={{ fontSize: 11, color: "text.secondary", ml: 0.5 }}>
          {stagedCount}/{files.length} ファイル
        </Typography>
      </Box>

      {/* ファイル一覧 */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {files.map((file) => (
          <Box
            key={file.path}
            onClick={() => onSelectFile(file.path)}
            sx={(theme) => ({
              display: "flex",
              alignItems: "center",
              px: 1,
              py: 0.5,
              cursor: "pointer",
              bgcolor: selectedFile === file.path ? theme.palette.accent.soft : "transparent",
              "&:hover": {
                bgcolor: selectedFile === file.path
                  ? theme.palette.accent.soft
                  : theme.palette.bgSecondary,
              },
            })}
          >
            <Checkbox
              size="small"
              checked={file.staged}
              onClick={(e) => e.stopPropagation()}
              onChange={() => handleToggle(file)}
              sx={{ p: 0.5 }}
            />
            <Box
              sx={{
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "3px",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                bgcolor: STATUS_COLORS[file.status] ?? "#9E9E9E",
                flexShrink: 0,
                mx: 0.5,
              }}
            >
              {file.status}
            </Box>
            <Typography
              sx={{
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                ml: 0.5,
              }}
            >
              {file.path}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
