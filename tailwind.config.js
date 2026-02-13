/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        k10: {
          bg: '#F5F5F3',
          dark: '#0A0A0B',
          gold: '#D4A03A',
          crimson: '#C23728',
          teal: '#81D8D0',
          sunset: '#FF5F45',
          green: '#1B4D3E',
          navy: '#1E3A5F',
          orange: '#E07A3A',
          sand: '#C4B49A',
          off: '#E8E4DE',
        }
      },
      fontFamily: {
        questrial: ['Questrial', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        saira: ['Saira Condensed', 'sans-serif'],
        mincho: ['Shippori Mincho', 'serif'],
      }
    },
  },
  plugins: [],
}
