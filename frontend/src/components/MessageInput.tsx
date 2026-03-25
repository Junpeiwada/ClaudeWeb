import { useState } from "react";
import { Box, IconButton, InputBase } from "@mui/material";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  disabled: boolean;
  isLoading: boolean;
}

export default function MessageInput({ onSend, onStop, disabled, isLoading }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-end",
        gap: 0.75,
        p: 1,
        pl: 2,
        bgcolor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        "&:focus-within": {
          borderColor: "var(--color-accent)",
          boxShadow: "0 0 0 2px var(--color-accent-soft)",
        },
      }}
    >
      <InputBase
        fullWidth
        placeholder="Message ClaudeWeb..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={disabled}
        multiline
        maxRows={6}
        sx={{
          fontSize: "14.5px",
          lineHeight: 1.5,
          py: 0.5,
          "& textarea": {
            "&::placeholder": {
              color: "var(--color-text-tertiary)",
              opacity: 1,
            },
          },
        }}
      />
      {isLoading ? (
        <IconButton
          onClick={onStop}
          size="small"
          sx={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-sm)",
            bgcolor: "var(--color-text-secondary)",
            color: "#fff",
            flexShrink: 0,
            transition: "all 0.15s ease",
            "&:hover": {
              bgcolor: "var(--color-text)",
            },
          }}
        >
          <StopRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      ) : (
        <IconButton
          onClick={handleSend}
          disabled={!canSend}
          size="small"
          sx={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-sm)",
            bgcolor: canSend ? "var(--color-accent)" : "var(--color-bg-secondary)",
            color: canSend ? "#fff" : "var(--color-text-tertiary)",
            flexShrink: 0,
            transition: "all 0.15s ease",
            "&:hover": {
              bgcolor: canSend ? "var(--color-accent-hover)" : "var(--color-bg-secondary)",
            },
            "&.Mui-disabled": {
              bgcolor: "var(--color-bg-secondary)",
              color: "var(--color-text-tertiary)",
            },
          }}
        >
          <ArrowUpwardRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}
    </Box>
  );
}
