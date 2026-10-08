/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: "#1DB954",
          "green-bright": "#1ED760",
          black: "#000000",
          "base-black": "#121212",
          "elevated-black": "#181818",
          "highlight-black": "#282828",
          "press-black": "#0a0a0a",
          gray: "#B3B3B3",
          "gray-subdued": "#6a6a6a",
        },
      },
      fontFamily: {
        sans: [
          "Circular",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      gridTemplateColumns: {
        "auto-fill-cards": "repeat(auto-fill, minmax(160px, 1fr))",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-in-out",
      },
    },
  },
  plugins: [],
};
