// ═══════════════════════════════════════════════════════════════
// komu10 ユーティリティ
// ═══════════════════════════════════════════════════════════════

export const formatCurrency = (n: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n || 0);
};

export const formatDate = (d: string | Date | null): string => {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const formatDateJP = (d: string | Date | null): string => {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};
