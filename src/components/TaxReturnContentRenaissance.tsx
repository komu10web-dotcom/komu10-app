'use client';

/**
 * TaxReturnContentRenaissance.tsx — komu10 確定申告 δ案 Renaissance版
 *
 * 設計原則:
 *   - 配色: 黒(#0a0a0b) / 白 / 金黄(#D4A03A) / 緑(#1B4D3E) / 赤(#C23728) のみ
 *   - フォント: Saira Condensed(数字主役) / Shippori Mincho(和文) / Inter(本文)
 *   - 装飾: 影・グラデ・絵文字 完全禁止
 *   - JSX直書きスタイル(!important禁止・CSS上書き禁止)
 *
 * STEP 8 通過済(四面トリプルチェック+Jobs+COMMANDER)
 *
 * ロジックは既存 TaxReturnContent.tsx から共有関数を import 再利用:
 *   - calcDepreciation: 減価償却計算
 *   - generateJournalEntries: 仕訳帳生成
 *   - downloadCSV: 仕訳CSV出力
 *
 * ブランド統括: Hedi Slimane / AD: Raf Simons / 窓口: David Sims
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import type { Transaction, Asset, AnbunSetting, FundTransfer, BankAccount } from '@/types/database';
import { Copy, Check, Download, Loader2, AlertTriangle } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';
import {
  calcDepreciation,
  generateJournalEntries,
  downloadCSV,
  type KamokuSummary,
} from './TaxReturnContent';

// ========== デザイントークン ==========

const C = {
  bg: '#0a0a0b',
  surface: '#131316',
  surfaceHi: '#1a1a1f',
  line: 'rgba(255,255,255,0.08)',
  lineSoft: 'rgba(255,255,255,0.04)',
  text: 'rgba(255,255,255,0.92)',
  textSub: 'rgba(255,255,255,0.55)',
  textMute: 'rgba(255,255,255,0.32)',
  textFade: 'rgba(255,255,255,0.20)',
  gold: '#D4A03A',
  goldSoft: 'rgba(212,160,58,0.18)',
  green: '#1B4D3E',
  greenSoft: 'rgba(27,77,62,0.25)',
  crimson: '#C23728',
  crimsonSoft: 'rgba(194,55,40,0.22)',
} as const;

const F = {
  jp: "'Shippori Mincho', serif",
  num: "'Saira Condensed', sans-serif",
  body: "'Inter', sans-serif",
} as const;

// ========== ヘルパー ==========

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

// ========== コピーボタン(暗色版) ==========

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
        transition: 'opacity 0.15s',
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

// ========== セクション枠 ==========

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontFamily: F.num, fontSize: 12, color: C.gold, letterSpacing: '0.2em', fontWeight: 500 }}>— {num}</span>
        <span style={{ fontFamily: F.jp, fontSize: 15, color: C.textSub, letterSpacing: '0.05em' }}>{title}</span>
      </div>
      {children}
    </section>
  );
}

// ========== コンポーネント本体 ==========

export default function TaxReturnContentRenaissance() {
  const { owner, year: yearStr } = usePeriodRange();
  const year = parseInt(yearStr);

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [anbunSettings, setAnbunSettings] = useState<AnbunSetting[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [fundTransfers, setFundTransfers] = useState<FundTransfer[]>([]);
  const [invoiceRegistered, setInvoiceRegistered] = useState(false);
  const [revenueCurrent, setRevenueCurrent] = useState(0);
  const [revenueTwoYearsAgo, setRevenueTwoYearsAgo] = useState(0);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const effectiveOwner = owner === 'all' ? 'tomo' : owner;

      const { data: txData } = await supabase
        .from('transactions').select('*')
        .eq('owner', effectiveOwner)
        .gte('date', `${year}-01-01`)
        .lt('date', `${year + 1}-01-01`)
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
        .gte('transfer_date', `${year}-01-01`)
        .lt('transfer_date', `${year + 1}-01-01`)
        .order('transfer_date', { ascending: true });

      const { data: profileData } = await supabase
        .from('profiles')
        .select('invoice_registered, is_taxable')
        .eq('user_key', effectiveOwner)
        .single();

      const { data: revCurrentData } = await supabase
        .from('transactions').select('amount')
        .eq('owner', effectiveOwner).eq('tx_type', 'revenue')
        .gte('date', `${year}-01-01`).lt('date', `${year + 1}-01-01`);

      const { data: rev2yData } = await supabase
        .from('transactions').select('amount')
        .eq('owner', effectiveOwner).eq('tx_type', 'revenue')
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

  // ========== 集計 ==========

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

  // ========== UI ==========

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 20, height: 20, color: C.gold }} className="animate-spin" />
      </div>
    );
  }

  // インボイス判定の表示条件
  const showInvoiceBanner = (() => {
    if (invoiceRegistered) return false;
    const threshold = 8_000_000;
    const taxableLine = 10_000_000;
    return revenueCurrent >= threshold || revenueTwoYearsAgo > taxableLine;
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
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: F.body }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ===== ヘッダー ===== */}
        <header style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 28, marginBottom: 40 }}>
          <p style={{ fontFamily: F.num, fontSize: 11, letterSpacing: '0.3em', color: C.gold, marginBottom: 14, fontWeight: 500 }}>
            VOLUME 05 · TAX RETURN
          </p>
          <h1 style={{ fontFamily: F.jp, fontSize: 30, fontWeight: 400, color: C.text, lineHeight: 1.4, letterSpacing: '0.02em', marginBottom: 10 }}>
            この一年で、いくら手元に残ったか。
          </h1>
          <p style={{ fontSize: 11, color: C.textMute, letterSpacing: '0.15em', fontWeight: 300, marginBottom: 14 }}>
            確定申告 — Tax Return · {year} · {ownerLabel}
          </p>
          <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.7 }}>
            この画面の数字を e-Tax に転記してください。各項目の金額はコピーアイコンから取り出せます。
          </p>
        </header>

        {/* ===== 按分未設定の警告 ===== */}
        {missingAnbun.length > 0 && (
          <div style={{
            marginBottom: 24,
            padding: '16px 20px',
            background: C.goldSoft,
            border: `1px solid ${C.gold}`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <AlertTriangle style={{ width: 16, height: 16, color: C.gold, marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>
              <span style={{ fontWeight: 500 }}>按分設定がありません：</span>
              {missingAnbun.map(k => k.name).join('、')}
              <br />
              設定ページで按分率を登録してください。現在は0%（経費計上なし）で計算しています。
            </div>
          </div>
        )}

        {/* ===== — 01 損益サマリー(Hero) ===== */}
        <Section num="01" title="今年の手応え">
          <div style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            padding: '40px 32px',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 28,
          }}>
            {/* 売上 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8, textTransform: 'uppercase' }}>売上</p>
                <p style={{ fontSize: 11, color: C.textSub }}>すべての入金</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: F.num,
                  fontSize: 48,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  color: C.gold,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                }}>
                  {yen(revenueTotal)}
                </span>
                <CopyButton value={String(revenueTotal)} />
              </div>
            </div>

            {/* 経費 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingTop: 24, borderTop: `1px solid ${C.lineSoft}`, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8, textTransform: 'uppercase' }}>経費</p>
                <p style={{ fontSize: 11, color: C.textSub }}>按分後 + 減価償却</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: F.num,
                  fontSize: 48,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  color: C.crimson,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                }}>
                  {yen(expenseTotal)}
                </span>
                <CopyButton value={String(expenseTotal)} />
              </div>
            </div>

            {/* 所得 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingTop: 24, borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8, textTransform: 'uppercase' }}>所得</p>
                <p style={{ fontSize: 11, color: C.textSub }}>売上 − 経費</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: F.num,
                  fontSize: 64,
                  fontWeight: 400,
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
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

        {/* ===== — 02 経費の内訳 ===== */}
        <Section num="02" title="経費の内訳（按分後）">
          {kamokuSummaries.length === 0 && depreciationTotal === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: C.textMute }}>経費データがありません</p>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              {kamokuSummaries.map(k => (
                <div key={k.kamokuId} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 24px',
                  borderBottom: `1px solid ${C.lineSoft}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: F.jp, fontSize: 13, color: C.text }}>{k.name}</span>
                    {k.anbunRatio !== null && (
                      <span style={{
                        fontSize: 10,
                        color: C.textSub,
                        background: C.lineSoft,
                        padding: '2px 8px',
                        letterSpacing: '0.05em',
                      }}>
                        按分 {k.anbunRatio}%
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: F.num, fontSize: 16, color: C.text, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(k.amount)}
                    </span>
                    <CopyButton value={String(k.amount)} />
                  </div>
                </div>
              ))}

              {depreciationTotal > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 24px',
                  borderBottom: `1px solid ${C.lineSoft}`,
                }}>
                  <span style={{ fontFamily: F.jp, fontSize: 13, color: C.text }}>減価償却費</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: F.num, fontSize: 16, color: C.text, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(depreciationTotal)}
                    </span>
                    <CopyButton value={String(depreciationTotal)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ===== — 03 青色申告特別控除(75万円) ===== */}
        <Section num="03" title="青色申告特別控除">
          <div style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            padding: '24px 28px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
          }}>
            <div style={{
              width: 24, height: 24,
              background: C.greenSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              marginTop: 2,
            }}>
              <Check style={{ width: 14, height: 14, color: C.green }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 14, letterSpacing: '0.02em' }}>
                75万円控除を受ける準備ができています
              </p>
              <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.85, whiteSpace: 'pre-line' }}>
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

        {/* ===== — 04 インボイス登録判定(条件付き) ===== */}
        {showInvoiceBanner && (
          <Section num="04" title="消費税とインボイスの予感">
            <div style={{
              background: invoiceConfig.color === C.crimson ? C.crimsonSoft : C.goldSoft,
              border: `1px solid ${invoiceConfig.color}`,
              padding: '24px 28px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
            }}>
              <AlertTriangle style={{ width: 18, height: 18, color: invoiceConfig.color, marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: invoiceConfig.color, marginBottom: 14, letterSpacing: '0.02em' }}>
                  {invoiceConfig.title}
                </p>
                <p style={{ fontSize: 12, color: C.text, lineHeight: 1.85, whiteSpace: 'pre-line' }}>
                  {invoiceConfig.body}
                </p>
                <div style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.line}`,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                }}>
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.textMute, marginBottom: 6, textTransform: 'uppercase' }}>当年売上</p>
                    <p style={{ fontFamily: F.num, fontSize: 20, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(revenueCurrent)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.textMute, marginBottom: 6, textTransform: 'uppercase' }}>2年前売上 <span style={{ textTransform: 'none', letterSpacing: 0, color: C.textFade }}>(基準期間)</span></p>
                    <p style={{ fontFamily: F.num, fontSize: 20, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(revenueTwoYearsAgo)}</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ===== — 仕訳帳 ===== */}
        <Section num={showInvoiceBanner ? '05' : '04'} title="仕訳帳 — 複式簿記の証跡">
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 11, color: C.textMute, lineHeight: 1.6 }}>
              CSV出力して e-Tax への転記確認に使えます。
            </p>
            {journalEntries.length > 0 && (
              <button
                onClick={() => downloadCSV(journalEntries, year, ownerLabel)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'transparent',
                  border: `1px solid ${C.gold}`,
                  color: C.gold,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontFamily: F.body,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.goldSoft; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Download style={{ width: 13, height: 13 }} />
                CSV出力
              </button>
            )}
          </div>

          {journalEntries.length === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: C.textMute }}>仕訳データがありません</p>
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                    {['日付', '借方科目', '借方金額', '貸方科目', '貸方金額', '摘要'].map((h, i) => (
                      <th key={i} style={{
                        textAlign: i === 2 || i === 4 ? 'right' : 'left',
                        padding: '12px 14px',
                        fontSize: 9,
                        letterSpacing: '0.2em',
                        color: C.textMute,
                        fontWeight: 500,
                        textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {journalEntries.map((e, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                      <td style={{ padding: '10px 14px', color: C.textSub, fontFamily: F.num, fontFeatureSettings: "'tnum' 1" }}>{formatDate(e.date)}</td>
                      <td style={{ padding: '10px 14px', color: C.gold }}>{e.debitAccount}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(e.debitAmount)}</td>
                      <td style={{ padding: '10px 14px', color: C.green }}>{e.creditAccount}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(e.creditAmount)}</td>
                      <td style={{ padding: '10px 14px', color: C.textMute, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: '12px 14px', fontSize: 9, color: C.textSub, letterSpacing: '0.2em', textTransform: 'uppercase' }}>合計</td>
                    <td></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: F.num, fontSize: 14, color: C.text, fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(journalEntries.reduce((s, e) => s + e.debitAmount, 0))}
                    </td>
                    <td></td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: F.num, fontSize: 14, color: C.text, fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>
                      {yen(journalEntries.reduce((s, e) => s + e.creditAmount, 0))}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 10, letterSpacing: '0.05em' }}>
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

        {/* ===== — 減価償却(条件付き) ===== */}
        {depreciationRows.length > 0 && (
          <Section num={showInvoiceBanner ? '06' : '05'} title="減価償却 — 資産の費用化">
            <div style={{ background: C.surface, border: `1px solid ${C.line}`, overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                    {['資産名', '取得価額', '耐用年数', '事業割合', '当期償却', '期末簿価'].map((h, i) => (
                      <th key={i} style={{
                        textAlign: i === 0 ? 'left' : 'right',
                        padding: '12px 14px',
                        fontSize: 9,
                        letterSpacing: '0.2em',
                        color: C.textMute,
                        fontWeight: 500,
                        textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {depreciationRows.map(d => (
                    <tr key={d.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                      <td style={{ padding: '10px 14px', color: C.text, fontFamily: F.jp }}>{d.name}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.textSub, fontFeatureSettings: "'tnum' 1" }}>{yen(d.acquisitionCost)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textSub, fontFamily: F.num, fontFeatureSettings: "'tnum' 1" }}>{d.usefulLife}年</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textSub, fontFamily: F.num, fontFeatureSettings: "'tnum' 1" }}>{d.businessUseRatio}%</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.crimson, fontFeatureSettings: "'tnum' 1" }}>{yen(d.currentYearAmount)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: F.num, fontSize: 13, color: C.text, fontFeatureSettings: "'tnum' 1" }}>{yen(d.bookValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ===== フッター ===== */}
        <footer style={{
          marginTop: 80,
          paddingTop: 24,
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 10,
          color: C.textMute,
          letterSpacing: '0.1em',
        }}>
          <span style={{ fontFamily: F.num, fontWeight: 500, fontSize: 13 }}>
            komu<span style={{ color: C.gold }}>10</span>
          </span>
          <span style={{ fontFamily: F.num, letterSpacing: '0.2em' }}>
            VOLUME 05 · TAX RETURN · {year} · {ownerLabel}
          </span>
        </footer>
      </div>
    </div>
  );
}
