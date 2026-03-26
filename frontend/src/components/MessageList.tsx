import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../hooks/useChat";

interface Props {
  messages: Message[];
  isLoading: boolean;
  repoId?: string;
}

export default function MessageList({ messages, isLoading, repoId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          pb: 6,
          px: 3,
        }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, #C96442 0%, #D4845E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 2.5,
          }}
        >
          <Typography
            sx={{
              color: "#fff",
              fontSize: "22px",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            C
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: "15px",
            color: "var(--color-text-secondary)",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          {repoId ? "何かお手伝いできますか？" : "リポジトリを選択してください"}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={scrollRef}
      sx={{
        flex: 1,
        overflow: "auto",
        minHeight: 0,
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: "var(--max-width)",
          mx: "auto",
          px: { xs: 2, sm: 3 },
          py: 3,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          minHeight: "100%",
          justifyContent: "flex-end",
        }}
      >
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <UserMessage key={i} content={msg.content} images={msg.images} />
          ) : (
            <AssistantMessage
              key={i}
              message={msg}
              isStreaming={isLoading && i === messages.length - 1}
            />
          )
        )}
      </Box>
    </Box>
  );
}

function UserMessage({ content, images }: { content: string; images?: Message["images"] }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        animation: "fade-in-up 0.25s ease",
      }}
    >
      <Box
        sx={{
          maxWidth: "85%",
          bgcolor: "var(--color-user-bubble)",
          color: "var(--color-text)",
          px: 2,
          py: 1.25,
          borderRadius: "var(--radius-lg)",
          borderBottomRightRadius: "var(--radius-sm)",
          fontSize: "14.5px",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {images && images.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: content ? 1 : 0 }}>
            {images.map((img, i) => (
              <Box
                key={i}
                sx={{
                  width: 120,
                  height: 120,
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                }}
              >
                <img
                  src={img.preview}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </Box>
            ))}
          </Box>
        )}
        {content}
      </Box>
    </Box>
  );
}

function AssistantMessage({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming: boolean;
}) {
  const parts = message.role === "assistant" ? message.parts ?? [] : [];
  const fallbackContent = message.content;
  const error = message.role === "assistant" ? message.error : null;

  if (parts.length === 0 && !fallbackContent && !error && isStreaming) {
    return (
      <Box sx={{ display: "flex", gap: "4px", py: 1, animation: "fade-in-up 0.25s ease" }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: "var(--color-text-tertiary)",
              animation: "pulse-dot 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        animation: "fade-in-up 0.25s ease",
        fontSize: "14.5px",
        lineHeight: 1.7,
        color: "var(--color-text)",
        /* Markdown styles */
        "& p": {
          m: 0,
        },
        "& p + p": {
          mt: 1.5,
        },
        "& ul, & ol": {
          mt: 0.75,
          mb: 0.75,
          pl: 2.5,
        },
        "& li": {
          mb: 0.25,
        },
        "& code": {
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          bgcolor: "var(--color-code-bg)",
          px: 0.75,
          py: 0.25,
          borderRadius: "var(--radius-sm)",
          fontWeight: 500,
        },
        "& pre": {
          bgcolor: "var(--color-code-bg)",
          p: 2,
          borderRadius: "var(--radius-md)",
          overflow: "auto",
          my: 1.5,
          border: "1px solid var(--color-border)",
        },
        "& pre code": {
          bgcolor: "transparent",
          px: 0,
          py: 0,
          fontSize: "13px",
          lineHeight: 1.6,
        },
        "& a": {
          color: "var(--color-accent)",
          textDecoration: "none",
          borderBottom: "1px solid transparent",
          transition: "border-color 0.15s ease",
          "&:hover": {
            borderBottomColor: "var(--color-accent)",
          },
        },
        "& h1, & h2, & h3, & h4": {
          mt: 2,
          mb: 0.75,
          fontWeight: 600,
          lineHeight: 1.3,
          letterSpacing: "-0.02em",
        },
        "& h1": { fontSize: "20px" },
        "& h2": { fontSize: "17px" },
        "& h3": { fontSize: "15px" },
        "& blockquote": {
          borderLeft: "3px solid var(--color-accent)",
          m: 0,
          my: 1,
          pl: 2,
          color: "var(--color-text-secondary)",
        },
        "& hr": {
          border: "none",
          borderTop: "1px solid var(--color-border)",
          my: 2,
        },
        "& table": {
          width: "100%",
          borderCollapse: "collapse",
          my: 1.5,
          fontSize: "13.5px",
        },
        "& th, & td": {
          border: "1px solid var(--color-border)",
          px: 1.5,
          py: 0.75,
          textAlign: "left",
        },
        "& th": {
          bgcolor: "var(--color-bg-secondary)",
          fontWeight: 600,
        },
        "& .tool-result": {
          my: 1.5,
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          bgcolor: "var(--color-bg-secondary)",
          overflow: "hidden",
        },
        "& .tool-result summary": {
          cursor: "pointer",
          px: 1.5,
          py: 1,
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          userSelect: "none",
        },
        "& .tool-result > div": {
          px: 1.5,
          pb: 1.5,
        },
      }}
    >
      {parts.length > 0 ? (
        parts.map((part, index) =>
          part.type === "text" ? (
            part.content.trim() ? (
              <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
                {part.content}
              </ReactMarkdown>
            ) : null
          ) : (
            <details key={index} className="tool-result">
              <summary>{part.toolName ?? "Tool"} Result</summary>
              <Box component="div">
                <Box
                  component="pre"
                  sx={{
                    mb: 0,
                    mt: 0.5,
                  }}
                >
                  <code>{part.content}</code>
                </Box>
              </Box>
            </details>
          )
        )
      ) : fallbackContent.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fallbackContent}</ReactMarkdown>
      ) : null}
      {error ? (
        <Box
          sx={{
            mt: 1.5,
            px: 1.5,
            py: 1.25,
            borderRadius: "var(--radius-md)",
            border: "1px solid",
            borderColor:
              error.kind === "limit" ? "rgba(201, 100, 66, 0.28)" : "rgba(180, 87, 87, 0.24)",
            bgcolor:
              error.kind === "limit" ? "rgba(201, 100, 66, 0.08)" : "rgba(180, 87, 87, 0.08)",
          }}
        >
          <Typography
            sx={{
              fontSize: "13px",
              fontWeight: 600,
              color: error.kind === "limit" ? "var(--color-accent)" : "#9F3E3E",
              mb: 0.25,
            }}
          >
            {error.kind === "limit" ? "Usage limit reached" : "Request failed"}
          </Typography>
          <Typography
            sx={{
              fontSize: "13.5px",
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {error.message}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}
