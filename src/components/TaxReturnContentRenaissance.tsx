'use client';

/**
 * TaxReturnContentRenaissance.tsx — komu10 確定申告 δ案 v0.22.0
 *
 * 設計思想:
 *   - スマホ(<768px) = 入力主体・確定申告は基本PCで・誘導文表示
 *   - タブレット縦・PC(>=768px) = 没入体験フル表示
 *
 * STEP 8 通過済(四面トリプルチェック+Jobs+COMMANDER)
 *
 * v0.22.0 改修:
 *   - スマホ簡易ビュー新設(損益サマリー+案C誘導文)
 *   - PC/タブレット側: max-width 880→960拡大・余白拡大・所得Saira 64→80px
 *
 * ロジックは既存 TaxReturnContent.tsx から共有関数を import 再利用
 * ブランド統括: Hedi Slimane / AD: Raf Simons / 窓口: David Sims
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import type { Transaction, Asset, AnbunSetting, FundTransfer, BankAccount } from '@/types/database';
import { Copy, Check, Download, Loader2, AlertTriangle } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';
import { useViewport } from '@/lib/useViewport';
import {
  calcDepreciation,
  generateJournalEntries,
  downloadCSV,
  type KamokuSummary,
} from './TaxReturnContent';
import {
  getSurtaxRates,
  INCOME_DEDUCTION_ITEMS,
} from '@/lib/taxConstants';

// v0.33.0: ブランドトークン一元管理(brandTokens.ts)
import { APP_DARK, FONTS } from '@/lib/brandTokens';
const C = APP_DARK;
const F = {
  body: FONTS.ui,
  jp:   FONTS.mincho,
  num:  FONTS.num,
} as const;

const yen = (n: number) => '¥' + Math.floor(n).toLocaleString('ja-JP');
const yenShort = (n: number) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 100000000) return `${sign}¥${(a / 100000000).toFixed(2)}億`;
  if (a >= 10000000) return `${sign}¥${(a / 10000000).toFixed(1)}千万`;
  if (a >= 1000000) return `${sign}¥${(a / 10000).toFixed(0)}万`;
  if (a >= 10000) return `${sign}¥${(a / 10000).toFixed(1)}万`;
  return `${sign}¥${a.toLocaleString()}`;
};
const formatDate = (d: string) => {
  const [, m, dd] = d.split('-');
  return `${m}/${dd}`;
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
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
      style={{
        padding: 4,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title="金額をコピー"
    >
      {copied ? (
        <Check style={{ width: 14, height: 14, color: C.green }} />
      ) : (
        <Copy style={{ width: 14, height: 14, color: C.textMute }} />
      )}
    </button>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`section-${num}`} style={{ marginBottom: 80, scrollMarginTop: 80 }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'baseline', gap: 20 }}>
        <span style={{ fontFamily: F.num, fontSize: 13, color: C.gold, letterSpacing: '0.25em', fontWeight: 500 }}>— {num}</span>
        <span style={{ fontFamily: F.jp, fontSize: 17, color: C.textSub, letterSpacing: '0.06em' }}>{title}</span>
      </div>
      {children}
    </section>
  );
}

export default function TaxReturnContentRenaissance() {
  const { owner, year: yearStr } = usePeriodRange();
  const year = parseInt(yearStr);
  const { isWide, mounted } = useViewport();

  const [loading, setLoading] = useState(true);
  const [appeared, setAppeared] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // v0.32.0: 仕訳帳↔総勘定元帳 双方向リンク用ハイライト state
  const [highlightedAccount, setHighlightedAccount] = useState<string | null>(null);
  const [highlightedEntryNumber, setHighlightedEntryNumber] = useState<string | null>(null);
  const [anbunSettings, setAnbunSettings] = useState<AnbunSetting[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [fundTransfers, setFundTransfers] = useState<FundTransfer[]>([]);
  const [invoiceRegistered, setInvoiceRegistered] = useState(false);
  const [revenueCurrent, setRevenueCurrent] = useState(0);
  const [revenueTwoYearsAgo, setRevenueTwoYearsAgo] = useState(0);

  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setAppeared(true), 40);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setAppeared(false);
    try {
      const effectiveOwner = owner === 'all' ? 'tomo' : owner;

      const { data: txData } = await supabase
        .from('transactions').select('*')
        .eq('owner', effectiveOwner)
        .eq('is_test', false) // v0.52.0: 確定申告は本番のみ
        .gte('date', `${year}-01-01`).lt('date', `${year + 1}-01-01`)
        .order('date', { ascending: true });

      const { data: anbunData } = await supabase
        .from('anbun_settings').select('*').eq('owner', effectiveOwner);

      const { data: assetData } = await supabase
        .from('assets').select('*')
        .eq('owner', effectiveOwner)
        .lte('acquisition_date', `${year}-12-31`);

      const { data: bankData } = await supabase
        .from('bank_accounts').select('*').eq('owner', effectiveOwner);

      const { data: ftData } = await supabase
        .from('fund_transfers').select('*')
        .eq('owner', effectiveOwner)
        .gte('transfer_date', `${year}-01-01`).lt('transfer_date', `${year + 1}-01-01`)
        .order('transfer_date', { ascending: true });

      const { data: profileData } = await supabase
        .from('profiles').select('invoice_registered, is_taxable')
        .eq('user_key', effectiveOwner).single();

      const { data: revCurrentData } = await supabase
        .from('transactions').select('amount')
        .eq('owner', effectiveOwner).eq('tx_type', 'revenue')
        .eq('is_test', false) // v0.52.0: 確定申告は本番のみ
        .gte('date', `${year}-01-01`).lt('date', `${year + 1}-01-01`);

      const { data: rev2yData } = await supabase
        .from('transactions').select('amount')
        .eq('owner', effectiveOwner).eq('tx_type', 'revenue')
        .eq('is_test', false) // v0.52.0: 確定申告は本番のみ
        .gte('date', `${year - 2}-01-01`).lt('date', `${year - 1}-01-01`);

      setTransactions(txData || []);
      setAnbunSettings(anbunData || []);
      setAssets(assetData || []);
      setBankAccounts(bankData || []);
      setFundTransfers(ftData || []);
      setInvoiceRegistered(!!(profileData as any)?.invoice_registered);
      setRevenueCurrent((revCurrentData || []).reduce((s: number, r: any) => s + (r.amount || 0), 0));
      setRevenueTwoYearsAgo((rev2yData || []).reduce((s: number, r: any) => s + (r.amount || 0), 0));
    } catch (err) {
      console.error('データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const effectiveOwner = owner === 'all' ? 'tomo' : owner;
  const ownerLabel = effectiveOwner === 'tomo' ? 'トモ' : 'トシキ';

  const settledTx = useMemo(
    () => transactions.filter(tx => tx.status === 'settled' || !tx.status),
    [transactions]
  );

  const revenueTotal = useMemo(
    () => settledTx.filter(tx => tx.tx_type === 'revenue').reduce((s, tx) => s + tx.amount, 0),
    [settledTx]
  );

  const { kamokuSummaries, missingAnbun } = useMemo(() => {
    const expenseByKamoku: Record<string, number> = {};
    for (const tx of settledTx) {
      if (tx.tx_type !== 'expense') continue;
      expenseByKamoku[tx.kamoku] = (expenseByKamoku[tx.kamoku] || 0) + tx.amount;
    }
    const anbunMap: Record<string, number> = {};
    for (const a of anbunSettings) anbunMap[a.kamoku] = a.ratio;

    const summaries: KamokuSummary[] = [];
    const kamokuEntries = Object.entries(KAMOKU) as [string, { name: string; type: string; anbun?: boolean }][];

    for (const [id, k] of kamokuEntries) {
      if (k.type !== 'expense') continue;
      if (id === 'depreciation') continue;
      const rawAmount = expenseByKamoku[id] || 0;
      if (rawAmount === 0) continue;

      const isAnbun = 'anbun' in k && k.anbun === true;
      let anbunRatio: number | null = null;
      let amount = rawAmount;
      if (isAnbun) {
        const ratio = anbunMap[id];
        if (ratio !== undefined) {
          anbunRatio = ratio;
          amount = Math.floor(rawAmount * ratio / 100);
        } else {
          anbunRatio = 0;
          amount = 0;
        }
      }
      summaries.push({ kamokuId: id, name: k.name, rawAmount, anbunRatio, amount });
    }
    summaries.sort((a, b) => b.amount - a.amount);

    const missing = summaries.filter(
      k => k.anbunRatio === 0 && 'anbun' in (KAMOKU[k.kamokuId as keyof typeof KAMOKU] || {})
    );
    return { kamokuSummaries: summaries, missingAnbun: missing };
  }, [settledTx, anbunSettings]);

  const depreciationRows = useMemo(
    () => assets.map(a => calcDepreciation(a, year)),
    [assets, year]
  );
  const depreciationTotal = depreciationRows.reduce((s, d) => s + d.currentYearAmount, 0);
  const expenseTotal = kamokuSummaries.reduce((s, k) => s + k.amount, 0) + depreciationTotal;
  const income = revenueTotal - expenseTotal;

  const journalEntries = useMemo(
    () => generateJournalEntries(transactions, kamokuSummaries, depreciationRows, year, bankAccounts, fundTransfers),
    [transactions, kamokuSummaries, depreciationRows, year, bankAccounts, fundTransfers]
  );

  // v0.32.0: 総勘定元帳 — 科目別に借方/貸方を集計し残高(借方-貸方)を計算
  // 各科目の取引履歴(時系列)も保持して双方向リンクで使用
  const ledger = useMemo(() => {
    const accounts = new Map<string, { name: string; debit: number; credit: number; entries: { entryNumber: string; date: string; counterAccount: string; amount: number; side: 'debit' | 'credit'; description: string }[] }>();
    const ensure = (name: string) => {
      if (!accounts.has(name)) accounts.set(name, { name, debit: 0, credit: 0, entries: [] });
      return accounts.get(name)!;
    };
    for (const e of journalEntries) {
      const dr = ensure(e.debitAccount);
      dr.debit += e.debitAmount;
      dr.entries.push({ entryNumber: e.entryNumber, date: e.date, counterAccount: e.creditAccount, amount: e.debitAmount, side: 'debit', description: e.description });
      const cr = ensure(e.creditAccount);
      cr.credit += e.creditAmount;
      cr.entries.push({ entryNumber: e.entryNumber, date: e.date, counterAccount: e.debitAccount, amount: e.creditAmount, side: 'credit', description: e.description });
    }
    return Array.from(accounts.values())
      .map(a => ({ ...a, balance: a.debit - a.credit, total: a.debit + a.credit }))
      .sort((a, b) => b.total - a.total);
  }, [journalEntries]);

  if (loading || !mounted) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 20, height: 20, color: C.gold }} className="animate-spin" />
      </div>
    );
  }

  // ========== スマホ簡易ビュー ==========

  if (!isWide) {
    return (
      <div style={{
        background: C.bg,
        minHeight: '100vh',
        color: C.text,
        fontFamily: F.body,
        opacity: appeared ? 1 : 0,
        transition: 'opacity 280ms ease-out',
      }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px 64px' }}>

          <header style={{ paddingBottom: 24, marginBottom: 36, borderBottom: `1px solid ${C.line}` }}>
            <p style={{ fontFamily: F.num, fontSize: 11, letterSpacing: '0.3em', color: C.gold, marginBottom: 14, fontWeight: 500 }}>
              VOLUME 05 · TAX RETURN
            </p>
            <h1 style={{
              fontFamily: F.jp, fontSize: 24, fontWeight: 400, color: C.text,
              lineHeight: 1.45, letterSpacing: '0.03em', marginBottom: 10,
            }}>
              この一年を、締める。
            </h1>
            <p style={{ fontSize: 10, color: C.textMute, letterSpacing: '0.2em', fontWeight: 300 }}>
              確定申告 · {year} · {ownerLabel}
            </p>
          </header>

          {/* 簡易チェック: 売上/経費/所得 */}
          <section style={{ marginBottom: 40 }}>
            <p style={{ fontFamily: F.num, fontSize: 10, letterSpacing: '0.25em', color: C.gold, marginBottom: 16, fontWeight: 500 }}>
              — 簡易チェック
            </p>
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '24px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
                <span style={{ fontSize: 11, color: C.textSub, letterSpacing: '0.05em' }}>売上</span>
                <span style={{ fontFamily: F.num, fontSize: 28, color: C.gold, fontFeatureSettings: "'tnum' 1" }}>{yenShort(revenueTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 11, color: C.textSub, letterSpacing: '0.05em' }}>経費(按分後)</span>
                <span style={{ fontFamily: F.num, fontSize: 28, color: C.crimson, fontFeatureSettings: "'tnum' 1" }}>{yenShort(expenseTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 11, color: C.text, letterSpacing: '0.05em', fontWeight: 500 }}>所得</span>
                <span style={{
                  fontFamily: F.num, fontSize: 36, fontWeight: 500,
                  letterSpacing: '-0.02em', lineHeight: 1,
                  color: income >= 0 ? C.green : C.crimson,
                  fontFeatureSettings: "'tnum' 1",
                }}>
                  {yenShort(income)}
                </span>
              </div>
            </div>
          </section>

          {/* 誘導メッセージ */}
          <section style={{ marginTop: 56, marginBottom: 24 }}>
            <div style={{
              padding: '40px 8px',
              borderTop: `1px solid ${C.line}`,
              borderBottom: `1px solid ${C.line}`,
              textAlign: 'center',
            }}>
              <p style={{ fontFamily: F.jp, fontSize: 18, color: C.text, lineHeight: 2, letterSpacing: '0.08em', marginBottom: 4 }}>
                入力は、ここで。
              </p>
              <p style={{ fontFamily: F.jp, fontSize: 18, color: C.text, lineHeight: 2, letterSpacing: '0.08em', marginBottom: 28 }}>
                確定申告は、PC で。
              </p>
              <p style={{
                fontSize: 11, color: C.textSub, lineHeight: 1.95, letterSpacing: '0.05em',
                maxWidth: 340, margin: '0 auto',
              }}>
                e-Taxへの転記、仕訳帳のCSV出力、減価償却の確認は、
                <br />
                PC・タブレットからご覧ください。
              </p>
            </div>
          </section>

          <footer style={{
            marginTop: 48, paddingTop: 24, borderTop: `1px solid ${C.line}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 9, color: C.textMute, letterSpacing: '0.15em',
          }}>
            <span style={{
              fontFamily: "'Questrial', sans-serif",
              fontSize: 12,
              letterSpacing: '0.04em',
              color: C.text,
            }}>
              komu10
            </span>
            <span style={{ fontFamily: F.num, letterSpacing: '0.25em' }}>
              VOLUME 05 · {year}
            </span>
          </footer>
        </div>
      </div>
    );
  }

  // ========== PC・タブレット 没入ビュー ==========

  const showInvoiceBanner = (() => {
    if (invoiceRegistered) return false;
    const threshold = 8_000_000;
    const taxableLine = 10_000_000;
    return revenueCurrent >= threshold || revenueTwoYearsAgo > taxableLine;
  })();

  // v0.28.0: Section 番号動的算出
  // 01-03 = 固定 / 04 = invoiceBanner時のみ消費税 / 仕訳帳→総勘定元帳→減価償却→所得控除→申告サマリーは順番にインクリメント
  // v0.32.0: ledger(総勘定元帳)を仕訳帳の直後に追加
  const sec = (() => {
    let n = 4;
    const journalNum  = String(n + (showInvoiceBanner ? 1 : 0)).padStart(2, '0');
    n = parseInt(journalNum);
    const ledgerNum   = String(n + 1).padStart(2, '0');
    n = n + 1;
    const depNum      = depreciationRows.length > 0 ? String(n + 1).padStart(2, '0') : ledgerNum;
    const afterDep    = depreciationRows.length > 0 ? n + 1 : n;
    const deductNum   = String(afterDep + 1).padStart(2, '0');
    const summaryNum  = String(afterDep + 2).padStart(2, '0');
    return { journal: journalNum, ledger: ledgerNum, depreciation: depNum, deduction: deductNum, summary: summaryNum };
  })();

  let invoiceLevel: 'confirmed' | 'warning' | 'caution' = 'caution';
  if (revenueTwoYearsAgo > 10_000_000) invoiceLevel = 'confirmed';
  else if (revenueCurrent > 10_000_000) invoiceLevel = 'warning';

  const invoiceConfig = {
    confirmed: {
      color: C.crimson,
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
      color: C.crimson,
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
      color: C.gold,
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
  }[invoiceLevel];

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.text,
      fontFamily: F.body,
      opacity: appeared ? 1 : 0,
      transition: 'opacity 280ms ease-out',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 48px 96px' }}>

        <header style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 40, marginBottom: 64 }}>
          <p style={{ fontFamily: F.num, fontSize: 12, letterSpacing: '0.35em', color: C.gold, marginBottom: 22, fontWeight: 500 }}>
            VOLUME 05 · TAX RETURN
          </p>
          <h1 style={{ fontFamily: F.jp, fontSize: 40, fontWeight: 400, color: C.text, lineHeight: 1.35, letterSpacing: '0.04em', marginBottom: 16 }}>
            この一年を、締める。
          </h1>
          <p style={{ fontSize: 11, color: C.textMute, letterSpacing: '0.2em', fontWeight: 300, marginBottom: 18 }}>
            確定申告 — Tax Return · {year} · {ownerLabel}
          </p>
          <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.75 }}>
            この画面の数字を e-Tax に転記してください。各項目の金額はコピーアイコンから取り出せます。
          </p>
        </header>

        {missingAnbun.length > 0 && (
          <div style={{
            marginBottom: 32,
            padding: '20px 24px',
            background: C.goldSoft,
            border: `1px solid ${C.gold}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
          }}>
            <AlertTriangle style={{ width: 18, height: 18, color: C.gold, marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.75 }}>
              <span style={{ fontWeight: 500 }}>按分設定がありません：</span>
              {missingAnbun.map(k => k.name).join('、')}
              <br />
              設定ページで按分率を登録してください。現在は0%（経費計上なし）で計算しています。
            </div>
          </div>
        )}

        <Section num="01" title="今年の手応え">
          <div style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            padding: '56px 48px',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 36,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: '0.3em', color: C.textMute, marginBottom: 10, textTransform: 'uppercase', fontWeight: 500 }}>売上</p>
                <p style={{ fontSize: 12, color: C.textSub }}>すべての入金</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontFamily: F.num, fontSize: 56, fontWeight: 400,
                  letterSpacing: '-0.025em', lineHeight: 1, color: C.gold,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                }}>
                  {yen(revenueTotal)}
                </span>
                <CopyButton value={String(revenueTotal)} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingTop: 32, borderTop: `1px solid ${C.lineSoft}`, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: '0.3em', color: C.textMute, marginBottom: 10, textTransform: 'uppercase', fontWeight: 500 }}>経費</p>
                <p style={{ fontSize: 12, color: C.textSub }}>按分後 + 減価償却</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontFamily: F.num, fontSize: 56, fontWeight: 400,
                  letterSpacing: '-0.025em', lineHeight: 1, color: C.crimson,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                }}>
                  {yen(expenseTotal)}
                </span>
                <CopyButton value={String(expenseTotal)} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingTop: 32, borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: '0.3em', color: C.textMute, marginBottom: 10, textTransform: 'uppercase', fontWeight: 500 }}>所得</p>
                <p style={{ fontSize: 12, color: C.textSub }}>売上 − 経費</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontFamily: F.num, fontSize: 80, fontWeight: 400,
                  letterSpacing: '-0.04em', lineHeight: 1,
                  color: income >= 0 ? C.green : C.crimson,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                }}>
                  {yen(income)}
                </span>
                <CopyButton value={String(income)} />
              </div>
            </div>
          </div>
        </Section>

        <Section num="02" title="経費の内訳（按分後）">
          {kamokuSummaries.length === 0 && depreciationTotal === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '48px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: C.textMute }}>経費データがありません</p>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              {kamokuSummaries.map(k => (
                <div key={k.kamokuId} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '18px 32px', borderBottom: `1px solid ${C.lineSoft}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontFamily: F.jp, fontSize: 14, color: C.text }}>{k.name}</span>
                    {k.anbunRatio !== null && (
                      <span style={{
                        fontSize: 10, color: C.textSub, background: C.lineSoft,
                        padding: '3px 10px', letterSpacing: '0.05em',
                      }}>
                        按分 {k.anbunRatio}%
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: F.num, fontSize: 18, color: C.text, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(k.amount)}
                    </span>
                    <CopyButton value={String(k.amount)} />
                  </div>
                </div>
              ))}
              {depreciationTotal > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '18px 32px', borderBottom: `1px solid ${C.lineSoft}`,
                }}>
                  <span style={{ fontFamily: F.jp, fontSize: 14, color: C.text }}>減価償却費</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: F.num, fontSize: 18, color: C.text, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(depreciationTotal)}
                    </span>
                    <CopyButton value={String(depreciationTotal)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section num="03" title="青色申告特別控除">
          <div style={{
            background: C.surface, border: `1px solid ${C.line}`, padding: '32px 36px',
            display: 'flex', alignItems: 'flex-start', gap: 20,
          }}>
            <div style={{
              width: 28, height: 28, background: C.greenSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginTop: 2,
            }}>
              <Check style={{ width: 16, height: 16, color: C.green }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 500, color: C.text, marginBottom: 16, letterSpacing: '0.02em' }}>
                75万円控除を受ける準備ができています
              </p>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.95, whiteSpace: 'pre-line' }}>
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
        </Section>

        {showInvoiceBanner && (
          <Section num="04" title="消費税とインボイスの予感">
            <div style={{
              background: invoiceConfig.color === C.crimson ? C.crimsonSoft : C.goldSoft,
              border: `1px solid ${invoiceConfig.color}`,
              padding: '32px 36px',
              display: 'flex', alignItems: 'flex-start', gap: 20,
            }}>
              <AlertTriangle style={{ width: 20, height: 20, color: invoiceConfig.color, marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: invoiceConfig.color, marginBottom: 16, letterSpacing: '0.02em' }}>
                  {invoiceConfig.title}
                </p>
                <p style={{ fontSize: 13, color: C.text, lineHeight: 1.95, whiteSpace: 'pre-line' }}>
                  {invoiceConfig.body}
                </p>
                <div style={{
                  marginTop: 20, paddingTop: 18, borderTop: `1px solid ${C.line}`,
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
                }}>
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8, textTransform: 'uppercase' }}>当年売上</p>
                    <p style={{ fontFamily: F.num, fontSize: 24, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(revenueCurrent)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8, textTransform: 'uppercase' }}>2年前売上 <span style={{ textTransform: 'none', letterSpacing: 0, color: C.textFade }}>(基準期間)</span></p>
                    <p style={{ fontFamily: F.num, fontSize: 24, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(revenueTwoYearsAgo)}</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        )}

        <Section num={sec.journal} title="仕訳帳 — 複式簿記の証跡">
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 12, color: C.textMute, lineHeight: 1.6 }}>
              CSV出力して e-Tax への転記確認に使えます。
            </p>
            {journalEntries.length > 0 && (
              <button
                onClick={() => downloadCSV(journalEntries, year, ownerLabel)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'transparent', border: `1px solid ${C.gold}`,
                  color: C.gold, fontSize: 12, letterSpacing: '0.12em',
                  padding: '10px 18px', cursor: 'pointer',
                  fontFamily: F.body, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.goldSoft; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Download style={{ width: 14, height: 14 }} />
                CSV出力
              </button>
            )}
          </div>

          {journalEntries.length === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '48px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: C.textMute }}>仕訳データがありません</p>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                    {['№', '日付', '借方科目', '借方金額', '貸方科目', '貸方金額', '摘要'].map((h, i) => (
                      <th key={i} style={{
                        textAlign: i === 3 || i === 5 ? 'right' : 'left',
                        padding: '14px 16px', fontSize: 9, letterSpacing: '0.25em',
                        color: C.textMute, fontWeight: 500, textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {journalEntries.map((e, i) => {
                    const isHighlighted = highlightedEntryNumber === e.entryNumber;
                    const debitMatch = highlightedAccount === e.debitAccount;
                    const creditMatch = highlightedAccount === e.creditAccount;
                    const accountFiltered = highlightedAccount && !debitMatch && !creditMatch;
                    return (
                      <tr key={i} style={{
                        borderBottom: `1px solid ${C.lineSoft}`,
                        background: isHighlighted ? C.goldSoft : (debitMatch || creditMatch) ? 'rgba(212,160,58,0.06)' : 'transparent',
                        opacity: accountFiltered ? 0.25 : 1,
                        transition: 'background 200ms ease, opacity 200ms ease',
                      }}>
                        <td style={{ padding: '12px 14px', color: C.textMute, fontFamily: F.num, fontSize: 11, letterSpacing: '0.05em', fontFeatureSettings: "'tnum' 1" }}>{e.entryNumber}</td>
                        <td style={{ padding: '12px 16px', color: C.textSub, fontFamily: F.num, fontFeatureSettings: "'tnum' 1" }}>{formatDate(e.date)}</td>
                        <td style={{ padding: '12px 16px', color: C.gold, cursor: 'pointer', textDecoration: debitMatch ? 'underline' : 'none' }}
                            onClick={() => setHighlightedAccount(highlightedAccount === e.debitAccount ? null : e.debitAccount)}
                            title="クリックで総勘定元帳の該当科目をハイライト">
                          {e.debitAccount}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(e.debitAmount)}</td>
                        <td style={{ padding: '12px 16px', color: C.green, cursor: 'pointer', textDecoration: creditMatch ? 'underline' : 'none' }}
                            onClick={() => setHighlightedAccount(highlightedAccount === e.creditAccount ? null : e.creditAccount)}
                            title="クリックで総勘定元帳の該当科目をハイライト">
                          {e.creditAccount}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(e.creditAmount)}</td>
                        <td style={{ padding: '12px 16px', color: C.textMute, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${C.line}` }}>
                    <td></td>
                    <td style={{ padding: '14px 16px', fontSize: 9, color: C.textSub, letterSpacing: '0.25em', textTransform: 'uppercase' }}>合計</td>
                    <td></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: F.num, fontSize: 14, color: C.text, fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(journalEntries.reduce((s, e) => s + e.debitAmount, 0))}
                    </td>
                    <td></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: F.num, fontSize: 14, color: C.text, fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(journalEntries.reduce((s, e) => s + e.creditAmount, 0))}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 10, letterSpacing: '0.05em' }}>
                      {journalEntries.reduce((s, e) => s + e.debitAmount, 0) ===
                      journalEntries.reduce((s, e) => s + e.creditAmount, 0) ? (
                        <span style={{ color: C.green }}>貸借一致</span>
                      ) : (
                        <span style={{ color: C.crimson }}>貸借不一致</span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Section>

        {/* v0.32.0: 総勘定元帳 — 科目別T字勘定 + 双方向リンク */}
        <Section num={sec.ledger} title="総勘定元帳 — 科目別の流れ">
          {ledger.length === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '48px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: C.textMute }}>元帳データがありません</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 18, fontSize: 11, color: C.textSub, letterSpacing: '0.06em' }}>
                <span>科目をクリックすると、仕訳帳の該当行と元帳の明細が連動表示されます。</span>
                {highlightedAccount && (
                  <button
                    onClick={() => setHighlightedAccount(null)}
                    style={{
                      fontFamily: F.num, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                      color: C.gold, background: 'transparent', border: `1px solid ${C.gold}`,
                      padding: '6px 14px', cursor: 'pointer', transition: 'all 200ms ease',
                    }}
                  >
                    解除 — {highlightedAccount}
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 18 }}>
                {ledger.map(account => {
                  const isHighlighted = highlightedAccount === account.name;
                  const isFiltered = highlightedAccount && !isHighlighted;
                  return (
                    <div
                      key={account.name}
                      onClick={() => setHighlightedAccount(highlightedAccount === account.name ? null : account.name)}
                      style={{
                        background: C.surface,
                        border: `1px solid ${isHighlighted ? C.gold : C.line}`,
                        padding: '20px 22px',
                        cursor: 'pointer',
                        opacity: isFiltered ? 0.3 : 1,
                        transition: 'all 200ms ease',
                      }}
                      title="クリックで仕訳帳の該当行と連動"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                        <div style={{ fontFamily: F.jp, fontSize: 14, color: C.text, letterSpacing: '0.04em' }}>{account.name}</div>
                        <div style={{ fontFamily: F.num, fontSize: 10, color: C.textMute, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{account.entries.length}件</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.line, marginBottom: 12 }}>
                        <div style={{ background: C.surface, padding: '10px 12px' }}>
                          <div style={{ fontSize: 9, color: C.textMute, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 4 }}>借方</div>
                          <div style={{ fontFamily: F.num, fontSize: 14, color: C.gold, fontFeatureSettings: "'tnum' 1" }}>{yen(account.debit)}</div>
                        </div>
                        <div style={{ background: C.surface, padding: '10px 12px' }}>
                          <div style={{ fontSize: 9, color: C.textMute, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 4 }}>貸方</div>
                          <div style={{ fontFamily: F.num, fontSize: 14, color: C.green, fontFeatureSettings: "'tnum' 1" }}>{yen(account.credit)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
                        <span style={{ fontSize: 9, color: C.textMute, letterSpacing: '0.25em', textTransform: 'uppercase' }}>残高(借−貸)</span>
                        <span style={{ fontFamily: F.num, fontSize: 13, color: account.balance >= 0 ? C.text : C.crimson, fontFeatureSettings: "'tnum' 1" }}>{yen(account.balance)}</span>
                      </div>
                      {isHighlighted && (
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                          <div style={{ fontSize: 9, color: C.textMute, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>明細(クリックで仕訳帳に飛ぶ)</div>
                          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                            {account.entries.map((en, j) => (
                              <div
                                key={j}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setHighlightedEntryNumber(en.entryNumber);
                                  setTimeout(() => setHighlightedEntryNumber(null), 2400);
                                  document.querySelector(`#section-${sec.journal}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '52px 60px 1fr auto',
                                  gap: 10,
                                  padding: '8px 0',
                                  borderBottom: `1px solid ${C.lineSoft}`,
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  alignItems: 'baseline',
                                }}
                                title="クリックで仕訳帳の該当行へジャンプ"
                              >
                                <span style={{ fontFamily: F.num, color: C.textMute, fontSize: 10, letterSpacing: '0.05em' }}>{en.entryNumber.split('-')[1]}</span>
                                <span style={{ fontFamily: F.num, color: C.textSub, fontFeatureSettings: "'tnum' 1" }}>{formatDate(en.date)}</span>
                                <span style={{ color: en.side === 'debit' ? C.green : C.gold, fontSize: 10 }}>
                                  {en.side === 'debit' ? '← ' : '→ '}{en.counterAccount}
                                </span>
                                <span style={{ fontFamily: F.num, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(en.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Section>

        {depreciationRows.length > 0 && (
          <Section num={sec.depreciation} title="減価償却 — 資産の費用化">
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                    {['資産名', '取得価額', '耐用年数', '事業割合', '当期償却', '期末簿価'].map((h, i) => (
                      <th key={i} style={{
                        textAlign: i === 0 ? 'left' : 'right',
                        padding: '14px 16px', fontSize: 9, letterSpacing: '0.25em',
                        color: C.textMute, fontWeight: 500, textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depreciationRows.map(d => (
                    <tr key={d.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                      <td style={{ padding: '12px 16px', color: C.text, fontFamily: F.jp }}>{d.name}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.textSub, fontFeatureSettings: "'tnum' 1" }}>{yen(d.acquisitionCost)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: C.textSub, fontFamily: F.num, fontFeatureSettings: "'tnum' 1" }}>{d.usefulLife}年</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: C.textSub, fontFamily: F.num, fontFeatureSettings: "'tnum' 1" }}>{d.businessUseRatio}%</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.crimson, fontFeatureSettings: "'tnum' 1" }}>{yen(d.currentYearAmount)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(d.bookValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section num={sec.deduction} title="所得控除 — 払う前に、引かれるもの">
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 36px' }}>
            <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.85, marginBottom: 28 }}>
              事業所得から差し引ける控除をここに集約します。医療費・社会保険・生命保険・寄附金など、年に一度の入力で翌年の確定申告がそのまま完了します。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {INCOME_DEDUCTION_ITEMS.map(item => (
                <div key={item.key} style={{
                  border: `1px solid ${C.lineSoft}`, padding: '14px 16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontFamily: F.jp, fontSize: 12, color: C.textSub }}>{item.label}</span>
                  <span style={{ fontFamily: F.num, fontSize: 11, color: C.textMute, letterSpacing: '0.15em' }}>準備中</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: C.textMute, lineHeight: 1.8, marginTop: 28, letterSpacing: '0.04em' }}>
              ※ 各項目の入力UIは順次追加します。基礎控除は{year >= 2026 ? '令和8年分の改正後' : '令和7年分以前の'}段階制で計算されます。
            </p>
          </div>
        </Section>

        <Section num={sec.summary} title="申告サマリー — e-Tax への橋渡し">
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 36px' }}>
            <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.85, marginBottom: 24 }}>
              事業所得から所得控除を差し引いた課税所得・所得税概算・付加税をまとめて表示します。e-Tax への転記に必要な数字をすべてここから取り出せます。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
              {(() => {
                const surtax = getSurtaxRates(year);
                const items: { label: string; note: string }[] = [
                  { label: '事業所得（売上 − 経費）', note: '上の各セクションから自動集計' },
                  { label: '所得控除合計',               note: '所得控除セクションから自動集計' },
                  { label: '基礎控除',                   note: `${year >= 2026 ? '令和8年分' : '令和7年分'}の段階制で自動算出` },
                  { label: '課税所得',                   note: '事業所得 − 所得控除合計' },
                  { label: '所得税額（概算）',           note: '課税所得に応じた累進税率で算出' },
                  { label: '復興特別所得税',             note: surtax.reconstruction > 0 ? `所得税額 × ${(surtax.reconstruction * 100).toFixed(1)}%` : '対象外' },
                  { label: '防衛特別所得税',             note: surtax.defense > 0 ? `所得税額 × ${(surtax.defense * 100).toFixed(1)}%` : `${year}年分は対象外` },
                ];
                return items.map((it, i) => (
                  <div key={i} style={{
                    borderBottom: i < items.length - 1 ? `1px solid ${C.lineSoft}` : 'none',
                    padding: '16px 0', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', gap: 16, flexWrap: 'wrap',
                  }}>
                    <div>
                      <p style={{ fontFamily: F.jp, fontSize: 13, color: C.text, marginBottom: 4 }}>{it.label}</p>
                      <p style={{ fontSize: 10, color: C.textMute, letterSpacing: '0.04em' }}>{it.note}</p>
                    </div>
                    <span style={{ fontFamily: F.num, fontSize: 11, color: C.textMute, letterSpacing: '0.2em' }}>準備中</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </Section>

        <footer style={{
          marginTop: 96, paddingTop: 32, borderTop: `1px solid ${C.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, color: C.textMute, letterSpacing: '0.15em',
        }}>
          <span style={{
            fontFamily: "'Questrial', sans-serif",
            fontSize: 14,
            letterSpacing: '0.04em',
            color: C.text,
          }}>
            komu10
          </span>
          <span style={{ fontFamily: F.num, letterSpacing: '0.25em' }}>
            VOLUME 05 · TAX RETURN · {year} · {ownerLabel}
          </span>
        </footer>
      </div>
    </div>
  );
}
