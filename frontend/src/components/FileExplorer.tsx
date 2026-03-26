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

function getFileIcon(entry: FileEntry) {
  if (entry.type === "directory") return <FolderRoundedIcon sx={{ color: "#FFA726" }} />;
  const ext = entry.extension || "";
  if (IMAGE_EXT.has(ext)) return <ImageRoundedIcon sx={{ color: "#66BB6A" }} />;
  if (CODE_EXT.has(ext)) return <CodeRoundedIcon sx={{ color: "#42A5F5" }} />;
  if (DOC_EXT.has(ext)) return <DescriptionRoundedIcon sx={{ color: "#AB47BC" }} />;
  return <InsertDriveFileRoundedIcon sx={{ color: "var(--color-text-tertiary)" }} />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileExplorer({ repoId, onSwitchToChat }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentDir, setCurrentDir] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const fetchDir = useCallback(async (dir: string) => {
    if (!repoId) return;
    setLoading(true);
    try {
      const params = dir ? `?dir=${encodeURIComponent(dir)}` : "";
      const res = await fetch(`/api/repos/${encodeURIComponent(repoId)}/files${params}`);
      if (!res.ok) throw new Error();
      const data: FileEntry[] = await res.json();
      setEntries(data);
      setCurrentDir(dir);
    } catch {
      setEntries([]);
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
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--color-text-secondary)" }}>
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
        sx={{
          display: "flex",
          alignItems: "center",
          px: { xs: 1.5, sm: 2 },
          py: 1,
          borderBottom: "1px solid var(--color-border)",
          bgcolor: "var(--color-surface)",
          flexShrink: 0,
          overflow: "auto",
          whiteSpace: "nowrap",
        }}
      >
        <Breadcrumbs
          separator={<ChevronRightRoundedIcon sx={{ fontSize: 16, color: "var(--color-text-tertiary)" }} />}
          sx={{ "& .MuiBreadcrumbs-separator": { mx: 0.25 } }}
        >
          <Link
            component="button"
            underline="hover"
            onClick={() => fetchDir("")}
            sx={{ fontSize: "13px", color: pathParts.length === 0 ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: pathParts.length === 0 ? 600 : 400 }}
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
                sx={{ fontSize: "13px", color: isLast ? "var(--color-text)" : "var(--color-text-secondary)", fontWeight: isLast ? 600 : 400 }}
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
            <CircularProgress size={28} sx={{ color: "var(--color-accent)" }} />
          </Box>
        ) : entries.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4, color: "var(--color-text-tertiary)" }}>
            <Typography fontSize="13px">空のディレクトリです</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {entries.map((entry) => (
              <ListItemButton
                key={entry.path}
                onClick={() => handleEntryClick(entry)}
                sx={{
                  py: { xs: 1.25, sm: 0.75 },
                  px: { xs: 1.5, sm: 2 },
                  borderBottom: "1px solid var(--color-border)",
                  "&:hover": { bgcolor: "var(--color-accent-soft)" },
                  "&:active": { bgcolor: "var(--color-bg-secondary)" },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {getFileIcon(entry)}
                </ListItemIcon>
                <ListItemText
                  primary={entry.name}
                  primaryTypographyProps={{
                    fontSize: { xs: "14px", sm: "13px" },
                    fontWeight: 400,
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text)",
                  }}
                />
                {entry.type === "file" && entry.size != null && (
                  <Typography sx={{ fontSize: "11px", color: "var(--color-text-tertiary)", ml: 1, flexShrink: 0 }}>
                    {formatSize(entry.size)}
                  </Typography>
                )}
                {entry.type === "directory" && (
                  <ChevronRightRoundedIcon sx={{ fontSize: 18, color: "var(--color-text-tertiary)" }} />
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}
