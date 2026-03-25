import { Box, Typography } from "@mui/material";

interface Props {
  activity: string | null;
}

export default function ActivityIndicator({ activity }: Props) {
  if (!activity) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.75,
        animation: "fade-in-up 0.2s ease",
      }}
    >
      <Box
        sx={{
          display: "flex",
          gap: "3px",
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              bgcolor: "var(--color-accent)",
              animation: "pulse-dot 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </Box>
      <Typography
        sx={{
          fontSize: "12.5px",
          color: "var(--color-text-secondary)",
          fontStyle: "italic",
          letterSpacing: "-0.01em",
        }}
      >
        {activity}
      </Typography>
    </Box>
  );
}
