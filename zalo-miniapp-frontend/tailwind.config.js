module.exports = {
  darkMode: ["selector", ':is(.dark, [zaui-theme="dark"])'],
  content: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Be Vietnam Pro", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["Roboto Mono", "monospace"],
      },
      colors: {
        "sedinco-crimson": "#E11D48",
        "sedinco-crimson-hover": "#BE123C",
        "sedinco-crimson-deep": "#B80035",
        "sedinco-crimson-tint": "#FFDADA",
        "sedinco-zalo": "#0068FF",
        "sedinco-green": "#16A34A",
        "sedinco-canvas": "#F9F9FF",
        "sedinco-panel": "#F0F3FF",
        "sedinco-ink": "#111C2D",
      },
    },
  },
};
