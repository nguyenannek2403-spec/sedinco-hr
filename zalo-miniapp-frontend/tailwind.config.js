module.exports = {
  darkMode: ["selector", ':is(.dark, [zaui-theme="dark"])'],
  content: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ["Roboto Mono", "monospace"],
      },
    },
  },
};
