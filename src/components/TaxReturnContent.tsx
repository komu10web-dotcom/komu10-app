'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import type { Transaction, Asset, AnbunSetting, FundTransfer, BankAccount } from '@/types/database';
import { Copy, Check, Download, Loader2, AlertTriangle } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';

// ============================================================
// 型定義
// ============================================================
export interface KamokuSummary {
  kamokuId: string;
  name: string;
  rawAmount: number;       // 按分前の合計
  anbunRatio: number | null; // 按分率（null=按分対象外）
  amount: number;          // 按分後の確定額
}

export interface DepreciationRow {
  id: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  businessUseRatio: number;
  currentYearAmount: number; // 当期償却額
  bookValue: number;         // 期末帳簿価額
}

export interface JournalEntry {
  date: string;
  debitAccount: string;
  debitAmount: number;
  creditAccount: string;
  creditAmount: number;
  description: string;
}

// ============================================================
// ユーティリティ
// ============================================================
const yen = (n: number) =>
  '¥' + Math.floor(n).toLocaleString('ja-JP');

const formatDate = (d: string) => {
  const [y, m, dd] = d.split('-');
  return `${m}/${dd}`;
};

// ============================================================
// コピーボタン
// ============================================================
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // フォールバック
      const el = document.createElement('textarea');
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-[#eee] transition-colors"
      title="金額をコピー"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-[#1B4D3E]" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-[#999]" />
      )}
    </button>
  );
}

// ============================================================
// 減価償却計算
// ============================================================
export function calcDepreciation(asset: Asset, year: number): DepreciationRow {
  const acqDate = new Date(asset.acquisition_date);
  const acqYear = acqDate.getFullYear();
  const acqMonth = acqDate.getMonth() + 1; // 1-12

  const annualAmount = Math.floor(
    (asset.acquisition_cost / asset.useful_life) * (asset.business_use_ratio / 100)
  );

  // 取得年は月割り（取得月から12月まで）
  let currentYearAmount: number;
  if (acqYear === year) {
    const months = 12 - acqMonth + 1;
    currentYearAmount = Math.floor(annualAmount * months / 12);
  } else if (acqYear > year) {
    currentYearAmount = 0;
  } else {
    currentYearAmount = annualAmount;
  }

  // 累計償却額（取得年から前年まで）
  let totalPrior = 0;
  for (let y = acqYear; y < year; y++) {
    if (y === acqYear) {
      const months = 12 - acqMonth + 1;
      totalPrior += Math.floor(annualAmount * months / 12);
    } else {
      totalPrior += annualAmount;
    }
  }

  // 帳簿価額は1円残す（備忘価額）
  const minBookValue = 1;
  const maxDepreciation = asset.acquisition_cost - minBookValue - totalPrior;
  if (currentYearAmount > maxDepreciation) {
    currentYearAmount = Math.max(0, maxDepreciation);
  }

  const bookValue = asset.acquisition_cost - totalPrior - currentYearAmount;

  return {
    id: asset.id,
    name: asset.name,
    acquisitionDate: asset.acquisition_date,
    acquisitionCost: asset.acquisition_cost,
    usefulLife: asset.useful_life,
    businessUseRatio: asset.business_use_ratio,
    currentYearAmount,
    bookValue,
  };
}

