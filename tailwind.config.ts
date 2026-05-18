import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme tokens — flip on .dark via CSS variables in globals.css
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        "fg-muted": "rgb(var(--fg-muted) / <alpha-value>)",
        "fg-faint": "rgb(var(--fg-faint) / <alpha-value>)",
        hover: "rgb(var(--hover) / <alpha-value>)",

        // Semantic
        accent: {
          DEFAULT: "#ef4444",
          50: "rgb(var(--accent-soft) / <alpha-value>)",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
        ok: {
          DEFAULT: "#16a34a",
          soft: "rgb(var(--ok-soft) / <alpha-value>)",
        },
        warn: {
          DEFAULT: "#d97706",
          soft: "rgb(var(--warn-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.03), 0 1px 1px 0 rgb(0 0 0 / 0.02)",
        pop: "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)",
      },
      animation: {
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
