/**
 * brandTokens.ts — komu10 アプリ全体のブランドカラー・タイポグラフィ一元管理
 *
 * 設計思想:
 *   - ブランド規定 v4 (session48 確定) の 7色を絶対正典とする
 *   - アプリ画面用の調整色(明色UI最適化版)は独立して定義
 *   - すべてのコンポーネントは color: BRAND.x.gold のように参照すること
 *   - ハードコード(#D4A03A 等の直書き)は禁止
 *
 * 将来の波及対応:
 *   - ブランド規定変更時 → このファイル1か所の変更で全画面に反映
 *   - テーマ切替(ダーク/ライト) → このファイルの値をテーマで切り替えるだけ
 *   - カラープリセット拡張 → owner_color はこのファイルの値をベースに上書き
 *
 * 命名規則:
 *   - x.* = ブランド規定書 v1.4-rev4 の正典7色(変更不可・規定書改訂時のみ更新)
 *   - app.* = アプリ画面用の明色UI最適化調整(視認性・疲労軽減)
 *   - dark.* = Renaissance 暗色基調用パレット
 *   - sub.* = サブセマンティック(text系・border系・surface系)
 *
 * 統括: Hedi (CEO) / Saville (CBO) / Scher (CDO)
 * 実装: Patrick Collison / v0.33.0 — 2026-04-30
 */

// ============================================================
// ブランド規定 v1.4-rev4 正典 7色(変更時は規定書とセット)
// ============================================================
export const X_BRAND = {
  black:    '#0A0A0B',  // X Black     / Carbon Black            / PMS Black 6C
  white:    '#FFFFFF',  // X White     / Titanium White
  milk:     '#FAFAF6',  // X Milk      / Eggshell
  gold:     '#B8893A',  // X Gold      / Antique Brass           / PMS 8642
  green:    '#2A4A3A',  // X Green     / British Racing Green    / PMS 5535C
  burgundy: '#5A1F24',  // X Burgundy  / Pinot Noir Burgundy     / PMS 7421C
  red:      '#AA2A2A',  // X Red       / Rosso Corsa             / PMS 1805C
} as const;

// ============================================================
// アプリ画面用 調整パレット(明色UI最適化版)
// ブランド7色を画面表示で疲れない明度に微調整した版。ブランド本義は維持。
// ============================================================
export const APP_LIGHT = {
  // アクセント(ブランド色をUI画面で映える明度に調整)
  gold:     '#D4A03A',  // X Gold をUI明度+15
  green:    '#1B4D3E',  // X Green をUI明度+調整
  red:      '#C23728',  // X Red をUI明度調整(エラー表示用)
  // 背景・サーフェス
  bg:       '#FFFFFF',  // X White
  surface:  '#FAFAF8',  // 微差のサーフェス
  surfaceAlt: '#F5F5F3',  // 一段引いたサーフェス
  // テキスト階層
  text:     '#1a1a1a',  // 最高彩度の本文(完全黒は強すぎ)
  textSub:  '#666666',
  textMute: '#999999',
  textFade: '#bbbbbb',
  textGhost: '#ddd',
  // 枠線
  line:     '#f0f0f0',
  lineSoft: '#fafafa',
} as const;

// ============================================================
// Renaissance 暗色基調パレット(経営ダッシュボード/確定申告 δ案)
// ============================================================
export const APP_DARK = {
  bg:        '#0a0a0b',   // X Black
  surface:   '#131316',
  surfaceHi: '#1a1a1f',
  line:        'rgba(255,255,255,0.08)',
  lineSoft:    'rgba(255,255,255,0.04)',
  text:        'rgba(255,255,255,0.92)',
  textSub:     'rgba(255,255,255,0.55)',
  textMute:    'rgba(255,255,255,0.32)',
  textFade:    'rgba(255,255,255,0.20)',
  // アクセント(暗色背景に映える明度)
  gold:        '#D4A03A',
  goldSoft:    'rgba(212,160,58,0.18)',
  green:       '#1B4D3E',
  greenSoft:   'rgba(27,77,62,0.25)',
  crimson:     '#C23728',
  crimsonSoft: 'rgba(194,55,40,0.22)',
} as const;

