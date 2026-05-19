// komu10 会計システム v0.6.0
// 請求書計算ロジック — 単一ソース
// InvoiceTab.tsx / export/route.ts の両方から呼び出すこと。
// 税率改定時はこのファイル1箇所のみ修正する。

import type {
  WithholdingBasis,
  HeaderAmountType,
  FeeBurden,
  PaymentTermsType,
} from '@/types/database';

// -----------------------------------------------------------------------------
// 源泉徴収額の計算
// -----------------------------------------------------------------------------
// 支払金額が100万円以下: 支払金額 × 10.21%
// 支払金額が100万円超:   (支払金額 - 100万円) × 20.42% + 102,100円
// 1円未満切り捨て
// basis: 'tax_included' → 税込金額をbaseに使用
//        'tax_excluded' → 税抜金額をbaseに使用
// 免税事業者は tax_amount=0 のため税込/税抜は同値になる。
// -----------------------------------------------------------------------------
export function calculateWithholding(
  base: number,
  _basis: WithholdingBasis,
): number {
  if (!base || base <= 0) return 0;
  const THRESHOLD = 1_000_000;
  const LOWER_RATE = 0.1021;
  const UPPER_RATE = 0.2042;
  const LOWER_FIXED = 102_100;
  let tax: number;
  if (base <= THRESHOLD) {
    tax = base * LOWER_RATE;
  } else {
    tax = (base - THRESHOLD) * UPPER_RATE + LOWER_FIXED;
  }
  return Math.floor(tax);
}

// -----------------------------------------------------------------------------
// 差引振込額 = 小計 + 消費税 - 源泉徴収額
// -----------------------------------------------------------------------------
export function calculateNetPayment(
  subtotal: number,
  taxAmount: number,
  withholdingAmount: number,
): number {
  return (subtotal || 0) + (taxAmount || 0) - (withholdingAmount || 0);
}

// -----------------------------------------------------------------------------
// 冒頭金額（請求書冒頭に大きく表示する金額）
// -----------------------------------------------------------------------------
export function calculateHeaderAmount(
  subtotal: number,
  taxAmount: number,
  netPayment: number,
  headerType: HeaderAmountType,
): number {
  if (headerType === 'net_payment') return netPayment;
  return (subtotal || 0) + (taxAmount || 0);
}

// -----------------------------------------------------------------------------
// 支払期限の自動算出
// month_end_next_month_end → 発行日の翌月末日
// その他 → null（手動入力を促す）
// -----------------------------------------------------------------------------
export function calculateDueDate(
  issueDate: string,
  termsType: PaymentTermsType | string | null | undefined,
): string | null {
  if (!issueDate) return null;
  if (termsType !== 'month_end_next_month_end') return null;
  const d = new Date(issueDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  // 翌月末日 = 翌々月の0日 = 翌月末
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed
  const endOfNextMonth = new Date(y, m + 2, 0); // month + 2 の 0日 = month + 1 の末日
  const yyyy = endOfNextMonth.getFullYear();
  const mm = String(endOfNextMonth.getMonth() + 1).padStart(2, '0');
  const dd = String(endOfNextMonth.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// -----------------------------------------------------------------------------
// 督促判定（UI表示用・DB書換はしない）
// -----------------------------------------------------------------------------
export function isOverdue(
  status: string,
  dueDate: string | null | undefined,
): boolean {
  if (!dueDate) return false;
  if (status === 'paid' || status === 'draft') return false;
  const due = new Date(dueDate + 'T00:00:00');
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

// -----------------------------------------------------------------------------
// 振込手数料負担ラベル
// -----------------------------------------------------------------------------
export function feeBurdenLabel(fb: FeeBurden | string | null | undefined): string {
  if (fb === 'self') {
    return '振込手数料は弊社にてご負担いたします。';
  }
  return '恐れ入りますが、お振込手数料は貴社にてご負担くださいますようお願い申し上げます。';
}

// -----------------------------------------------------------------------------
// 支払条件ラベル
// v0.51.0(s101): 経営企画チケットv2 リグレッション① 対応
// 3種:契約書準拠 / 月末締翌月末払い / 自由入力
// 'custom' の場合は customPaymentTerms(invoice.payment_terms 等)を呼び出し側で使う
// -----------------------------------------------------------------------------
export function paymentTermsLabel(
  termsType: PaymentTermsType | string | null | undefined,
  customPaymentTerms?: string | null,
): string {
  if (termsType === 'month_end_next_month_end') return '月末締翌月末払い';
  if (termsType === 'custom') return customPaymentTerms?.trim() || '契約書記載の支払条件に準ずる';
  // contract_based またはデフォルト
  return '契約書記載の支払条件に準ずる';
}

// -----------------------------------------------------------------------------
// 全金額の一括算出（画面・API共通で使用）
// -----------------------------------------------------------------------------
export interface InvoiceCalcInput {
  subtotal: number;
  taxAmount: number;
  withholdingTax: boolean;
  withholdingBasis: WithholdingBasis;
  headerAmountType: HeaderAmountType;
}

export interface InvoiceCalcResult {
  subtotal: number;
  taxAmount: number;
  total: number;              // subtotal + taxAmount
  withholdingAmount: number;  // withholdingTax=false の場合は 0
  netPayment: number;         // total - withholdingAmount
  headerAmount: number;
}

export function calculateInvoiceAmounts(input: InvoiceCalcInput): InvoiceCalcResult {
  const subtotal = Number(input.subtotal) || 0;
  const taxAmount = Number(input.taxAmount) || 0;
  const total = subtotal + taxAmount;
  let withholdingAmount = 0;
  if (input.withholdingTax) {
    // basis='tax_included' → total を base に、'tax_excluded' → subtotal
    const base = input.withholdingBasis === 'tax_excluded' ? subtotal : total;
    withholdingAmount = calculateWithholding(base, input.withholdingBasis);
  }
  const netPayment = total - withholdingAmount;
  const headerAmount = calculateHeaderAmount(
    subtotal,
    taxAmount,
    netPayment,
    input.headerAmountType,
  );
  return { subtotal, taxAmount, total, withholdingAmount, netPayment, headerAmount };
}

// -----------------------------------------------------------------------------
// 円表示フォーマッタ
// -----------------------------------------------------------------------------
export function formatYen(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return `¥${v.toLocaleString('ja-JP')}`;
}