// ============================================================
// 仕訳生成
// ============================================================
export function generateJournalEntries(
  transactions: Transaction[],
  kamokuSummaries: KamokuSummary[],
  depreciationRows: DepreciationRow[],
  year: number,
  bankAccounts: BankAccount[],
  fundTransfers: FundTransfer[]
): JournalEntry[] {
  const entries: JournalEntry[] = [];

  // 貸方口座の動的決定
  const getCreditAccount = (tx: Transaction): string => {
    if (tx.payment_method === 'bank_account' && tx.bank_account_id) {
      const bank = bankAccounts.find(b => b.id === tx.bank_account_id);
      return `普通預金【${bank?.name || '不明'}】`;
    }
    return '事業主借';
  };

  // 確定申告仕訳帳はsettledのみ対象（forecast/accrued/billedは除外）
  const settled = transactions.filter(tx => tx.status === 'settled' || !tx.status);

  for (const tx of settled) {
    const k = KAMOKU[tx.kamoku as keyof typeof KAMOKU];
    if (!k) continue;

    const desc = [tx.store, tx.description].filter(Boolean).join(' ');
    const hasDateDiff = tx.actual_payment_date && tx.date !== tx.actual_payment_date;

    if (tx.tx_type === 'expense') {
      const creditAccount = getCreditAccount(tx);

      if (hasDateDiff) {
        // 前払い: 支払日と利用日が異なる
        // 1) 支払時: 前払費用 / [貸方]  ← actual_payment_date
        entries.push({
          date: tx.actual_payment_date!,
          debitAccount: '前払費用',
          debitAmount: tx.amount,
          creditAccount,
          creditAmount: tx.amount,
          description: `[前払] ${desc}`,
        });
        // 2) 費用計上: 科目 / 前払費用 ← date（利用日）
        entries.push({
          date: tx.date,
          debitAccount: k.name,
          debitAmount: tx.amount,
          creditAccount: '前払費用',
          creditAmount: tx.amount,
          description: desc,
        });
      } else {
        // 即時: 科目 / [貸方]
        entries.push({
          date: tx.date,
          debitAccount: k.name,
          debitAmount: tx.amount,
          creditAccount,
          creditAmount: tx.amount,
          description: desc,
        });
      }
    } else {
      // 売上
      if (hasDateDiff) {
        // PL計上と入金が異なる
        // 1) PL計上: 売掛金 / 売上高 ← date（納品日）
        entries.push({
          date: tx.date,
          debitAccount: '売掛金',
          debitAmount: tx.amount,
          creditAccount: '売上高',
          creditAmount: tx.amount,
          description: desc,
        });
        // 2) 入金: 普通預金 / 売掛金 ← actual_payment_date
        entries.push({
          date: tx.actual_payment_date!,
          debitAccount: '普通預金',
          debitAmount: tx.amount,
          creditAccount: '売掛金',
          creditAmount: tx.amount,
          description: `[入金] ${desc}`,
        });
      } else {
        // 即時入金: 普通預金 / 売上高
        entries.push({
          date: tx.date,
          debitAccount: '普通預金',
          debitAmount: tx.amount,
          creditAccount: '売上高',
          creditAmount: tx.amount,
          description: desc,
        });
      }
    }
  }

  // 資金移動の仕訳（fund_transfers）
  for (const ft of fundTransfers) {
    const fromBank = ft.from_bank_account_id
      ? bankAccounts.find(b => b.id === ft.from_bank_account_id)
      : null;
    const toBank = ft.to_bank_account_id
      ? bankAccounts.find(b => b.id === ft.to_bank_account_id)
      : null;

    if (ft.transfer_type === 'owner_deposit') {
      // 個人→事業口座: 普通預金 / 事業主借
      entries.push({
        date: ft.transfer_date,
        debitAccount: `普通預金【${toBank?.name || '事業口座'}】`,
        debitAmount: ft.amount,
        creditAccount: '事業主借',
        creditAmount: ft.amount,
        description: ft.memo || '個人資金入金',
      });
      if (ft.transfer_fee > 0) {
        entries.push({
          date: ft.transfer_date,
          debitAccount: '支払手数料',
          debitAmount: ft.transfer_fee,
          creditAccount: '事業主借',
          creditAmount: ft.transfer_fee,
          description: '振込手数料',
        });
      }
    } else if (ft.transfer_type === 'owner_withdrawal') {
      // 事業→個人口座: 事業主貸 / 普通預金
      entries.push({
        date: ft.transfer_date,
        debitAccount: '事業主貸',
        debitAmount: ft.amount,
        creditAccount: `普通預金【${fromBank?.name || '事業口座'}】`,
        creditAmount: ft.amount,
        description: ft.memo || '個人引出',
      });
      if (ft.transfer_fee > 0) {
        entries.push({
          date: ft.transfer_date,
          debitAccount: '支払手数料',
          debitAmount: ft.transfer_fee,
          creditAccount: `普通預金【${fromBank?.name || '事業口座'}】`,
          creditAmount: ft.transfer_fee,
          description: '振込手数料',
        });
      }
    } else if (ft.transfer_type === 'internal_transfer') {
      // 口座間移動: 普通預金[先] / 普通預金[元]
      entries.push({
        date: ft.transfer_date,
        debitAccount: `普通預金【${toBank?.name || '移動先'}】`,
        debitAmount: ft.amount,
        creditAccount: `普通預金【${fromBank?.name || '移動元'}】`,
        creditAmount: ft.amount,
        description: ft.memo || '口座間振替',
      });
      if (ft.transfer_fee > 0) {
        entries.push({
          date: ft.transfer_date,
          debitAccount: '支払手数料',
          debitAmount: ft.transfer_fee,
          creditAccount: `普通預金【${fromBank?.name || '移動元'}】`,
          creditAmount: ft.transfer_fee,
          description: '振込手数料',
        });
      }
    }
  }

  // 減価償却の仕訳（年末に一括）
  for (const dep of depreciationRows) {
    if (dep.currentYearAmount <= 0) continue;
    entries.push({
      date: `${year}-12-31`,
      debitAccount: '減価償却費',
      debitAmount: dep.currentYearAmount,
      creditAccount: '工具器具備品',
      creditAmount: dep.currentYearAmount,
      description: `${dep.name} 定額法`,
    });
  }

  // 日付順ソート
  entries.sort((a, b) => a.date.localeCompare(b.date));

  return entries;
}

