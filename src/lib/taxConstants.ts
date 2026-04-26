// v0.28.0: 所得控除タブ Phase 1
// 経営企画本部 綾瀬はるか(税務担当) レビュー指摘の反映用定数集約。
// 個別の控除入力UIは Phase 2-3 で実装。本ファイルは骨格定義のみ。

// ─────────────────────────────────────────────────────────
// 基礎控除(綾瀬指摘①)
// 令和2年改正以降、基礎控除は所得額により段階制。
// 令和8年(2026)分はさらに改正で上限が引き上げられる予定。
// 出典: 国税庁 令和8年分以後の基礎控除等の改正
// ─────────────────────────────────────────────────────────
export interface BasicDeductionTier {
  // 合計所得金額の上限(円)。null の場合は最上位帯(以下の所得すべて)
  incomeMax: number | null;
  // 控除額(円)
  amount: number;
}

// 令和7年(2025)分まで(従前の段階制)
export const BASIC_DEDUCTION_FY2025: BasicDeductionTier[] = [
  { incomeMax: 24_000_000, amount: 480_000 },
  { incomeMax: 24_500_000, amount: 320_000 },
  { incomeMax: 25_000_000, amount: 160_000 },
  { incomeMax: null,       amount: 0       },
];

// 令和8年(2026)分以降(改正後・段階拡大)
// ※ 段階の刻みは綾瀬レビュー反映時の最新情報に基づき要再確認。
//   実装着手時に国税庁公式の確定値で上書きすること。
export const BASIC_DEDUCTION_FY2026: BasicDeductionTier[] = [
  { incomeMax: 24_000_000, amount: 1_040_000 },
  { incomeMax: 24_500_000, amount: 880_000   },
  { incomeMax: 25_000_000, amount: 720_000   },
  { incomeMax: null,       amount: 0         },
];

// 年度から該当テーブルを取得
export function getBasicDeductionTable(year: number): BasicDeductionTier[] {
  if (year >= 2026) return BASIC_DEDUCTION_FY2026;
  return BASIC_DEDUCTION_FY2025;
}

