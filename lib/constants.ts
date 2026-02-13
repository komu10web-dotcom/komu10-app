// komu10 会計・事業管理システム - 定数定義

export const DIVISIONS = [
  { id: 'data', name: '観光データサイエンス', abbr: 'DATA', color: '#D4A03A' },
  { id: 'business', name: '観光事業の設計・実装', abbr: 'BIZ', color: '#1E3A5F' },
  { id: 'editorial', name: '編集・体験設計', abbr: 'EDIT', color: '#81D8D0' },
  { id: 'thisplace', name: 'THIS PLACE', abbr: 'TP', color: '#FF5F45' },
  { id: 'youtube', name: 'YouTube', abbr: 'YT', color: '#C23728' },
  { id: 'general', name: '共通（按分対象）', abbr: 'GEN', color: '#C4B49A' },
] as const;

export const KAMOKU = [
  { id: 'sales', name: '売上高', type: 'revenue', anbun: false },
  { id: 'travel', name: '旅費交通費', type: 'expense', anbun: false },
  { id: 'equipment', name: '消耗品費', type: 'expense', anbun: false },
  { id: 'communication', name: '通信費', type: 'expense', anbun: true },
  { id: 'entertainment', name: '接待交際費', type: 'expense', anbun: false },
  { id: 'supplies', name: '事務用品費', type: 'expense', anbun: false },
  { id: 'outsource', name: '外注費', type: 'expense', anbun: false },
  { id: 'advertising', name: '広告宣伝費', type: 'expense', anbun: false },
  { id: 'rent', name: '地代家賃', type: 'expense', anbun: true },
  { id: 'utility', name: '水道光熱費', type: 'expense', anbun: true },
  { id: 'insurance', name: '保険料', type: 'expense', anbun: false },
  { id: 'depreciation', name: '減価償却費', type: 'expense', anbun: false },
  { id: 'vehicle', name: '車両費', type: 'expense', anbun: true },
  { id: 'tax', name: '租税公課', type: 'expense', anbun: false },
  { id: 'subscription', name: '新聞図書費', type: 'expense', anbun: false },
  { id: 'repair', name: '修繕費', type: 'expense', anbun: false },
  { id: 'misc', name: '雑費', type: 'expense', anbun: false },
] as const;

export const REVENUE_TYPES = [
  { id: 'consulting', name: 'コンサルティング報酬' },
  { id: 'production', name: '制作費' },
  { id: 'ad_revenue', name: '広告収益（YouTube）' },
  { id: 'affiliate', name: 'アフィリエイト' },
  { id: 'tieup', name: 'タイアップ' },
  { id: 'license', name: 'ライセンス（写真等）' },
  { id: 'other', name: 'その他' },
] as const;

export const PROJECT_STATUS = [
  { id: 'ordered', name: '受注', color: '#D4A03A' },
  { id: 'active', name: '進行中', color: '#1B4D3E' },
  { id: 'completed', name: '完了', color: '#C4B49A' },
] as const;

export const USERS = [
  { key: 'all', name: '全体' },
  { key: 'tomo', name: 'トモ' },
  { key: 'toshiki', name: 'トシキ' },
] as const;

export const COLORS = {
  gold: '#D4A03A',
  crimson: '#C23728',
  teal: '#81D8D0',
  sunset: '#FF5F45',
  navy: '#1E3A5F',
  green: '#1B4D3E',
  sand: '#C4B49A',
  bg: '#F5F5F3',
  textPrimary: 'rgba(10,10,11,0.85)',
  textSecondary: 'rgba(10,10,11,0.5)',
  textMuted: 'rgba(10,10,11,0.3)',
  border: 'rgba(10,10,11,0.08)',
} as const;

export function getDivision(id: string) {
  return DIVISIONS.find(d => d.id === id);
}

export function getKamoku(id: string) {
  return KAMOKU.find(k => k.id === id);
}

export function getRevenueType(id: string) {
  return REVENUE_TYPES.find(r => r.id === id);
}

export function getStatus(id: string) {
  return PROJECT_STATUS.find(s => s.id === id);
}

export function getUser(key: string) {
  return USERS.find(u => u.key === key);
}

export function formatYen(amount: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