// ============================================================
// コンテンツ色(SCENE NOTES / THIS PLACE / DATA SCIENCE / DATA FILES)
// ブランド規定の派生子ブランド色
// ============================================================
export const CONTENT_COLORS = {
  sceneNotes:  '#81D8D0',  // SCENE NOTES パステルブルー
  thisPlace:   '#FF5F45',  // THIS PLACE サンセット
  dataScience: '#1A5F8A',  // DATA SCIENCE ディープブルー
  dataFiles:   '#C23728',  // DATA FILES クリムゾン
} as const;

// ============================================================
// セマンティック・エイリアス(意味で参照)
// ============================================================
export const SEMANTIC = {
  // 状態
  success: APP_LIGHT.green,
  warning: APP_LIGHT.gold,
  danger:  APP_LIGHT.red,
  // 金額
  positive: APP_LIGHT.green,
  negative: APP_LIGHT.red,
  neutral:  APP_LIGHT.text,
} as const;

// ============================================================
// タイポグラフィ(規定書 §4 X 命名・基本書体)
// session77 改訂:Big Shoulders Display Black + Bricolage Grotesque を追加
// ============================================================
export const FONTS = {
  logo:    "'Questrial', sans-serif",                   // X ロゴ
  mincho:  "'Shippori Mincho', serif",                   // X 明朝(和文見出し)
  num:     "'Saira Condensed', sans-serif",              // X 数字(凡例・極小)
  ui:      "'Inter', sans-serif",                        // X UI(英文本文)
  uiJp:    "'Noto Sans JP', sans-serif",                 // X UI 和
  // session77 追加(コンテンツ名 THE MONEY BOOK / 章扉 / KPI 巨大数字)
  display: "'Big Shoulders Display', sans-serif",        // X Display(60-500px・Black 900)
  brico:   "'Bricolage Grotesque', sans-serif",          // X Brico(14-60px・Variable 200..800)
  // Cormorant Garamond は失敗事例#1 で全廃済(session52-53 / Paula Scher 整合性違反)
} as const;

// ============================================================
// タイポ階層スケール(Khoi Vinh modular scale 1.333 / Renaissance Phase 1)
// session77 確定:fontSize 直書き 15種 → 7階層+和文h1 に圧縮
// 判定:Paula Scher(タイポ階層)/ Edward Tufte(数値根拠)/ 小林章(和欧混植)
//
// 階層運用ルール:
//   t1=主指標(画面の主役・KPI最大値)
//   t2=副指標(主の対比・大型KPI)
//   t3=中指標(セクション内合計・カード内主役)
//   t4=文脈数字/和文セクション(modular base)
//   t5=本文(プロジェクト名・科目名・基本本文)
//   t6=補助(ラベル・小キャプション・トラッキング英字)
//   t7=メタ(更新日・データソース・極小キャプション)
//   h1Jp=和文画面タイトル(Shippori Mincho 専用)
// ============================================================
export const TYPE_SCALE = {
  t1:    128,  // 階層1 主指標(Saira / fw 300)
  t2:     56,  // 階層2 副指標(Saira / fw 400)
  t3:     28,  // 階層3 中指標(Saira / fw 500)
  t4:     18,  // 階層4 文脈数字 / 和文セクション(Saira fw 500 / Mincho fw 400)
  t5:     14,  // 階層5 本文(Inter / Mincho fw 400)
  t6:     11,  // 階層6 補助(Inter fw 400 / tracking 0.2em)
  t7:      9,  // 階層7 メタ(Inter fw 400 / tracking 0.3em / uppercase)
  h1Jp:   40,  // 和文画面タイトル(Shippori Mincho / fw 400)
} as const;

// ============================================================
// 統合エクスポート(主に使う名前空間)
// ============================================================
export const BRAND = {
  x:       X_BRAND,
  app:     APP_LIGHT,
  dark:    APP_DARK,
  content: CONTENT_COLORS,
  sem:     SEMANTIC,
  font:    FONTS,
  scale:   TYPE_SCALE,
} as const;

export default BRAND;
