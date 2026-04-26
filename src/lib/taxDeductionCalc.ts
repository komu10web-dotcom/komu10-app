// komu10 v0.30.0
// 所得控除の計算ロジック(純関数群)
// UIから完全に独立。データ層とAPIから利用される。
// 税法の改正に追随するための単一の修正点として機能する。

import type { Database } from '@/types/database';

type TaxDeduction = Database['public']['Tables']['tax_deductions']['Row'];
type MedicalExpenseDetail = Database['public']['Tables']['medical_expense_details']['Row'];

// ─────────────────────────────────────────────────────────
// 1. 社会保険料控除
// 全額控除(支払額 = 控除額)
// ─────────────────────────────────────────────────────────
export function calcSocialInsuranceDeduction(deductions: TaxDeduction[]): number {
  const row = deductions.find(d => d.deduction_key === 'social_insurance');
  return Math.max(0, Number(row?.amount ?? 0));
}

// ─────────────────────────────────────────────────────────
// 2. 小規模企業共済等掛金控除
// 3カテゴリ(共済 / iDeCo / 国民年金基金)を合算・全額控除
// ─────────────────────────────────────────────────────────
export function calcSmallEnterpriseDeduction(deductions: TaxDeduction[]): {
  total: number;
  kyosai: number;
  ideco: number;
  kokuminKikin: number;
} {
  const get = (key: string) =>
    Math.max(0, Number(deductions.find(d => d.deduction_key === key)?.amount ?? 0));
  const kyosai = get('small_enterprise_kyosai');
  const ideco = get('small_enterprise_ideco');
  const kokuminKikin = get('small_enterprise_kokumin_kikin');
  return { total: kyosai + ideco + kokuminKikin, kyosai, ideco, kokuminKikin };
}

// ─────────────────────────────────────────────────────────
// 3. 医療費控除
// 計算式: (支払医療費 - 保険等補填額) - max(10万円, 所得×5%)
// 上限200万円
// ─────────────────────────────────────────────────────────
export function calcMedicalDeduction(params: {
  notificationAmount: number;     // 通知書記載の年額
  notificationReimbursement: number; // 通知書ベースの補填額
  details: MedicalExpenseDetail[]; // 追加明細(セルメデ対象は除外)
  totalIncome: number;             // 所得金額(足切り計算用)
}): {
  paidTotal: number;        // 支払医療費合計
  reimbursementTotal: number; // 補填額合計
  netExpense: number;       // 差引後の正味医療費
  threshold: number;        // 足切り基準(10万円 or 所得×5%の小さい方)
  deduction: number;        // 控除額(上限200万円)
} {
  const { notificationAmount, notificationReimbursement, details, totalIncome } = params;

  // セルメデ対象は除外(別税制で扱う)
  const nonSelfmedDetails = details.filter(d => !d.is_selfmed);

  const detailsAmount = nonSelfmedDetails.reduce((s, d) => s + Number(d.amount), 0);
  const detailsReimbursement = nonSelfmedDetails.reduce((s, d) => s + Number(d.reimbursement), 0);

  const paidTotal = Math.max(0, notificationAmount) + detailsAmount;
  const reimbursementTotal = Math.max(0, notificationReimbursement) + detailsReimbursement;

  const netExpense = Math.max(0, paidTotal - reimbursementTotal);

  // 足切り: 所得200万円未満なら所得×5%、それ以上なら10万円
  const threshold = totalIncome < 2_000_000
    ? Math.floor(totalIncome * 0.05)
    : 100_000;

  const beforeCap = Math.max(0, netExpense - threshold);
  const deduction = Math.min(beforeCap, 2_000_000); // 上限200万円

  return { paidTotal, reimbursementTotal, netExpense, threshold, deduction };
}

// ─────────────────────────────────────────────────────────
// 4. セルフメディケーション税制
// 計算式: (対象購入額 - 補填額) - 12,000円
// 上限88,000円
// 適用要件: 健診・予防接種等を1年に1回受けていること
// ─────────────────────────────────────────────────────────
export function calcSelfMedicationDeduction(params: {
  details: MedicalExpenseDetail[]; // is_selfmed=true のみ集計
  qualified: boolean;              // 適用要件を満たしているか
}): {
  paidTotal: number;
  reimbursementTotal: number;
  netExpense: number;
  deduction: number;
  qualified: boolean;
} {
  const { details, qualified } = params;
  const selfmed = details.filter(d => d.is_selfmed);

  const paidTotal = selfmed.reduce((s, d) => s + Number(d.amount), 0);
  const reimbursementTotal = selfmed.reduce((s, d) => s + Number(d.reimbursement), 0);
  const netExpense = Math.max(0, paidTotal - reimbursementTotal);

  if (!qualified) {
    return { paidTotal, reimbursementTotal, netExpense, deduction: 0, qualified };
  }

  const beforeCap = Math.max(0, netExpense - 12_000);
  const deduction = Math.min(beforeCap, 88_000); // 上限88,000円

  return { paidTotal, reimbursementTotal, netExpense, deduction, qualified };
}

