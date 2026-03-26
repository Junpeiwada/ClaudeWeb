import { useState, useEffect } from "react";
import { Box, Typography, IconButton, CircularProgress, Tooltip, Fab } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface FileContent {
  type: "markdown" | "code" | "image" | "binary";
  content: string | null;
  language?: string;
  message?: string;
}

interface Props {
  repoId: string;
  filePath: string;
  onClose: () => void;
  onSwitchToChat: () => void;
}

function resolveImageSrc(src: string, repoId: string, filePath: string): string {
  // 絶対URL・data URIはそのまま
  if (/^https?:\/\//.test(src) || src.startsWith("data:")) return src;
  // ファイルの親ディレクトリを基準に相対パスを解決
  const dir = filePath.split("/").slice(0, -1).join("/");
  const parts = (dir ? dir + "/" + src : src).split("/");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") resolved.pop();
    else resolved.push(p);
  }
  return `/api/repos/${encodeURIComponent(repoId)}/raw/${resolved.map(encodeURIComponent).join("/")}`;
}

export default function FileViewer({ repoId, filePath, onClose, onSwitchToChat }: Props) {
  const [data, setData] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fileName = filePath.split("/").pop() || filePath;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/repos/${encodeURIComponent(repoId)}/file/${filePath.split("/").map(encodeURIComponent).join("/")}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [repoId, filePath]);

  const handleCopy = () => {
    if (data?.content && data.type !== "image") {
      navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: { xs: 0.5, sm: 1 },
          py: 0.5,
          borderBottom: "1px solid var(--color-border)",
          bgcolor: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        <IconButton onClick={onClose} size="small" sx={{ color: "var(--color-text-secondary)" }}>
          <ArrowBackRoundedIcon fontSize="small" />
        </IconButton>
        <Typography
          sx={{
            flex: 1,
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            color: "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {fileName}
        </Typography>
        {data?.content && data.type !== "image" && (
          <Tooltip title={copied ? "コピーしました" : "コピー"}>
            <IconButton onClick={handleCopy} size="small" sx={{ color: "var(--color-text-secondary)" }}>
              <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", position: "relative" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} sx={{ color: "var(--color-accent)" }} />
          </Box>
        ) : !data ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4, color: "var(--color-text-secondary)" }}>
            <Typography fontSize="13px">ファイルを読み込めませんでした</Typography>
          </Box>
        ) : data.type === "binary" ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4, color: "var(--color-text-tertiary)" }}>
            <Typography fontSize="13px">{data.message || "バイナリファイルは表示できません"}</Typography>
          </Box>
        ) : data.type === "image" ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", p: 2, minHeight: 200 }}>
            <img
              src={data.content!}
              alt={fileName}
              style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 8 }}
            />
          </Box>
        ) : data.type === "markdown" ? (
          <Box
            className="markdown-viewer"
            sx={{
              px: { xs: 2, sm: 3 },
              py: 2,
              fontSize: "14px",
              lineHeight: 1.7,
              "& h1": { fontSize: "1.5em", fontWeight: 700, mt: 2, mb: 1, borderBottom: "1px solid var(--color-border)", pb: 0.5 },
              "& h2": { fontSize: "1.25em", fontWeight: 600, mt: 2, mb: 0.5 },
              "& h3": { fontSize: "1.1em", fontWeight: 600, mt: 1.5, mb: 0.5 },
              "& p": { my: 0.75 },
              "& a": { color: "var(--color-accent)" },
              "& img": { maxWidth: "100%", borderRadius: 1 },
              "& pre": {
                bgcolor: "var(--color-code-bg)",
                p: 1.5,
                borderRadius: "var(--radius-sm)",
                overflow: "auto",
                fontSize: "13px",
                fontFamily: "var(--font-mono)",
                my: 1,
              },
              "& code": {
                bgcolor: "var(--color-code-bg)",
                px: 0.5,
                py: 0.125,
                borderRadius: "4px",
                fontFamily: "var(--font-mono)",
                fontSize: "0.9em",
              },
              "& pre code": { bgcolor: "transparent", p: 0 },
              "& ul, & ol": { pl: 2.5 },
              "& li": { my: 0.25 },
              "& blockquote": {
                borderLeft: "3px solid var(--color-accent)",
                ml: 0,
                pl: 2,
                color: "var(--color-text-secondary)",
              },
              "& table": {
                borderCollapse: "collapse",
                width: "100%",
                my: 1,
              },
              "& th, & td": {
                border: "1px solid var(--color-border)",
                px: 1,
                py: 0.5,
                fontSize: "13px",
              },
              "& th": { bgcolor: "var(--color-bg-secondary)", fontWeight: 600 },
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt, ...props }) => (
                  <img
                    {...props}
                    src={src ? resolveImageSrc(src, repoId, filePath) : undefined}
                    alt={alt || ""}
                    style={{ maxWidth: "100%", borderRadius: 4 }}
                  />
                ),
              }}
            >
              {data.content!}
            </ReactMarkdown>
          </Box>
        ) : (
          /* Code / Text */
          <Box
            sx={{
              px: { xs: 1, sm: 2 },
              py: 1,
              overflow: "auto",
            }}
          >
            <pre
              style={{
                margin: 0,
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--color-text)",
              }}
            >
              {data.content}
            </pre>
          </Box>
        )}

        {/* チャットで質問FAB */}
        {!loading && data && (
          <Fab
            size="medium"
            onClick={onSwitchToChat}
            sx={{
              position: "sticky",
              bottom: 16,
              float: "right",
              mr: 2,
              bgcolor: "var(--color-accent)",
              color: "#fff",
              "&:hover": { bgcolor: "var(--color-accent-hover)" },
            }}
          >
            <ChatRoundedIcon />
          </Fab>
        )}
      </Box>
    </Box>
  );
}
