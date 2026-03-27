import { createTheme } from "@mui/material";

// MUIカスタムパレット型拡張
declare module "@mui/material/styles" {
  interface Palette {
    accent: {
      main: string;
      soft: string;
      hover: string;
      gradient: string;
    };
    border: string;
    userBubble: string;
    codeBg: string;
    bgSecondary: string;
    textTertiary: string;
    onAccent: string;
    error2: {
      main: string;
      light: string;
      border: string;
      bg: string;
    };
    fileIcon: {
      folder: string;
      image: string;
      code: string;
      doc: string;
    };
  }
  interface PaletteOptions {
    accent?: {
      main?: string;
      soft?: string;
      hover?: string;
      gradient?: string;
    };
    border?: string;
    userBubble?: string;
    codeBg?: string;
    bgSecondary?: string;
    textTertiary?: string;
    onAccent?: string;
    error2?: {
      main?: string;
      light?: string;
      border?: string;
      bg?: string;
    };
    fileIcon?: {
      folder?: string;
      image?: string;
      code?: string;
      doc?: string;
    };
  }
}

export const theme = createTheme({
  palette: {
    primary: { main: "#C96442" },
    background: {
      default: "#FAF9F7",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#2D2B28",
      secondary: "#8C8985",
    },
    accent: {
      main: "#C96442",
      soft: "rgba(201, 100, 66, 0.08)",
      hover: "#B5593A",
      gradient: "linear-gradient(135deg, #C96442 0%, #D4845E 100%)",
    },
    border: "#E8E6E3",
    userBubble: "#EDE9E3",
    codeBg: "#F0EDE8",
    bgSecondary: "#F3F1EE",
    textTertiary: "#B0ADA9",
    onAccent: "#FFFFFF",
    error2: {
      main: "#9F3E3E",
      light: "rgba(180, 87, 87, 0.24)",
      border: "#EF4444",
      bg: "#FEF2F2",
    },
    fileIcon: {
      folder: "#FFA726",
      image: "#66BB6A",
      code: "#42A5F5",
      doc: "#AB47BC",
    },
  },
  typography: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#FAF9F7",
        },
      },
    },
  },
});