// ─────────────────────────────────────────────────────────
// 5. 医療費控除 vs セルメデ税制 — 有利判定
// ─────────────────────────────────────────────────────────
export type MedicalMethodChoice = 'medical' | 'self_medication' | 'auto';

export function determineMedicalAdvantage(params: {
  medicalDeduction: number;
  selfmedDeduction: number;
  selectedMethod: MedicalMethodChoice;
}): {
  recommended: 'medical' | 'self_medication' | 'tie';
  applied: 'medical' | 'self_medication' | 'none';
  appliedAmount: number;
  difference: number;
} {
  const { medicalDeduction, selfmedDeduction, selectedMethod } = params;
  const difference = Math.abs(medicalDeduction - selfmedDeduction);

  let recommended: 'medical' | 'self_medication' | 'tie';
  if (medicalDeduction > selfmedDeduction) recommended = 'medical';
  else if (selfmedDeduction > medicalDeduction) recommended = 'self_medication';
  else recommended = 'tie';

  // selectedMethod='auto' の場合は自動的に有利な方を採用
  let applied: 'medical' | 'self_medication' | 'none';
  let appliedAmount: number;

  if (selectedMethod === 'medical') {
    applied = medicalDeduction > 0 ? 'medical' : 'none';
    appliedAmount = medicalDeduction;
  } else if (selectedMethod === 'self_medication') {
    applied = selfmedDeduction > 0 ? 'self_medication' : 'none';
    appliedAmount = selfmedDeduction;
  } else {
    // auto
    if (recommended === 'medical' || recommended === 'tie') {
      applied = medicalDeduction > 0 ? 'medical' : (selfmedDeduction > 0 ? 'self_medication' : 'none');
      appliedAmount = applied === 'medical' ? medicalDeduction : (applied === 'self_medication' ? selfmedDeduction : 0);
    } else {
      applied = selfmedDeduction > 0 ? 'self_medication' : 'none';
      appliedAmount = selfmedDeduction;
    }
  }

  return { recommended, applied, appliedAmount, difference };
}

// ─────────────────────────────────────────────────────────
// 6. 全所得控除の集計(申告サマリー連携用)
// Phase 2 が扱う3項目のみを返す。Phase 3 で生命保険等を追加予定。
// ─────────────────────────────────────────────────────────
export function calcTotalDeductions(params: {
  deductions: TaxDeduction[];
  details: MedicalExpenseDetail[];
  totalIncome: number;
}): {
  socialInsurance: number;
  smallEnterprise: number;
  medical: number;
  total: number;
  breakdown: {
    medicalCalc: ReturnType<typeof calcMedicalDeduction>;
    selfmedCalc: ReturnType<typeof calcSelfMedicationDeduction>;
    advantage: ReturnType<typeof determineMedicalAdvantage>;
  };
} {
  const { deductions, details, totalIncome } = params;

  const socialInsurance = calcSocialInsuranceDeduction(deductions);
  const small = calcSmallEnterpriseDeduction(deductions);

  const notificationAmount = Number(
    deductions.find(d => d.deduction_key === 'medical_notification_amount')?.amount ?? 0
  );
  const notificationReimbursement = Number(
    deductions.find(d => d.deduction_key === 'medical_reimbursement')?.amount ?? 0
  );
  const selfmedQualified = Boolean(
    deductions.find(d => d.deduction_key === 'selfmed_qualified')?.bool_value ?? false
  );
  const methodRow = deductions.find(d => d.deduction_key === 'medical_method');
  const selectedMethod = (methodRow?.text_value ?? 'auto') as MedicalMethodChoice;

  const medicalCalc = calcMedicalDeduction({
    notificationAmount,
    notificationReimbursement,
    details,
    totalIncome,
  });
  const selfmedCalc = calcSelfMedicationDeduction({
    details,
    qualified: selfmedQualified,
  });
  const advantage = determineMedicalAdvantage({
    medicalDeduction: medicalCalc.deduction,
    selfmedDeduction: selfmedCalc.deduction,
    selectedMethod,
  });

  const medical = advantage.appliedAmount;
  const total = socialInsurance + small.total + medical;

  return {
    socialInsurance,
    smallEnterprise: small.total,
    medical,
    total,
    breakdown: { medicalCalc, selfmedCalc, advantage },
  };
}
