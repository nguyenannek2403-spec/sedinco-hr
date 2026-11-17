module.exports = {
  darkMode: ["selector", '.dark, [zaui-theme="dark"]'],
  content: ['./src/**/*.{js,jsx,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ["Roboto Mono", "monospace"],
      },
    },
  },
};