// ============================================================
// CSV出力
// ============================================================
export function downloadCSV(entries: JournalEntry[], year: number, ownerLabel: string) {
  const header = '日付,借方科目,借方金額,貸方科目,貸方金額,摘要';
  const rows = entries.map(e =>
    `${e.date},"${e.debitAccount}",${e.debitAmount},"${e.creditAccount}",${e.creditAmount},"${e.description || ''}"`
  );
  const csv = '\uFEFF' + [header, ...rows].join('\n'); // BOM付きUTF-8

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `仕訳帳_${year}_${ownerLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function TaxReturnContent() {
  const { owner, year: yearStr } = usePeriodRange();
  const year = parseInt(yearStr);

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [anbunSettings, setAnbunSettings] = useState<AnbunSetting[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [fundTransfers, setFundTransfers] = useState<FundTransfer[]>([]);
  // v0.17.0: 事業者ステータス + 過去2年売上（インボイス判定用）
  const [invoiceRegistered, setInvoiceRegistered] = useState(false);
  const [isTaxable, setIsTaxable] = useState(false);
  const [revenueCurrent, setRevenueCurrent] = useState(0);  // 当年売上
  const [revenueTwoYearsAgo, setRevenueTwoYearsAgo] = useState(0);  // 2年前売上（基準期間）

  // データ取得
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      const effectiveOwner = owner === 'all' ? 'tomo' : owner; // allの場合はtomoにフォールバック

      // 取引
      const { data: txData } = await supabase
        .from('transactions')
        .select('*')
        .eq('owner', effectiveOwner)
        .gte('date', `${year}-01-01`)
        .lt('date', `${year + 1}-01-01`)
        .order('date', { ascending: true });

      // 按分設定
      const { data: anbunData } = await supabase
        .from('anbun_settings')
        .select('*')
        .eq('owner', effectiveOwner);

      // 固定資産
      const { data: assetData } = await supabase
        .from('assets')
        .select('*')
        .eq('owner', effectiveOwner)
        .lte('acquisition_date', `${year}-12-31`);

      // 銀行口座
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('owner', effectiveOwner);

      // 資金移動（当年分）
      const { data: ftData } = await supabase
        .from('fund_transfers')
        .select('*')
        .eq('owner', effectiveOwner)
        .gte('transfer_date', `${year}-01-01`)
        .lt('transfer_date', `${year + 1}-01-01`)
        .order('transfer_date', { ascending: true });

      // v0.17.0: 事業者ステータス
      const { data: profileData } = await supabase
        .from('profiles')
        .select('invoice_registered, is_taxable')
        .eq('user_key', effectiveOwner)
        .single();

      // v0.17.0: 当年・2年前の年間総売上（インボイス判定用）
      const { data: revCurrentData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('owner', effectiveOwner)
        .eq('tx_type', 'revenue')
        .gte('date', `${year}-01-01`)
        .lt('date', `${year + 1}-01-01`);

      const { data: rev2yData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('owner', effectiveOwner)
        .eq('tx_type', 'revenue')
        .gte('date', `${year - 2}-01-01`)
        .lt('date', `${year - 1}-01-01`);

      setTransactions(txData || []);
      setAnbunSettings(anbunData || []);
      setAssets(assetData || []);
      setBankAccounts(bankData || []);
      setFundTransfers(ftData || []);
      // v0.17.0
      setInvoiceRegistered(!!(profileData as any)?.invoice_registered);
      setIsTaxable(!!(profileData as any)?.is_taxable);
      setRevenueCurrent((revCurrentData || []).reduce((s: number, r: any) => s + (r.amount || 0), 0));
      setRevenueTwoYearsAgo((rev2yData || []).reduce((s: number, r: any) => s + (r.amount || 0), 0));
    } catch (err) {
      console.error('データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================
  // 集計計算
  // ============================================================
  const effectiveOwner = owner === 'all' ? 'tomo' : owner;
  const ownerLabel = effectiveOwner === 'tomo' ? 'トモ' : 'トシキ';

  // 確定申告はsettled（または旧データのstatus未設定）のみ集計
  const settledTx = transactions.filter(tx => tx.status === 'settled' || !tx.status);

  // 売上合計
  const revenueTotal = settledTx
    .filter(tx => tx.tx_type === 'revenue')
    .reduce((sum, tx) => sum + tx.amount, 0);

  // 科目別経費集計
  const expenseByKamoku: Record<string, number> = {};
  for (const tx of settledTx) {
    if (tx.tx_type !== 'expense') continue;
    expenseByKamoku[tx.kamoku] = (expenseByKamoku[tx.kamoku] || 0) + tx.amount;
  }

  // 按分設定をマップ化
  const anbunMap: Record<string, number> = {};
  for (const a of anbunSettings) {
    anbunMap[a.kamoku] = a.ratio;
  }

  // 科目別サマリー生成
  const kamokuSummaries: KamokuSummary[] = [];
  const kamokuEntries = Object.entries(KAMOKU) as [string, { name: string; type: string; anbun?: boolean }][];

  for (const [id, k] of kamokuEntries) {
    if (k.type !== 'expense') continue;
    if (id === 'depreciation') continue; // 減価償却は別セクション

    const rawAmount = expenseByKamoku[id] || 0;
    if (rawAmount === 0) continue; // 金額ゼロの科目はスキップ

    const isAnbun = 'anbun' in k && k.anbun === true;
    let anbunRatio: number | null = null;
    let amount = rawAmount;

    if (isAnbun) {
      const ratio = anbunMap[id];
      if (ratio !== undefined) {
        anbunRatio = ratio;
        amount = Math.floor(rawAmount * ratio / 100);
      } else {
        // 按分対象だが設定がない → ratio=0扱い（警告表示）
        anbunRatio = 0;
        amount = 0;
      }
    }

    kamokuSummaries.push({ kamokuId: id, name: k.name, rawAmount, anbunRatio, amount });
  }

  // 金額降順ソート
  kamokuSummaries.sort((a, b) => b.amount - a.amount);

  // 減価償却
  const depreciationRows = assets.map(a => calcDepreciation(a, year));
  const depreciationTotal = depreciationRows.reduce((sum, d) => sum + d.currentYearAmount, 0);

  // 経費合計（科目別按分後 + 減価償却）
  const expenseTotal = kamokuSummaries.reduce((sum, k) => sum + k.amount, 0) + depreciationTotal;

  // 所得
  const income = revenueTotal - expenseTotal;

  // 仕訳帳
  const journalEntries = generateJournalEntries(transactions, kamokuSummaries, depreciationRows, year, bankAccounts, fundTransfers);

  // 按分対象で設定がない科目の警告
  const missingAnbun = kamokuSummaries.filter(
    k => k.anbunRatio === 0 && 'anbun' in (KAMOKU[k.kamokuId as keyof typeof KAMOKU] || {})
  );

  // ============================================================
  // レンダリング
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">
            {year}年 確定申告サマリー
          </h1>
          <p className="text-[10px] font-light tracking-wider text-[#999] mt-1 mb-4">
            TAX RETURN — {ownerLabel}
          </p>
          <p className="text-xs text-[#666] leading-relaxed">
            この画面の数字をE-TAXに転記してください。
            <br />
            科目別の金額は📋ボタンでコピーできます。
          </p>
        </div>

        {/* 按分未設定の警告 */}
        {missingAnbun.length > 0 && (
          <div className="mb-6 p-4 bg-[#FFF8E1] border border-[#FFE082] rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[#F9A825] mt-0.5 shrink-0" />
            <div className="text-xs text-[#5D4037] leading-relaxed">
              <span className="font-medium">按分設定がありません：</span>
              {missingAnbun.map(k => k.name).join('、')}
              <br />
              設定ページで按分率を登録してください。現在は0%（経費計上なし）で計算しています。
            </div>
          </div>
        )}

        {/* ── 売上 ── */}
        <section className="mb-6">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            売上
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#333]">売上高</span>
              <div className="flex items-center gap-2">
                <span className="font-['Saira_Condensed'] text-2xl text-[#1a1a1a]">
                  {yen(revenueTotal)}
                </span>
                <CopyButton value={String(revenueTotal)} />
              </div>
            </div>
          </div>
        </section>

        {/* ── 経費（按分後）── */}
        <section className="mb-6">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            経費（按分後）
          </div>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-[#f0f0f0]">
            {kamokuSummaries.map(k => (
              <div key={k.kamokuId} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#333]">{k.name}</span>
                  {k.anbunRatio !== null && (
                    <span className="text-[10px] text-[#999] bg-[#F5F5F3] px-1.5 py-0.5 rounded">
                      按分{k.anbunRatio}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-['Saira_Condensed'] text-lg text-[#1a1a1a]">
                    {yen(k.amount)}
                  </span>
                  <CopyButton value={String(k.amount)} />
                </div>
              </div>
            ))}

            {/* 減価償却費 */}
            {depreciationTotal > 0 && (
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-[#333]">減価償却費</span>
                <div className="flex items-center gap-2">
                  <span className="font-['Saira_Condensed'] text-lg text-[#1a1a1a]">
                    {yen(depreciationTotal)}
                  </span>
                  <CopyButton value={String(depreciationTotal)} />
                </div>
              </div>
            )}

            {kamokuSummaries.length === 0 && depreciationTotal === 0 && (
              <div className="px-5 py-8 text-center text-sm text-[#999]">
                経費データがありません
              </div>
            )}
          </div>
        </section>

        {/* ── 合計 ── */}
        <section className="mb-10">
          <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#333]">経費合計</span>
              <div className="flex items-center gap-2">
                <span className="font-['Saira_Condensed'] text-2xl text-[#C23728]">
                  {yen(expenseTotal)}
                </span>
                <CopyButton value={String(expenseTotal)} />
              </div>
            </div>
            <div className="border-t border-[#f0f0f0] pt-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[#333]">
                所得（売上 − 経費）
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-['Saira_Condensed'] text-2xl ${
                    income >= 0 ? 'text-[#1B4D3E]' : 'text-[#C23728]'
                  }`}
                >
                  {yen(income)}
                </span>
                <CopyButton value={String(income)} />
              </div>
            </div>
          </div>
        </section>

        {/* ── v0.17.0: 青色申告特別控除 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            青色申告特別控除
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-[#1B4D3E]/10 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-[#1B4D3E]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#1a1a1a] mb-2">
                  75万円控除を受ける準備ができています
                </p>
                <p className="text-[11px] text-[#666] leading-relaxed whitespace-pre-line">
                  {`このアプリで行ったすべての訂正と削除は、自動で記録されています。
これは「優良な電子帳簿」と呼ばれる、税務署が認める帳簿の要件のひとつです。

これを満たした上で:
└ 複式簿記での記帳（このアプリでの登録が自動で複式簿記の仕訳になります）
└ 期限内のe-Tax提出（あなたが期限を守れば達成）

この3つを揃えると、令和9年分（2028年提出）の確定申告から、
青色申告特別控除が65万円→75万円に拡大されます。

※ 青色申告特別控除 = 売上から差し引ける金額。多いほど税金が安くなる`}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── v0.17.0: インボイス登録判定（条件付き表示） ── */}
        {(() => {
          // 800万円未満は何も表示しない（ゴミを出さない）
          // 既にインボイス登録済の場合も表示しない
          if (invoiceRegistered) return null;
          const threshold = 8_000_000;
          const taxableLine = 10_000_000;
          // 表示条件: 当年売上が閾値超 OR 2年前売上が課税ライン超
          const showByCurrentYear = revenueCurrent >= threshold;
          const showByBaseLine = revenueTwoYearsAgo > taxableLine;
          if (!showByCurrentYear && !showByBaseLine) return null;

          // レベル判定（強い順）
          let level: 'confirmed' | 'warning' | 'caution' = 'caution';
          if (showByBaseLine) level = 'confirmed'; // 2年前1,000万超 → 確定で課税事業者
          else if (revenueCurrent > taxableLine) level = 'warning'; // 当年1,000万超
          else level = 'caution'; // 800万〜1,000万

          const config = {
            confirmed: {
              color: '#C23728',
              bg: '#FDF0EE',
              title: '当年から、消費税を納める必要があります',
              body: `2年前の売上が1,000万円を超えていたため、当年から消費税の納税義務が発生しました。

これは何を意味するか:
└ 当年の売上の一部を、消費税として国に納める必要があります
└ 確定申告で「消費税の申告」をします（所得税とは別）
└ 取引先と取引する際、インボイス登録番号がないと相手が経費精算で損をします

すぐに、何をすべきか:
1. インボイス登録（まだなら今すぐ・国税庁）
2. 消費税の計算方法を選ぶ（後ほど確認画面で選択できるようにします）
3. 確定申告では消費税申告も必要（所得税と同時提出が一般的）`,
            },
            warning: {
              color: '#C23728',
              bg: '#FDF0EE',
              title: '来々年（2年後）から、消費税を納める必要があります',
              body: `当年の売上が1,000万円を超えました。

これによって何が起きるか:
└ 来々年（2年後）から、消費税の納税義務が発生します
└ 確定申告で「消費税の申告」が必要になります（所得税とは別）
└ 取引先からインボイス登録番号を求められる可能性が高まります

いま、何をすべきか:
1. インボイス登録の手続きを始める（国税庁・無料・1〜2ヶ月かかる）
2. 消費税の計算方法を選ぶ（複数の方式があり、税額が変わります）

※ アプリ側でも、登録後は自動で消費税の計算をサポートします`,
            },
            caution: {
              color: '#D4A03A',
              bg: '#FAF6EE',
              title: '売上1,000万円が見えてきました',
              body: `当年の売上が800万円を超えました。

このまま1,000万円を超えると、何が起きるか:
└ 2年後から、消費税の納税義務が発生します
└ 取引先によっては、インボイス登録番号を求められます

いま、何をしておくと安心か:
└ 売上1,000万円を超えそうな状態を把握しておく
└ インボイス登録は、課税事業者になる前から手続き可能です

※ 消費税の納税義務 = 売上の一部を税金として国に納める義務
※ インボイス = 取引先が経費精算するときに必要な「正式な請求書」`,
            },
          }[level];

          return (
            <section className="mb-10">
              <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
                インボイス登録の判定
              </div>
              <div className="rounded-xl shadow-sm p-5" style={{ backgroundColor: config.bg }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: config.color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-2" style={{ color: config.color }}>
                      {config.title}
                    </p>
                    <p className="text-[11px] text-[#333] leading-relaxed whitespace-pre-line">
                      {config.body}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <div className="text-[#999]">当年売上</div>
                        <div className="font-['Saira_Condensed'] text-base text-[#1a1a1a] tabular-nums">
                          {yen(revenueCurrent)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#999]">2年前売上（基準期間）</div>
                        <div className="font-['Saira_Condensed'] text-base text-[#1a1a1a] tabular-nums">
                          {yen(revenueTwoYearsAgo)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── 仕訳帳 ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-medium tracking-widest text-[#999]">
                仕訳帳
              </div>
              <p className="text-[11px] text-[#999] mt-1">
                複式簿記の帳簿です。CSV出力してE-TAXへの転記確認に使えます。
              </p>
            </div>
            {journalEntries.length > 0 && (
              <button
                onClick={() => downloadCSV(journalEntries, year, ownerLabel)}
                className="flex items-center gap-1.5 text-xs text-[#D4A03A] hover:text-[#b8862e] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                CSV出力
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {journalEntries.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#999]">
                仕訳データがありません
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#f0f0f0]">
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">日付</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">借方科目</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">借方金額</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">貸方科目</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">貸方金額</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalEntries.map((e, i) => (
                      <tr key={i} className="border-b border-[#fafafa] hover:bg-[#fafafa] transition-colors">
                        <td className="px-4 py-2 text-[#666]">{formatDate(e.date)}</td>
                        <td className="px-4 py-2 text-[#D4A03A]">{e.debitAccount}</td>
                        <td className="px-4 py-2 text-right font-['Saira_Condensed'] text-sm text-[#1a1a1a]">{yen(e.debitAmount)}</td>
                        <td className="px-4 py-2 text-[#81D8D0]">{e.creditAccount}</td>
                        <td className="px-4 py-2 text-right font-['Saira_Condensed'] text-sm text-[#1a1a1a]">{yen(e.creditAmount)}</td>
                        <td className="px-4 py-2 text-[#999] max-w-[200px] truncate">{e.description}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#e0e0e0]">
                      <td className="px-4 py-2.5 text-[10px] font-medium text-[#999]">合計</td>
                      <td></td>
                      <td className="px-4 py-2.5 text-right font-['Saira_Condensed'] text-sm font-medium text-[#1a1a1a]">
                        {yen(journalEntries.reduce((s, e) => s + e.debitAmount, 0))}
                      </td>
                      <td></td>
                      <td className="px-4 py-2.5 text-right font-['Saira_Condensed'] text-sm font-medium text-[#1a1a1a]">
                        {yen(journalEntries.reduce((s, e) => s + e.creditAmount, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-[10px] text-[#999]">
                        {journalEntries.reduce((s, e) => s + e.debitAmount, 0) ===
                        journalEntries.reduce((s, e) => s + e.creditAmount, 0) ? (
                          <span className="text-[#1B4D3E]">✓ 貸借一致</span>
                        ) : (
                          <span className="text-[#C23728]">⚠ 貸借不一致</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── 減価償却 ── */}
        {depreciationRows.length > 0 && (
          <section className="mb-10">
            <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
              減価償却
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#f0f0f0]">
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">資産名</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">取得価額</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">耐用年数</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">事業割合</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">当期償却</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">期末簿価</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depreciationRows.map(d => (
                      <tr key={d.id} className="border-b border-[#fafafa]">
                        <td className="px-4 py-2 text-[#333]">{d.name}</td>
                        <td className="px-4 py-2 text-right font-['Saira_Condensed'] text-sm">{yen(d.acquisitionCost)}</td>
                        <td className="px-4 py-2 text-right text-[#666]">{d.usefulLife}年</td>
                        <td className="px-4 py-2 text-right text-[#666]">{d.businessUseRatio}%</td>
                        <td className="px-4 py-2 text-right font-['Saira_Condensed'] text-sm text-[#C23728]">{yen(d.currentYearAmount)}</td>
                        <td className="px-4 py-2 text-right font-['Saira_Condensed'] text-sm text-[#1a1a1a]">{yen(d.bookValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
