'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import type { Transaction, Asset, AnbunSetting } from '@/types/database';
import { Copy, Check, Download, Loader2, AlertTriangle } from 'lucide-react';

// ============================================================
// 型定義
// ============================================================
interface KamokuSummary {
  kamokuId: string;
  name: string;
  rawAmount: number;       // 按分前の合計
  anbunRatio: number | null; // 按分率（null=按分対象外）
  amount: number;          // 按分後の確定額
}

interface DepreciationRow {
  id: string;
  name: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  businessUseRatio: number;
  currentYearAmount: number; // 当期償却額
  bookValue: number;         // 期末帳簿価額
}

interface JournalEntry {
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
function calcDepreciation(asset: Asset, year: number): DepreciationRow {
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
function generateJournalEntries(
  transactions: Transaction[],
  kamokuSummaries: KamokuSummary[],
  depreciationRows: DepreciationRow[],
  year: number
): JournalEntry[] {
  const entries: JournalEntry[] = [];

  // 取引ごとに仕訳を生成
  for (const tx of transactions) {
    const k = KAMOKU[tx.kamoku as keyof typeof KAMOKU];
    if (!k) continue;

    if (tx.tx_type === 'expense') {
      // 按分対象科目の場合、按分後の金額を使う必要がある
      // → ただし仕訳帳では個別取引の按分は行わない（科目別合計で按分する）
      // → 仕訳帳では按分前の金額で記帳し、按分は決算整理で行うのが正しい
      entries.push({
        date: tx.date,
        debitAccount: k.name,
        debitAmount: tx.amount,
        creditAccount: '事業主借',
        creditAmount: tx.amount,
        description: [tx.store, tx.description].filter(Boolean).join(' '),
      });
    } else {
      // 売上
      entries.push({
        date: tx.date,
        debitAccount: '普通預金',
        debitAmount: tx.amount,
        creditAccount: '売上高',
        creditAmount: tx.amount,
        description: [tx.store, tx.description].filter(Boolean).join(' '),
      });
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
function downloadCSV(entries: JournalEntry[], year: number, ownerLabel: string) {
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
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'tomo'; // 確定申告は個人別。デフォルトtomo
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [anbunSettings, setAnbunSettings] = useState<AnbunSetting[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

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

      setTransactions(txData || []);
      setAnbunSettings(anbunData || []);
      setAssets(assetData || []);
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

  // 売上合計
  const revenueTotal = transactions
    .filter(tx => tx.tx_type === 'revenue')
    .reduce((sum, tx) => sum + tx.amount, 0);

  // 科目別経費集計
  const expenseByKamoku: Record<string, number> = {};
  for (const tx of transactions) {
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
  const journalEntries = generateJournalEntries(transactions, kamokuSummaries, depreciationRows, year);

  // 按分対象で設定がない科目の警告
  const missingAnbun = kamokuSummaries.filter(
    k => k.anbunRatio === 0 && 'anbun' in (KAMOKU[k.kamokuId as keyof typeof KAMOKU] || {})
  );

  // ============================================================
  // レンダリング
  // ============================================================
  if (loading) {
    return (
      <div className="bg-[#F5F5F3] min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
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

        {/* ── 仕訳帳 ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] font-medium tracking-widest text-[#999]">
                仕訳帳
              </div>
              <p className="text-[11px] text-[#999] mt-1">
                複式簿記の帳簿です。CSV出力して税理士に提出できます。
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
