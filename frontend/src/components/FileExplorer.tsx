import { useState, useEffect, useCallback } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  CircularProgress,
  Breadcrumbs,
  Link,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import InsertDriveFileRoundedIcon from "@mui/icons-material/InsertDriveFileRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import FileViewer from "./FileViewer";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
}

interface Props {
  repoId: string;
  onSwitchToChat: () => void;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".cpp", ".c", ".rs", ".go", ".rb", ".swift", ".html", ".css", ".scss", ".json", ".yaml", ".yml", ".toml", ".sh"]);
const DOC_EXT = new Set([".md", ".txt", ".doc", ".rst"]);

function getFileIcon(entry: FileEntry, palette: import("@mui/material").Theme["palette"]) {
  if (entry.type === "directory") return <FolderRoundedIcon sx={{ color: palette.fileIcon.folder }} />;
  const ext = entry.extension || "";
  if (IMAGE_EXT.has(ext)) return <ImageRoundedIcon sx={{ color: palette.fileIcon.image }} />;
  if (CODE_EXT.has(ext)) return <CodeRoundedIcon sx={{ color: palette.fileIcon.code }} />;
  if (DOC_EXT.has(ext)) return <DescriptionRoundedIcon sx={{ color: palette.fileIcon.doc }} />;
  return <InsertDriveFileRoundedIcon sx={{ color: palette.textTertiary }} />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileExplorer({ repoId, onSwitchToChat }: Props) {
  const theme = useTheme();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentDir, setCurrentDir] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const fetchDir = useCallback(async (dir: string) => {
    if (!repoId) return;
    setLoading(true);
    setFetchError(false);
    try {
      const params = dir ? `?dir=${encodeURIComponent(dir)}` : "";
      const res = await fetch(`/api/repos/${encodeURIComponent(repoId)}/files${params}`);
      if (!res.ok) throw new Error();
      const data: FileEntry[] = await res.json();
      setEntries(data);
      setCurrentDir(dir);
    } catch {
      setEntries([]);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    setCurrentDir("");
    setSelectedFile(null);
    if (repoId) fetchDir("");
  }, [repoId, fetchDir]);

  const handleEntryClick = (entry: FileEntry) => {
    if (entry.type === "directory") {
      fetchDir(entry.path);
    } else {
      setSelectedFile(entry.path);
    }
  };

  // パンくずリスト用のパス分解
  const pathParts = currentDir ? currentDir.split("/") : [];

  if (!repoId) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "text.secondary" }}>
        <Typography fontSize="14px">リポジトリを選択してください</Typography>
      </Box>
    );
  }

  // ファイルビューワーが開いている場合
  if (selectedFile) {
    return (
      <FileViewer
        repoId={repoId}
        filePath={selectedFile}
        onClose={() => setSelectedFile(null)}
        onSwitchToChat={onSwitchToChat}
      />
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Breadcrumbs */}
      <Box
        sx={(t) => ({
          display: "flex",
          alignItems: "center",
          px: { xs: 1.5, sm: 2 },
          py: 1,
          borderBottom: `1px solid ${t.palette.border}`,
          bgcolor: "background.paper",
          flexShrink: 0,
          overflow: "auto",
          whiteSpace: "nowrap",
        })}
      >
        <Breadcrumbs
          separator={<ChevronRightRoundedIcon sx={{ fontSize: 16, color: theme.palette.textTertiary }} />}
          sx={{ "& .MuiBreadcrumbs-separator": { mx: 0.25 } }}
        >
          <Link
            component="button"
            underline="hover"
            onClick={() => fetchDir("")}
            sx={{ fontSize: "13px", color: pathParts.length === 0 ? "text.primary" : "text.secondary", fontWeight: pathParts.length === 0 ? 600 : 400 }}
          >
            {repoId}
          </Link>
          {pathParts.map((part, i) => {
            const partPath = pathParts.slice(0, i + 1).join("/");
            const isLast = i === pathParts.length - 1;
            return (
              <Link
                key={partPath}
                component="button"
                underline="hover"
                onClick={() => fetchDir(partPath)}
                sx={{ fontSize: "13px", color: isLast ? "text.primary" : "text.secondary", fontWeight: isLast ? 600 : 400 }}
              >
                {part}
              </Link>
            );
          })}
        </Breadcrumbs>
      </Box>

      {/* File List */}
      <Box sx={{ flex: 1, overflow: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} sx={{ color: theme.palette.accent.main }} />
          </Box>
        ) : entries.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4, color: theme.palette.textTertiary }}>
            <Typography fontSize="13px">
              {fetchError ? "サーバーに接続できません" : "空のディレクトリです"}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {entries.map((entry) => (
              <ListItemButton
                key={entry.path}
                onClick={() => handleEntryClick(entry)}
                sx={(t) => ({
                  py: { xs: 1.25, sm: 0.75 },
                  px: { xs: 1.5, sm: 2 },
                  borderBottom: `1px solid ${t.palette.border}`,
                  "&:hover": { bgcolor: t.palette.accent.soft },
                  "&:active": { bgcolor: t.palette.bgSecondary },
                })}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {getFileIcon(entry, theme.palette)}
                </ListItemIcon>
                <ListItemText
                  primary={entry.name}
                  primaryTypographyProps={{
                    fontSize: { xs: "14px", sm: "13px" },
                    fontWeight: 400,
                    fontFamily: "var(--font-mono)",
                    color: "text.primary",
                  }}
                />
                {entry.type === "file" && entry.size != null && (
                  <Typography sx={{ fontSize: "11px", color: theme.palette.textTertiary, ml: 1, flexShrink: 0 }}>
                    {formatSize(entry.size)}
                  </Typography>
                )}
                {entry.type === "directory" && (
                  <ChevronRightRoundedIcon sx={{ fontSize: 18, color: theme.palette.textTertiary }} />
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}
