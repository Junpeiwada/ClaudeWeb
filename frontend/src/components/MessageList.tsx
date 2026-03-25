import { Fragment, useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../hooks/useChat";

interface Props {
  messages: Message[];
  isLoading: boolean;
}

interface ToolResultSegment {
  kind: "tool_result";
  toolName: string;
  content: string;
}

interface MarkdownSegment {
  kind: "markdown";
  content: string;
}

type ContentSegment = MarkdownSegment | ToolResultSegment;

const TOOL_RESULT_PATTERN = /<!--TOOL_RESULT:(.*?)-->/gs;

function parseAssistantContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(TOOL_RESULT_PATTERN)) {
    const [raw, payload] = match;
    const start = match.index ?? 0;

    if (start > lastIndex) {
      segments.push({ kind: "markdown", content: content.slice(lastIndex, start) });
    }

    try {
      const parsed = JSON.parse(decodeURIComponent(payload)) as { toolName?: string; content?: string };
      segments.push({
        kind: "tool_result",
        toolName: parsed.toolName || "Tool",
        content: parsed.content || "",
      });
    } catch {
      segments.push({ kind: "markdown", content: raw });
    }

    lastIndex = start + raw.length;
  }

  if (lastIndex < content.length) {
    segments.push({ kind: "markdown", content: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ kind: "markdown", content }];
}

export default function MessageList({ messages, isLoading }: Props) {
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
          How can I help you today?
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
            <UserMessage key={i} content={msg.content} />
          ) : (
            <AssistantMessage
              key={i}
              content={msg.content}
              isStreaming={isLoading && i === messages.length - 1}
            />
          )
        )}
      </Box>
    </Box>
  );
}

function UserMessage({ content }: { content: string }) {
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
        {content}
      </Box>
    </Box>
  );
}

function AssistantMessage({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  if (!content && isStreaming) {
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
        "& details": {
          my: 1.5,
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          bgcolor: "var(--color-bg-secondary)",
          overflow: "hidden",
        },
        "& summary": {
          cursor: "pointer",
          px: 1.5,
          py: 1,
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          userSelect: "none",
        },
        "& details > div": {
          px: 1.5,
          pb: 1.5,
        },
      }}
    >
      {parseAssistantContent(content).map((segment, index) => (
        <Fragment key={index}>
          {segment.kind === "markdown" ? (
            segment.content.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{segment.content}</ReactMarkdown>
            ) : null
          ) : (
            <details>
              <summary>{segment.toolName} Result</summary>
              <Box component="div">
                <Box
                  component="pre"
                  sx={{
                    mb: 0,
                    mt: 0.5,
                  }}
                >
                  <code>{segment.content}</code>
                </Box>
              </Box>
            </details>
          )}
        </Fragment>
      ))}
    </Box>
  );
}
