/** @type {import('tailwindcss').Config} */
export default {
  content: ["./assets/**/*.{html,js}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Hanken Grotesk"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
