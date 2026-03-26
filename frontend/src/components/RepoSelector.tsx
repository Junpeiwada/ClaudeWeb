import { useEffect, useState, useRef } from "react";
import { Box, Typography, Collapse } from "@mui/material";
import UnfoldMoreRoundedIcon from "@mui/icons-material/UnfoldMoreRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";

interface Repo {
  id: string;
  name: string;
  path: string;
}

interface Props {
  value: string;
  onChange: (repoId: string) => void;
}

export default function RepoSelector({ value, onChange }: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [open, setOpen] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setRepos(data); setFetchError(false); })
      .catch(() => setFetchError(true));
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = repos.find((r) => r.id === value);

  return (
    <Box ref={ref} sx={{ position: "relative" }}>
      {/* Trigger */}
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          py: 0.75,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border)",
          cursor: "pointer",
          minWidth: { xs: 100, sm: 140 },
          transition: "all 0.15s ease",
          bgcolor: "var(--color-surface)",
          "&:hover": {
            borderColor: "var(--color-text-tertiary)",
          },
        }}
      >
        <FolderRoundedIcon
          sx={{ fontSize: 15, color: "var(--color-text-tertiary)" }}
        />
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 500,
            color: selected ? "var(--color-text)" : "var(--color-text-tertiary)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selected?.name ?? "Select repo"}
        </Typography>
        <UnfoldMoreRoundedIcon
          sx={{
            fontSize: 16,
            color: "var(--color-text-tertiary)",
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </Box>

      {/* Dropdown */}
      <Collapse in={open}>
        <Box
          sx={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 200,
            bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            py: 0.5,
            zIndex: 1000,
            maxHeight: 280,
            overflow: "auto",
          }}
        >
          {fetchError ? (
            <Box sx={{ px: 1.5, py: 2, textAlign: "center" }}>
              <Typography sx={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
                サーバーに接続できません
              </Typography>
            </Box>
          ) : repos.length === 0 ? (
            <Box sx={{ px: 1.5, py: 2, textAlign: "center" }}>
              <Typography sx={{ fontSize: "13px", color: "var(--color-text-tertiary)" }}>
                リポジトリがありません
              </Typography>
            </Box>
          ) : repos.map((r) => (
            <Box
              key={r.id}
              onClick={() => {
                onChange(r.id);
                setOpen(false);
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 1,
                cursor: "pointer",
                transition: "background 0.1s ease",
                "&:hover": {
                  bgcolor: "var(--color-bg-secondary)",
                },
              }}
            >
              <FolderRoundedIcon
                sx={{ fontSize: 15, color: "var(--color-text-tertiary)" }}
              />
              <Typography
                sx={{
                  fontSize: "13px",
                  fontWeight: r.id === value ? 600 : 400,
                  color: "var(--color-text)",
                  flex: 1,
                }}
              >
                {r.name}
              </Typography>
              {r.id === value && (
                <CheckRoundedIcon
                  sx={{ fontSize: 15, color: "var(--color-accent)" }}
                />
              )}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