// 合計所得金額から基礎控除額を算出
export function calculateBasicDeduction(year: number, totalIncome: number): number {
  const tiers = getBasicDeductionTable(year);
  for (const t of tiers) {
    if (t.incomeMax === null || totalIncome <= t.incomeMax) {
      return t.amount;
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────
// 人的控除の所得要件(綾瀬指摘②)
// 令和8年分から扶養親族・配偶者の合計所得金額要件が引き上げられる。
// 出典: 国税庁 令和8年分以後の人的控除等の改正
// ─────────────────────────────────────────────────────────
export interface DependentIncomeRequirements {
  // 扶養親族・控除対象配偶者の合計所得金額上限(円)
  dependentMax: number;
  // 配偶者特別控除の対象となる配偶者の合計所得金額上限(円)
  spouseSpecialMax: number;
  // 勤労学生控除の合計所得金額上限(円)
  workingStudentMax: number;
}

// 令和7年分まで
export const DEPENDENT_REQ_FY2025: DependentIncomeRequirements = {
  dependentMax:      480_000,
  spouseSpecialMax:  1_330_000,
  workingStudentMax: 750_000,
};

// 令和8年分以降(引き上げ後)
export const DEPENDENT_REQ_FY2026: DependentIncomeRequirements = {
  dependentMax:      620_000,
  spouseSpecialMax:  1_330_000, // 配偶者特別控除の上限は据え置き(綾瀬要再確認)
  workingStudentMax: 890_000,
};

export function getDependentRequirements(year: number): DependentIncomeRequirements {
  if (year >= 2026) return DEPENDENT_REQ_FY2026;
  return DEPENDENT_REQ_FY2025;
}

// ─────────────────────────────────────────────────────────
// 付加税(綾瀬指摘⑤)
// 2025-2037年: 復興特別所得税 2.1%
// 2027年以降: 防衛特別所得税 1% が追加(予定)
// ─────────────────────────────────────────────────────────
export interface SurtaxRates {
  // 復興特別所得税(基準所得税額に対する比率)
  reconstruction: number;
  // 防衛特別所得税(基準所得税額に対する比率)
  defense: number;
}

export function getSurtaxRates(year: number): SurtaxRates {
  return {
    reconstruction: year >= 2013 && year <= 2037 ? 0.021 : 0,
    defense:        year >= 2027 ? 0.010 : 0,
  };
}

// ─────────────────────────────────────────────────────────
// 所得控除項目の表示順とラベル(Phase 2-3 で個別UI実装時に参照)
// 申告書B様式に準じた順序
// ─────────────────────────────────────────────────────────
export const INCOME_DEDUCTION_ITEMS = [
  { key: 'social_insurance',     label: '社会保険料控除' },
  { key: 'small_enterprise',     label: '小規模企業共済等掛金控除' },
  { key: 'life_insurance',       label: '生命保険料控除' },
  { key: 'earthquake_insurance', label: '地震保険料控除' },
  { key: 'donation',             label: '寄附金控除(ふるさと納税等)' },
  { key: 'widow',                label: '寡婦・ひとり親控除' },
  { key: 'working_student',      label: '勤労学生控除' },
  { key: 'disability',           label: '障害者控除' },
  { key: 'spouse',               label: '配偶者控除・配偶者特別控除' },
  { key: 'dependent',            label: '扶養控除' },
  { key: 'basic',                label: '基礎控除' },
  { key: 'medical',              label: '医療費控除' },
  { key: 'casualty',             label: '雑損控除' },
] as const;

export type IncomeDeductionKey = typeof INCOME_DEDUCTION_ITEMS[number]['key'];

// ─────────────────────────────────────────────────────────
// v0.30.0 Phase 2: tax_deductions テーブルの deduction_key 一覧
// 13項目の親キーに加え、Phase 2 が扱うサブキーを定義
// ─────────────────────────────────────────────────────────
export const TAX_DEDUCTION_KEYS = {
  // 社会保険料控除(年額1本)
  socialInsurance: 'social_insurance',
  // 小規模企業共済等掛金控除(3カテゴリ別年額)
  smallEnterpriseKyosai: 'small_enterprise_kyosai',     // 小規模企業共済
  smallEnterpriseIdeco: 'small_enterprise_ideco',       // iDeCo
  smallEnterpriseKokuminKikin: 'small_enterprise_kokumin_kikin', // 国民年金基金
  // 医療費控除(通知書年額・補填額・選択方式)
  medicalNotificationAmount: 'medical_notification_amount',     // 通知書記載額
  medicalNotificationSource: 'medical_notification_source',     // 通知書発行元(国保/健保/マイナポータル)
  medicalReimbursement: 'medical_reimbursement',                // 保険等補填額
  medicalMethod: 'medical_method',                              // 'medical' | 'self_medication' | 'auto'(自動有利判定)
  // セルフメディケーション要件
  selfmedQualified: 'selfmed_qualified',                        // 健診・予防接種の充足(bool)
  selfmedQualificationNote: 'selfmed_qualification_note',       // 「2026年6月 健康診断」等のメモ
} as const;

export type TaxDeductionKey = typeof TAX_DEDUCTION_KEYS[keyof typeof TAX_DEDUCTION_KEYS];

// ─────────────────────────────────────────────────────────
// 医療費控除カテゴリ(medical_expense_details.category)
// ─────────────────────────────────────────────────────────
export const MEDICAL_CATEGORIES = [
  { key: 'otc',       label: '市販薬' },
  { key: 'transport', label: '通院交通費' },
  { key: 'dental',    label: '歯科自由診療' },
  { key: 'care',      label: '介護サービス' },
  { key: 'other',     label: 'その他' },
] as const;

export type MedicalCategory = typeof MEDICAL_CATEGORIES[number]['key'];

// 受診者区分(medical_expense_details.patient_type)
// session57: ボス指示で「自分/家族(生計を一にする)/その他」の3区分
export const PATIENT_TYPES = [
  { key: 'self',   label: '自分' },
  { key: 'family', label: '家族(生計を一にする)' },
  { key: 'other',  label: 'その他' },
] as const;

export type PatientType = typeof PATIENT_TYPES[number]['key'];
