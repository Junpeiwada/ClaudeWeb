import { Box, Typography, IconButton } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import type { PendingPermission } from "../hooks/useChat";

interface Props {
  permission: PendingPermission;
  onRespond: (requestId: string, approved: boolean) => void;
}

export default function PermissionDialog({ permission, onRespond }: Props) {
  const inputSummary = Object.entries(permission.toolInput)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");

  return (
    <>
      {/* Backdrop */}
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          bgcolor: "rgba(0, 0, 0, 0.15)",
          backdropFilter: "blur(2px)",
          zIndex: 1200,
          animation: "fade-in-up 0.2s ease",
        }}
      />

      {/* Dialog */}
      <Box
        sx={{
          position: "fixed",
          bottom: { xs: 16, sm: "auto" },
          top: { xs: "auto", sm: "50%" },
          left: { xs: 16, sm: "50%" },
          right: { xs: 16, sm: "auto" },
          transform: { sm: "translate(-50%, -50%)" },
          width: { sm: 420 },
          maxHeight: "80dvh",
          bgcolor: "var(--color-surface)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          zIndex: 1300,
          animation: "fade-in-up 0.25s ease",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2.5,
            py: 2,
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "var(--color-accent)",
              flexShrink: 0,
            }}
          />
          <Typography
            sx={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--color-text)",
              flex: 1,
            }}
          >
            {permission.toolName}
          </Typography>
        </Box>

        {/* Content */}
        {inputSummary && (
          <Box
            sx={{
              px: 2.5,
              py: 2,
              maxHeight: 240,
              overflow: "auto",
            }}
          >
            <Box
              sx={{
                fontFamily: "var(--font-mono)",
                fontSize: "12.5px",
                lineHeight: 1.7,
                color: "var(--color-text)",
                bgcolor: "var(--color-code-bg)",
                p: 1.5,
                borderRadius: "var(--radius-sm)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {inputSummary}
            </Box>
          </Box>
        )}

        {/* Actions */}
        <Box
          sx={{
            display: "flex",
            gap: 1,
            px: 2.5,
            py: 2,
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <IconButton
            onClick={() => onRespond(permission.requestId, false)}
            sx={{
              flex: 1,
              borderRadius: "var(--radius-sm)",
              py: 1,
              border: "1px solid var(--color-border)",
              color: "var(--color-text-secondary)",
              fontSize: "13px",
              fontWeight: 500,
              gap: 0.75,
              transition: "all 0.15s ease",
              "&:hover": {
                bgcolor: "#FEF2F2",
                borderColor: "#EF4444",
                color: "#EF4444",
              },
            }}
          >
            <CloseRoundedIcon sx={{ fontSize: 16 }} />
            <span>Deny</span>
          </IconButton>
          <IconButton
            onClick={() => onRespond(permission.requestId, true)}
            sx={{
              flex: 1,
              borderRadius: "var(--radius-sm)",
              py: 1,
              bgcolor: "var(--color-accent)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 500,
              gap: 0.75,
              transition: "all 0.15s ease",
              "&:hover": {
                bgcolor: "var(--color-accent-hover)",
              },
            }}
          >
            <CheckRoundedIcon sx={{ fontSize: 16 }} />
            <span>Allow</span>
          </IconButton>
        </Box>
      </Box>
    </>
  );
}
