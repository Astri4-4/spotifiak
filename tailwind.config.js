/** A theme color from src/index.css, as RGB channels so opacity modifiers (bg-white/10) work. */
const themed = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every color follows the chosen theme (see src/lib/theme.ts). In the
      // dark theme they keep their literal meaning; in the light one `white`
      // is the text color and `black` the deepest background, so overlays
      // like bg-white/10 still contrast with the page.
      colors: {
        white: themed("fg"),
        black: themed("bg"),
        // For literal white that must not change with the theme (e.g. on a
        // fixed-color gradient).
        "pure-white": "#ffffff",
        spotify: {
          // The accent color: green unless the user picks another one.
          green: themed("accent"),
          "green-bright": themed("accent-bright"),
          black: themed("bg"),
          "base-black": themed("base"),
          "elevated-black": themed("elevated"),
          "highlight-black": themed("highlight"),
          "press-black": themed("press"),
          gray: themed("gray"),
          "gray-subdued": themed("gray-subdued"),
        },
        // Text/icons on top of the accent color.
        "on-accent": themed("on-accent"),
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
        "slide-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-in-out",
        "slide-up": "slide-up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      spacing: {
        "safe-top": "var(--safe-top)",
        "safe-bottom": "var(--safe-bottom)",
      },
    },
  },
  plugins: [],
};
