/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        x: {
          black: '#0A0A0B',
          white: '#FFFFFF',
          milk: '#FAFAF6',
          gold: '#B8893A',
          green: '#2A4A3A',
          burgundy: '#5A1F24',
          red: '#AA2A2A',
        },
        app: {
          // アクセント
          gold:        '#D4A03A',
          'gold-hover':'#B8882E',
          'gold-deep': '#8B6D1F',
          green:       '#1B4D3E',
          'green-hover':'#1A3D32',
          red:         '#C23728',
          'red-hover': '#A82E22',
          'red-soft':  '#B85450',
          // 警告・情報(税務系の薄黄ファミリー)
          warn:        '#E07A3A',
          'warn-strong':'#F9A825',
          'warn-deep': '#92400E',
          'warn-text': '#5D4037',
          info:        '#3B7DA8',
          // 背景階層
          bg:          '#FFFFFF',
          surface:     '#FAFAF8',
          'surface-alt':'#F5F5F3',
          'surface-hover':'#ECECE9',
          // 文字色階層(6段階固定)
          text:        '#1a1a1a',
          'text-strong':'#333333',
          'text-sub':  '#666666',
          'text-mute': '#999999',
          'text-fade': '#bbbbbb',
          'text-ghost':'#dddddd',
          // 罫線階層
          line:         '#f0f0f0',
          'line-soft':  '#fafafa',
          'line-strong':'#e0e0e0',
          'line-medium':'#e8e8e8',
          // ボタン系
          button:           '#1a1a1a',
          'button-hover':   '#333333',
          'button-disabled':'#eeeeee',
        },
        state: {
          'error-bg':   '#FDF0EE',
          'error-line': '#F5C6C0',
          'success-bg': '#F0F7F1',
          'warn-bg':    '#FFF9EA',
          'warn-line':  '#FFE082',
          'gold-soft':  '#FAF6EE',
        },
        content: {
          'scene-notes':  '#81D8D0',
          'this-place':   '#FF5F45',
          'data-science': '#1A5F8A',
          'data-files':   '#C23728',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Questrial', 'sans-serif'],
        number:  ['Saira Condensed', 'sans-serif'],
        jp:      ['Shippori Mincho', 'serif'],
        'x-logo':   ['Questrial', 'sans-serif'],
        'x-mincho': ['Shippori Mincho', 'serif'],
        'x-num':    ['Saira Condensed', 'sans-serif'],
        'x-ui':     ['Inter', 'sans-serif'],
        'x-ui-jp':  ['Noto Sans JP', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
