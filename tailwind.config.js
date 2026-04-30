/** @type {import('tailwindcss').Config} */
// v0.33.0: ブランドトークン一元管理(brandTokens.ts)と整合
// 全アプリの色運用はこの config + brandTokens.ts の2箇所で完結
// ブランド規定変更時の波及対応はこの2ファイルのみ更新で全画面反映
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ブランド規定 v1.4-rev4 正典 7色
        x: {
          black:    '#0A0A0B',
          white:    '#FFFFFF',
          milk:     '#FAFAF6',
          gold:     '#B8893A',
          green:    '#2A4A3A',
          burgundy: '#5A1F24',
          red:      '#AA2A2A',
        },
        // アプリ画面用 調整パレット
        app: {
          gold:        '#D4A03A',
          green:       '#1B4D3E',
          red:         '#C23728',
          bg:          '#FFFFFF',
          surface:     '#FAFAF8',
          'surface-alt': '#F5F5F3',
          text:        '#1a1a1a',
          'text-sub':  '#666666',
          'text-mute': '#999999',
          'text-fade': '#bbbbbb',
          'text-ghost': '#dddddd',
          line:        '#f0f0f0',
          'line-soft': '#fafafa',
        },
        // 状態背景色
        state: {
          'error-bg':   '#FDF0EE',
          'success-bg': '#F0F7F1',
          'warn-bg':    '#FFF9EA',
        },
        // コンテンツ色
        content: {
          'scene-notes':  '#81D8D0',
          'this-place':   '#FF5F45',
          'data-science': '#1A5F8A',
          'data-files':   '#C23728',
        },
        // ── Legacy エイリアス(段階的廃止予定) ──
        surface: { DEFAULT: '#F5F5F3', dark: '#0a0a0b' },
        gold:    { DEFAULT: '#D4A03A', light: 'rgba(212, 160, 58, 0.15)' },
        crimson: '#C23728',
        navy:    '#1E3A5F',
        forest:  '#1B4D3E',
        orange:  '#E07A3A',
        sand:    '#C4B49A',
        cream:   '#E8E4DE',
        success: '#1B4D3E',
        warning: '#D4A03A',
        danger:  '#C23728',
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Questrial', 'sans-serif'],
        number:  ['Saira Condensed', 'sans-serif'],
        jp:      ['Shippori Mincho', 'serif'],
        'x-logo':   ['Questrial', 'sans-serif'],
        'x-mincho': ['Shippori Mincho', 'serif'],
        'x-bi':     ['Cormorant Garamond', 'serif'],
        'x-num':    ['Saira Condensed', 'sans-serif'],
        'x-ui':     ['Inter', 'sans-serif'],
        'x-ui-jp':  ['Noto Sans JP', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
