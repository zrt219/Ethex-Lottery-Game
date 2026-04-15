import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#06131c",
        mist: "#e8eff4",
        line: "rgba(148, 163, 184, 0.16)",
        panel: "rgba(7, 18, 27, 0.74)",
        glow: "#68c5ff",
        sand: "#d8c49a",
        mint: "#7be0ba",
        ember: "#ff8f70"
      },
      boxShadow: {
        soft: "0 24px 80px rgba(3, 10, 16, 0.28)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;
