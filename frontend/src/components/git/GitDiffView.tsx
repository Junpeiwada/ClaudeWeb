import { Box, CircularProgress, Typography, IconButton } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

interface Props {
  diff: string | null;
  loading: boolean;
  selectedFile: string | null;
  onBack?: () => void;
}

export default function GitDiffView({ diff, loading, selectedFile, onBack }: Props) {
  if (!selectedFile) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <Typography sx={{ color: "text.secondary", fontSize: 13 }}>ファイルを選択してください</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {onBack && <DiffHeader fileName={selectedFile} onBack={onBack} />}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <CircularProgress size={24} />
        </Box>
      </Box>
    );
  }

  if (!diff) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {onBack && <DiffHeader fileName={selectedFile} onBack={onBack} />}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <Typography sx={{ color: "text.secondary", fontSize: 13 }}>差分がありません</Typography>
        </Box>
      </Box>
    );
  }

  const lines = diff.split("\n");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {onBack && <DiffHeader fileName={selectedFile} onBack={onBack} />}
      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {lines.map((line, i) => {
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
    </Box>
  );
}

function DiffHeader({ fileName, onBack }: { fileName: string; onBack: () => void }) {
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
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {fileName}
      </Typography>
    </Box>
  );
}
