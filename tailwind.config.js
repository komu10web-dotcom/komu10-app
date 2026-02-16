/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // komu10 Design System v2.0
        surface: {
          DEFAULT: '#F5F5F3',
          dark: '#0a0a0b',
        },
        gold: {
          DEFAULT: '#D4A03A',
          light: 'rgba(212, 160, 58, 0.15)',
        },
        crimson: '#C23728',
        navy: '#1E3A5F',
        forest: '#1B4D3E',
        orange: '#E07A3A',
        sand: '#C4B49A',
        cream: '#E8E4DE',
        // Semantic
        success: '#1B4D3E',
        warning: '#D4A03A',
        danger: '#C23728',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Questrial', 'sans-serif'],
        number: ['Saira Condensed', 'sans-serif'],
        jp: ['Shippori Mincho', 'serif'],
      },
    },
  },
  plugins: [],
};
