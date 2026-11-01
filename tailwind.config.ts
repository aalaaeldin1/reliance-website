import type { Config } from "tailwindcss";

// Brand: Reliance navy + gold (from the brand kit)
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#06101F", 900: "#0B1A30", 800: "#0F2244", 700: "#152D56", 600: "#1A3870" },
        gold: { 700: "#96771E", 500: "#C49A3C", 400: "#D4AE54", 200: "#E8D28C" },
        mist: "#EDF1F8",
        ink: "#0B1A30",
        muted: "#4B5873",
        line: "#DCE2EC",
        ok: "#24805B",
        warn: "#A86F0E",
        bad: "#B4433F",
        info: "#2D5BA8",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', '"Noto Naskh Arabic"', "Georgia", "serif"],
        sans: ["Inter", "Cairo", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
