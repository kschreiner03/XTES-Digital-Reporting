
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enables dark mode toggling via a CSS class
  theme: {
    extend: {
      colors: {
        'xterra-teal': '#007D8C',
      }
    },
  },
  plugins: [],
}