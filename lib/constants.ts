// ═══════════════════════════════════════════════════════════════
// komu10 定数定義
// ═══════════════════════════════════════════════════════════════

export const DIVISIONS = [
  { id: 'data', label: '観光データサイエンス', short: 'DATA', color: '#D4A03A' },
  { id: 'business', label: '観光事業の設計・実装', short: 'BIZ', color: '#1E3A5F' },
  { id: 'editorial', label: '編集・体験設計', short: 'EDIT', color: '#81D8D0' },
  { id: 'thisplace', label: 'THIS PLACE', short: 'TP', color: '#FF5F45' },
  { id: 'youtube', label: 'YouTube', short: 'YT', color: '#C23728' },
  { id: 'general', label: '共通（按分対象）', short: 'GEN', color: '#C4B49A' },
] as const;

export const KAMOKU = [
  { id: 'sales', label: '売上高', type: 'revenue' as const, icon: '💰', anbun: false },
  { id: 'travel', label: '旅費交通費', type: 'expense' as const, icon: '✈', anbun: false },
  { id: 'equipment', label: '消耗品費', type: 'expense' as const, icon: '⚙', anbun: false },
  { id: 'communication', label: '通信費', type: 'expense' as const, icon: '📡', anbun: true },
  { id: 'entertainment', label: '接待交際費', type: 'expense' as const, icon: '🍽', anbun: false },
  { id: 'supplies', label: '事務用品費', type: 'expense' as const, icon: '📎', anbun: false },
  { id: 'outsource', label: '外注費', type: 'expense' as const, icon: '🤝', anbun: false },
  { id: 'advertising', label: '広告宣伝費', type: 'expense' as const, icon: '📣', anbun: false },
  { id: 'rent', label: '地代家賃', type: 'expense' as const, icon: '🏠', anbun: true },
  { id: 'utility', label: '水道光熱費', type: 'expense' as const, icon: '💡', anbun: true },
  { id: 'insurance', label: '保険料', type: 'expense' as const, icon: '🛡', anbun: false },
  { id: 'depreciation', label: '減価償却費', type: 'expense' as const, icon: '📉', anbun: false },
  { id: 'vehicle', label: '車両費', type: 'expense' as const, icon: '🚗', anbun: true },
  { id: 'tax', label: '租税公課', type: 'expense' as const, icon: '🏛', anbun: false },
  { id: 'subscription', label: '新聞図書費', type: 'expense' as const, icon: '📚', anbun: false },
  { id: 'repair', label: '修繕費', type: 'expense' as const, icon: '🔧', anbun: false },
  { id: 'misc', label: '雑費', type: 'expense' as const, icon: '📦', anbun: false },
] as const;

export const REVENUE_TYPES = [
  { id: 'consulting', label: 'コンサルティング報酬' },
  { id: 'production', label: '制作費' },
  { id: 'ad_revenue', label: '広告収益（YouTube）' },
  { id: 'affiliate', label: 'アフィリエイト' },
  { id: 'tieup', label: 'タイアップ' },
  { id: 'license', label: 'ライセンス（写真等）' },
  { id: 'other', label: 'その他' },
] as const;

export const USERS = [
  { id: 'tomo', name: 'トモ' },
  { id: 'toshiki', name: 'トシキ' },
] as const;

export const ASSET_CATEGORIES = [
  { id: 'camera', label: 'カメラ', life: 5 },
  { id: 'lens', label: 'レンズ', life: 5 },
  { id: 'pc', label: 'PC', life: 4 },
  { id: 'drone', label: 'ドローン', life: 5 },
  { id: 'other', label: 'その他', life: 5 },
] as const;

export const PROJECT_STATUSES = [
  { id: 'ordered', label: '受注' },
  { id: 'active', label: '進行中' },
  { id: 'completed', label: '完了' },
] as const;

export const THEMES = [
  { id: 'light', label: 'ライト', bg: '#F5F5F3', card: '#fff', txt: '#0A0A0B' },
  { id: 'warm', label: 'ウォーム', bg: '#FAF5EF', card: '#FFFDF8', txt: '#2D1E0F' },
  { id: 'cool', label: 'クール', bg: '#F0F3F5', card: '#F8FAFC', txt: '#0A1520' },
] as const;
