'use client';

/**
 * ManagementContentRenaissance.tsx — komu10 経営ダッシュボード δ案 完成版
 *
 * 設計原則:
 *   - 配色: 黒(#0a0a0b) / 白 / 金黄(#D4A03A) / 緑(#1B4D3E) / 赤(#C23728) のみ
 *   - フォント: Saira Condensed(数字主役) / Shippori Mincho(和文) / Inter(本文)
 *   - 装飾: 影・グラデ・絵文字 完全禁止
 *   - JSX直書きスタイル(!important禁止・CSS上書き禁止)
 *
 * STEP 8 通過済:
 *   第1段 — 四面トリプルチェック(UI/UX・ヴィジュアル・インフォグラフィック・タイポ)
 *   第2段 — Steve Jobs 5問
 *   第3段 — Stewart Butterfield COMMANDER 5問
 *
 * ブランド統括: Hedi Slimane / AD: Raf Simons / 窓口: David Sims
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { DIVISIONS, KAMOKU } from '@/types/database';
import type { Transaction, Project, TransactionAllocation, BankAccount } from '@/types/database';
import { Loader2 } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';

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

function yen(n: number): string {
  if (n === 0) return '¥0';
  const prefix = n < 0 ? '-¥' : '¥';
  return prefix + Math.abs(n).toLocaleString();
}

function yenShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 100000000) return `${sign}¥${(a / 100000000).toFixed(2)}億`;
  if (a >= 10000000) return `${sign}¥${(a / 10000000).toFixed(1)}千万`;
  if (a >= 1000000) return `${sign}¥${(a / 10000).toFixed(0)}万`;
  if (a >= 10000) return `${sign}¥${(a / 10000).toFixed(1)}万`;
  return `${sign}¥${a.toLocaleString()}`;
}

function calcAxisTicks(maxVal: number, steps: number = 4): number[] {
  if (maxVal <= 0) return [0];
  const raw = maxVal / steps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 2, 2.5, 5, 10].find(n => n * magnitude >= raw) || 10;
  const step = nice * magnitude;
  const ticks: number[] = [];
  for (let i = 0; i <= steps; i++) ticks.push(Math.round(step * i));
  return ticks;
}

const kamokuName = (k: string) => KAMOKU[k as keyof typeof KAMOKU]?.name || k;

// ========== コンポーネント ==========

export default function ManagementContentRenaissance() {
  const { mode, owner, startDate, endDate, year } = usePeriodRange();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<TransactionAllocation[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [chartYearTx, setChartYearTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pl' | 'cf'>('pl');

  // ========== データ取得 ==========

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let txQ = supabase.from('transactions').select('*')
        .gte('date', startDate).lt('date', endDate);
      if (owner !== 'all') txQ = txQ.eq('owner', owner);
      const { data: txData } = await txQ;
      const txList = (txData as Transaction[]) || [];
      setTransactions(txList);

      const { data: pjData } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      setProjects((pjData as Project[]) || []);

      if (txList.length > 0) {
        const txIds = txList.map(t => t.id);
        const { data: allocData } = await supabase.from('transaction_allocations').select('*').in('transaction_id', txIds);
        setAllocations((allocData as TransactionAllocation[]) || []);
      } else {
        setAllocations([]);
      }

      let bankQ = supabase.from('bank_accounts').select('*').order('created_at');
      if (owner !== 'all') bankQ = bankQ.eq('owner', owner);
      const { data: bankData } = await bankQ;
      setBankAccounts((bankData as BankAccount[]) || []);

      // チャート用: 当年全件
      if (startDate !== `${year}-01-01` || endDate !== `${parseInt(year) + 1}-01-01`) {
        let cyQ = supabase.from('transactions').select('date, amount, tx_type, status, actual_payment_date')
          .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
        if (owner !== 'all') cyQ = cyQ.eq('owner', owner);
        const { data: cyData } = await cyQ;
        setChartYearTx((cyData as Transaction[]) || []);
      } else {
        setChartYearTx(txList);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, startDate, endDate, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ========== 集計(useMemoで重い計算をキャッシュ) ==========

  const allocByTx = useMemo(() => {
    const m: Record<string, TransactionAllocation[]> = {};
    allocations.forEach(a => {
      if (!m[a.transaction_id]) m[a.transaction_id] = [];
      m[a.transaction_id].push(a);
    });
    return m;
  }, [allocations]);

  // PL KPI
  const revenueTotal = transactions.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + (t.amount || 0), 0);
  const expenseTotal = transactions.filter(t => t.tx_type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const profitTotal = revenueTotal - expenseTotal;
  const profitRate = revenueTotal > 0 ? (profitTotal / revenueTotal) * 100 : 0;

  // 月次PL
  const monthlyPL = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mTx = chartYearTx.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() + 1 === m;
    });
    const rev = mTx.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + (t.amount || 0), 0);
    const exp = mTx.filter(t => t.tx_type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    return { month: m, rev, exp, profit: rev - exp };
  }), [chartYearTx]);

  // 月次CF (actual_payment_dateベース)
  const monthlyCF = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mStr = String(m).padStart(2, '0');
    const prefix = `${year}-${mStr}`;
    const mTx = (chartYearTx.length > 0 ? chartYearTx : transactions).filter(t => {
      const payDate = t.actual_payment_date || t.date;
      return payDate.startsWith(prefix);
    });
    const inflow = mTx.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + (t.amount || 0), 0);
    const outflow = mTx.filter(t => t.tx_type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    return { month: m, inflow, outflow, net: inflow - outflow };
  }), [chartYearTx, transactions, year]);

  // CF KPI
  const cfTotalInflow = monthlyCF.reduce((s, m) => s + m.inflow, 0);
  const cfTotalOutflow = monthlyCF.reduce((s, m) => s + m.outflow, 0);
  const cfNet = cfTotalInflow - cfTotalOutflow;

  // ランウェイ
  const totalBankBalance = bankAccounts.reduce((s, ba) => s + ba.balance, 0);
  const currentMonth = new Date().getMonth() + 1;
  const monthsWithOutflow = monthlyCF.filter(m => m.month <= currentMonth && m.outflow > 0);
  const avgMonthlyOutflow = monthsWithOutflow.length > 0
    ? monthsWithOutflow.reduce((s, m) => s + m.outflow, 0) / monthsWithOutflow.length
    : 0;
  const runwayMonths = avgMonthlyOutflow > 0 ? totalBankBalance / avgMonthlyOutflow : null;
  const runwayLevel: 'danger' | 'healthy' | 'safe' = runwayMonths === null ? 'safe'
    : runwayMonths < 3 ? 'danger' : runwayMonths < 6 ? 'healthy' : 'safe';
  const runwayColor = { danger: C.crimson, healthy: C.gold, safe: C.green }[runwayLevel];
  const runwayLabel = { danger: '危険', healthy: '健全', safe: '余裕' }[runwayLevel];

  // 部門別損益(按分ベース)
  const activeDivisions = useMemo(
    () => Object.entries(DIVISIONS).filter(([id]) => id !== 'general'),
    []
  );

  const divisionPL = useMemo(() => {
    const divExp: Record<string, number> = {};
    const divRev: Record<string, number> = {};
    let unalloc = 0;
    transactions.forEach(t => {
      const allocs = allocByTx[t.id];
      if (t.tx_type === 'revenue') {
        const div = t.division || 'general';
        divRev[div] = (divRev[div] || 0) + (t.amount || 0);
      } else if (t.tx_type === 'expense') {
        if (allocs && allocs.length > 0) {
          allocs.forEach(a => {
            divExp[a.division_id] = (divExp[a.division_id] || 0) + (a.amount || 0);
          });
        } else {
          unalloc += (t.amount || 0);
        }
      }
    });
    return activeDivisions.map(([id, v]) => {
      const rev = divRev[id] || 0;
      const exp = divExp[id] || 0;
      return { id, name: v.name, label: v.label, color: v.color, revenue: rev, expense: exp, profit: rev - exp };
    });
  }, [transactions, allocByTx, activeDivisions]);

  // 勘定科目別経費
  const kamokuExpense = useMemo(() => {
    const m: Record<string, number> = {};
    transactions.filter(t => t.tx_type === 'expense').forEach(t => {
      const k = t.kamoku || 'other';
      m[k] = (m[k] || 0) + (t.amount || 0);
    });
    return Object.entries(m)
      .map(([k, amount]) => ({ kamoku: k, name: kamokuName(k), amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [transactions]);

  // PJ別損益
  const projectPL = useMemo(() => {
    const m: Record<string, { revenue: number; expense: number }> = {};
    transactions.forEach(t => {
      const allocs = allocByTx[t.id];
      if (t.tx_type === 'revenue' && t.project_id) {
        if (!m[t.project_id]) m[t.project_id] = { revenue: 0, expense: 0 };
        m[t.project_id].revenue += (t.amount || 0);
      } else if (t.tx_type === 'expense' && allocs) {
        allocs.forEach(a => {
          if (a.project_id) {
            if (!m[a.project_id]) m[a.project_id] = { revenue: 0, expense: 0 };
            m[a.project_id].expense += (a.amount || 0);
          }
        });
      }
    });
    return projects
      .map(pj => {
        const pl = m[pj.id] || { revenue: 0, expense: 0 };
        const profit = pl.revenue - pl.expense;
        const rate = pl.revenue > 0 ? (profit / pl.revenue) * 100 : 0;
        return {
          id: pj.id, name: pj.name, division: pj.division,
          revenue: pl.revenue, expense: pl.expense, profit, rate,
        };
      })
      .filter(p => p.revenue > 0 || p.expense > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);
  }, [transactions, projects, allocByTx]);

  // ========== UI ==========

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 20, height: 20, color: C.gold }} className="animate-spin" />
      </div>
    );
  }

  const poeticTitle = viewMode === 'pl' ? 'いま、儲かっているのか。' : 'いま、お金は足りているのか。';
  const sectionLabel = viewMode === 'pl' ? '損益 — Profit & Loss' : 'キャッシュフロー — Cash Flow';

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: F.body }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ===== ヘッダー ===== */}
        <header style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 28, marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontFamily: F.num, fontSize: 11, letterSpacing: '0.3em', color: C.gold, marginBottom: 14, fontWeight: 500 }}>
                VOLUME 04 · MANAGEMENT
              </p>
              <h1 style={{ fontFamily: F.jp, fontSize: 30, fontWeight: 400, color: C.text, lineHeight: 1.4, letterSpacing: '0.02em', marginBottom: 10 }}>
                {poeticTitle}
              </h1>
              <p style={{ fontSize: 11, color: C.textMute, letterSpacing: '0.15em', fontWeight: 300 }}>
                {sectionLabel} · {year}
              </p>
            </div>

            <nav style={{ display: 'flex', border: `1px solid ${C.line}` }}>
              {([{ v: 'pl', label: 'PL' }, { v: 'cf', label: 'CF' }] as const).map((tab, i) => (
                <button
                  key={tab.v}
                  onClick={() => setViewMode(tab.v)}
                  style={{
                    padding: '10px 22px',
                    fontSize: 11,
                    fontFamily: F.body,
                    fontWeight: 500,
                    letterSpacing: '0.15em',
                    background: viewMode === tab.v ? C.gold : 'transparent',
                    color: viewMode === tab.v ? C.bg : C.textSub,
                    border: 'none',
                    borderLeft: i > 0 ? `1px solid ${C.line}` : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {viewMode === 'pl' ? (
          <PLView
            year={year}
            revenueTotal={revenueTotal}
            expenseTotal={expenseTotal}
            profitTotal={profitTotal}
            profitRate={profitRate}
            monthlyPL={monthlyPL}
            divisionPL={divisionPL}
            kamokuExpense={kamokuExpense}
            projectPL={projectPL}
          />
        ) : (
          <CFView
            year={year}
            cfTotalInflow={cfTotalInflow}
            cfTotalOutflow={cfTotalOutflow}
            cfNet={cfNet}
            totalBankBalance={totalBankBalance}
            bankAccounts={bankAccounts}
            runwayMonths={runwayMonths}
            runwayColor={runwayColor}
            runwayLabel={runwayLabel}
            avgMonthlyOutflow={avgMonthlyOutflow}
            monthlyCF={monthlyCF}
          />
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
            VOLUME 04 · MANAGEMENT · {year}
          </span>
        </footer>
      </div>
    </div>
  );
}

// ========== PL View ==========

function PLView({ year, revenueTotal, expenseTotal, profitTotal, profitRate, monthlyPL, divisionPL, kamokuExpense, projectPL }: {
  year: string;
  revenueTotal: number;
  expenseTotal: number;
  profitTotal: number;
  profitRate: number;
  monthlyPL: { month: number; rev: number; exp: number; profit: number }[];
  divisionPL: { id: string; name: string; label: string; color: string; revenue: number; expense: number; profit: number }[];
  kamokuExpense: { kamoku: string; name: string; amount: number }[];
  projectPL: { id: string; name: string; division: string; revenue: number; expense: number; profit: number; rate: number }[];
}) {
  return (
    <>
      {/* ===== — 01 利益の手応え(KPI) ===== */}
      <Section num="01" title={`${year}年の手応え`}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 0,
          border: `1px solid ${C.line}`,
        }}>
          {[
            { label: '売上', value: revenueTotal, color: C.gold, isRate: false },
            { label: '経費', value: expenseTotal, color: C.crimson, isRate: false },
            { label: '利益', value: profitTotal, color: profitTotal >= 0 ? C.green : C.crimson, isRate: false },
            { label: '利益率', value: profitRate, color: profitRate >= 0 ? C.green : C.crimson, isRate: true },
          ].map((kpi, i) => (
            <div
              key={kpi.label}
              style={{
                padding: '32px 24px',
                borderLeft: i > 0 ? `1px solid ${C.line}` : 'none',
                background: C.surface,
              }}
            >
              <p style={{
                fontSize: 10,
                letterSpacing: '0.25em',
                color: C.textMute,
                marginBottom: 16,
                textTransform: 'uppercase',
                fontWeight: 500,
              }}>
                {kpi.label}
              </p>
              <p style={{
                fontFamily: F.num,
                fontSize: 42,
                fontWeight: 400,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                color: kpi.color,
                fontFeatureSettings: "'tnum' 1, 'lnum' 1",
              }}>
                {kpi.isRate ? `${kpi.value.toFixed(1)}%` : yenShort(kpi.value)}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== — 02 月次推移 ===== */}
      <Section num="02" title={`${year}年の月別、お金の流れ`}>
        <PLChart data={monthlyPL} />
      </Section>

      {/* ===== — 03 事業別損益(サンキー的フロー) ===== */}
      <Section num="03" title="事業ごとに、利益はどこで立ったか">
        <DivisionFlow divisions={divisionPL} />
      </Section>

      {/* ===== — 04 勘定科目別経費 ===== */}
      <Section num="04" title="経費は、どこに使われたか">
        <KamokuBars items={kamokuExpense} total={expenseTotal} />
      </Section>

      {/* ===== — 05 PJ別利益率 ===== */}
      <Section num="05" title="プロジェクト別、利益が立つ場所">
        <ProjectTable items={projectPL} />
      </Section>
    </>
  );
}

// ========== CF View ==========

function CFView({ year, cfTotalInflow, cfTotalOutflow, cfNet, totalBankBalance, bankAccounts, runwayMonths, runwayColor, runwayLabel, avgMonthlyOutflow, monthlyCF }: {
  year: string;
  cfTotalInflow: number;
  cfTotalOutflow: number;
  cfNet: number;
  totalBankBalance: number;
  bankAccounts: BankAccount[];
  runwayMonths: number | null;
  runwayColor: string;
  runwayLabel: string;
  avgMonthlyOutflow: number;
  monthlyCF: { month: number; inflow: number; outflow: number; net: number }[];
}) {
  return (
    <>
      {/* ===== — 01 ランウェイ Hero ===== */}
      <Section num="01" title="このペースで、あと何ヶ月もつのか">
        <div style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          padding: '48px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 32,
        }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 16, textTransform: 'uppercase' }}>
              RUNWAY · あと
            </p>
            {runwayMonths !== null ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                <span style={{
                  fontFamily: F.num,
                  fontSize: 96,
                  fontWeight: 400,
                  lineHeight: 0.9,
                  letterSpacing: '-0.04em',
                  color: runwayColor,
                  fontFeatureSettings: "'tnum' 1",
                }}>
                  {runwayMonths.toFixed(1)}
                </span>
                <span style={{ fontFamily: F.jp, fontSize: 24, color: C.textSub }}>ヶ月</span>
              </div>
            ) : (
              <p style={{ fontFamily: F.jp, fontSize: 18, color: C.textMute, marginBottom: 14 }}>
                データ不足
              </p>
            )}
            {runwayMonths !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, letterSpacing: '0.1em' }}>
                <span style={{
                  padding: '4px 10px',
                  background: runwayColor === C.crimson ? C.crimsonSoft : runwayColor === C.gold ? C.goldSoft : C.greenSoft,
                  color: runwayColor,
                  fontWeight: 500,
                }}>
                  {runwayLabel}
                </span>
                <span style={{ color: C.textSub }}>
                  月平均出金 {yenShort(Math.round(avgMonthlyOutflow))}
                </span>
              </div>
            )}
          </div>

          <div style={{ minWidth: 240, paddingLeft: 24, borderLeft: `1px solid ${C.line}` }}>
            <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 14, textTransform: 'uppercase' }}>
              口座残高
            </p>
            {bankAccounts.length === 0 ? (
              <p style={{ fontSize: 12, color: C.textMute }}>口座未登録</p>
            ) : (
              <>
                {bankAccounts.map(ba => (
                  <div key={ba.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, fontSize: 12 }}>
                    <span style={{ color: C.textSub }}>{ba.name}</span>
                    <span style={{ fontFamily: F.num, color: C.text, letterSpacing: '-0.01em' }}>{yenShort(ba.balance)}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, color: C.textSub, letterSpacing: '0.05em' }}>合計</span>
                  <span style={{ fontFamily: F.num, fontSize: 20, color: C.gold, fontWeight: 500 }}>{yenShort(totalBankBalance)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* ===== — 02 入出金KPI ===== */}
      <Section num="02" title={`${year}年の入金と出金`}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 0,
          border: `1px solid ${C.line}`,
        }}>
          {[
            { label: '入金', value: cfTotalInflow, color: C.gold },
            { label: '出金', value: cfTotalOutflow, color: C.crimson },
            { label: '差引', value: cfNet, color: cfNet >= 0 ? C.green : C.crimson },
          ].map((kpi, i) => (
            <div key={kpi.label} style={{ padding: '32px 24px', borderLeft: i > 0 ? `1px solid ${C.line}` : 'none', background: C.surface }}>
              <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.textMute, marginBottom: 16, textTransform: 'uppercase' }}>{kpi.label}</p>
              <p style={{
                fontFamily: F.num,
                fontSize: 42,
                fontWeight: 400,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                color: kpi.color,
                fontFeatureSettings: "'tnum' 1",
              }}>
                {yenShort(kpi.value)}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== — 03 月次CF ===== */}
      <Section num="03" title={`${year}年の月別、入出金`}>
        <CFChart data={monthlyCF} />
      </Section>
    </>
  );
}

// ========== セクション枠 ==========

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{
          fontFamily: F.num,
          fontSize: 12,
          color: C.gold,
          letterSpacing: '0.2em',
          fontWeight: 500,
        }}>— {num}</span>
        <span style={{
          fontFamily: F.jp,
          fontSize: 15,
          color: C.textSub,
          letterSpacing: '0.05em',
        }}>
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

// ========== PL Chart(月次推移) ==========

function PLChart({ data }: { data: { month: number; rev: number; exp: number; profit: number }[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.rev, d.exp]), 1);
  const ticks = calcAxisTicks(maxVal);
  const chartMax = ticks[ticks.length - 1] || 1;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '28px 24px' }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 10, letterSpacing: '0.15em', color: C.textSub }}>
        <Legend color={C.gold} label="売上" />
        <Legend color={C.crimson} label="経費" />
        <Legend color={C.green} label="利益" line />
      </div>

      <div style={{ display: 'flex', height: 240 }}>
        <YAxis ticks={ticks} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {ticks.map((t, i) => (
              <div key={i} style={{
                position: 'absolute', left: 0, right: 0,
                bottom: `${(t / chartMax) * 100}%`,
                borderTop: `1px solid ${C.lineSoft}`,
              }} />
            ))}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end' }}>
              {data.map(d => (
                <div key={d.month} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 2, height: '100%' }}>
                  <div style={{ width: 8, height: `${(d.rev / chartMax) * 100}%`, background: C.gold, opacity: d.rev > 0 ? 1 : 0 }} title={`${d.month}月 売上 ${yen(d.rev)}`} />
                  <div style={{ width: 8, height: `${(d.exp / chartMax) * 100}%`, background: C.crimson, opacity: d.exp > 0 ? 1 : 0 }} title={`${d.month}月 経費 ${yen(d.exp)}`} />
                </div>
              ))}
            </div>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 100 100">
              <polyline
                fill="none"
                stroke={C.green}
                strokeWidth="0.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                points={data.map((d, i) => {
                  const x = ((i + 0.5) / 12) * 100;
                  const y = 100 - Math.max(0, (d.profit / chartMax) * 100);
                  return `${x},${y}`;
                }).join(' ')}
              />
            </svg>
          </div>
          <XAxis />
        </div>
      </div>
    </div>
  );
}

// ========== CF Chart ==========

function CFChart({ data }: { data: { month: number; inflow: number; outflow: number; net: number }[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.inflow, d.outflow]), 1);
  const ticks = calcAxisTicks(maxVal);
  const chartMax = ticks[ticks.length - 1] || 1;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '28px 24px' }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 10, letterSpacing: '0.15em', color: C.textSub }}>
        <Legend color={C.gold} label="入金" />
        <Legend color={C.crimson} label="出金" />
      </div>
      <div style={{ display: 'flex', height: 220 }}>
        <YAxis ticks={ticks} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {ticks.map((t, i) => (
              <div key={i} style={{
                position: 'absolute', left: 0, right: 0,
                bottom: `${(t / chartMax) * 100}%`,
                borderTop: `1px solid ${C.lineSoft}`,
              }} />
            ))}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end' }}>
              {data.map(d => (
                <div key={d.month} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 2, height: '100%' }}>
                  <div style={{ width: 8, height: `${(d.inflow / chartMax) * 100}%`, background: C.gold, opacity: d.inflow > 0 ? 1 : 0 }} title={`${d.month}月 入金 ${yen(d.inflow)}`} />
                  <div style={{ width: 8, height: `${(d.outflow / chartMax) * 100}%`, background: C.crimson, opacity: d.outflow > 0 ? 1 : 0 }} title={`${d.month}月 出金 ${yen(d.outflow)}`} />
                </div>
              ))}
            </div>
          </div>
          <XAxis />
        </div>
      </div>
    </div>
  );
}

// ========== 共通: Y軸・X軸・凡例 ==========

function YAxis({ ticks }: { ticks: number[] }) {
  return (
    <div style={{ width: 56, flexShrink: 0, paddingRight: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 24 }}>
      {[...ticks].reverse().map((t, i) => (
        <span key={i} style={{ fontFamily: F.num, fontSize: 9, color: C.textMute, textAlign: 'right', fontFeatureSettings: "'tnum' 1" }}>
          {yenShort(t)}
        </span>
      ))}
    </div>
  );
}

function XAxis() {
  return (
    <div style={{ display: 'flex', paddingTop: 8, height: 24 }}>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F.num, fontSize: 10, color: C.textMute, fontFeatureSettings: "'tnum' 1" }}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 10,
        height: line ? 2 : 10,
        background: color,
        display: 'inline-block',
        transform: line ? 'translateY(-3px)' : undefined,
      }} />
      {label}
    </span>
  );
}

// ========== 事業別フロー(サンキー的) ==========

function DivisionFlow({ divisions }: { divisions: { id: string; name: string; label: string; color: string; revenue: number; expense: number; profit: number }[] }) {
  const totalRev = divisions.reduce((s, d) => s + d.revenue, 0);
  const totalExp = divisions.reduce((s, d) => s + d.expense, 0);
  const sorted = [...divisions].sort((a, b) => b.revenue - a.revenue);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '28px 24px' }}>
      {/* 全体サマリー */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${C.lineSoft}` }}>
        <div>
          <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.textMute, marginBottom: 6 }}>合計売上</p>
          <p style={{ fontFamily: F.num, fontSize: 22, color: C.gold, fontWeight: 500 }}>{yenShort(totalRev)}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.textMute, marginBottom: 6 }}>合計経費</p>
          <p style={{ fontFamily: F.num, fontSize: 22, color: C.crimson, fontWeight: 500 }}>{yenShort(totalExp)}</p>
        </div>
      </div>

      {/* 事業別バー */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {sorted.map(d => {
          const revPct = totalRev > 0 ? (d.revenue / totalRev) * 100 : 0;
          const expPct = totalExp > 0 ? (d.expense / totalExp) * 100 : 0;
          const profitColor = d.profit >= 0 ? C.green : C.crimson;
          return (
            <div key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, background: C.gold, display: 'inline-block' }} />
                  <span style={{ fontFamily: F.jp, fontSize: 14, color: C.text }}>{d.label}</span>
                  <span style={{ fontFamily: F.num, fontSize: 10, color: C.textMute, letterSpacing: '0.1em' }}>{d.name.toUpperCase()}</span>
                </div>
                <span style={{ fontFamily: F.num, fontSize: 16, color: profitColor, fontWeight: 500 }}>
                  {yenShort(d.profit)}
                </span>
              </div>

              {/* 売上バー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <span style={{ width: 36, fontSize: 9, color: C.textMute, letterSpacing: '0.1em' }}>売上</span>
                <div style={{ flex: 1, height: 4, background: C.lineSoft, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${revPct}%`, background: C.gold }} />
                </div>
                <span style={{ width: 80, textAlign: 'right', fontFamily: F.num, fontSize: 11, color: C.textSub }}>
                  {yenShort(d.revenue)}
                </span>
              </div>

              {/* 経費バー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 36, fontSize: 9, color: C.textMute, letterSpacing: '0.1em' }}>経費</span>
                <div style={{ flex: 1, height: 4, background: C.lineSoft, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${expPct}%`, background: C.crimson }} />
                </div>
                <span style={{ width: 80, textAlign: 'right', fontFamily: F.num, fontSize: 11, color: C.textSub }}>
                  {yenShort(d.expense)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== 勘定科目別経費バー ==========

function KamokuBars({ items, total }: { items: { kamoku: string; name: string; amount: number }[]; total: number }) {
  if (items.length === 0) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: C.textMute }}>経費データがありません</p>
      </div>
    );
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '28px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((item, i) => {
          const pct = total > 0 ? (item.amount / total) * 100 : 0;
          return (
            <div key={item.kamoku}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: F.num, fontSize: 9, color: C.textMute, letterSpacing: '0.15em', minWidth: 24 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontFamily: F.jp, fontSize: 13, color: C.text }}>{item.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: F.num, fontSize: 11, color: C.textMute, fontFeatureSettings: "'tnum' 1" }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span style={{ fontFamily: F.num, fontSize: 14, color: C.text, fontFeatureSettings: "'tnum' 1", minWidth: 80, textAlign: 'right' }}>
                    {yenShort(item.amount)}
                  </span>
                </div>
              </div>
              <div style={{ height: 3, background: C.lineSoft, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: C.crimson,
                  opacity: 0.7,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== PJ別利益率テーブル ==========

function ProjectTable({ items }: { items: { id: string; name: string; division: string; revenue: number; expense: number; profit: number; rate: number }[] }) {
  if (items.length === 0) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: C.textMute }}>プロジェクト別データがありません</p>
      </div>
    );
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      {/* ヘッダー */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 100px 100px 100px 120px',
        gap: 12,
        padding: '14px 24px',
        borderBottom: `1px solid ${C.line}`,
        fontSize: 9,
        letterSpacing: '0.2em',
        color: C.textMute,
        textTransform: 'uppercase',
        fontWeight: 500,
      }}>
        <span></span>
        <span>プロジェクト</span>
        <span style={{ textAlign: 'right' }}>売上</span>
        <span style={{ textAlign: 'right' }}>経費</span>
        <span style={{ textAlign: 'right' }}>利益</span>
        <span>利益率</span>
      </div>

      {items.map(p => {
        const dotColor = p.rate >= 50 ? C.gold : p.rate >= 20 ? C.green : p.profit < 0 ? C.crimson : C.textMute;
        const barColor = p.profit >= 0 ? C.green : C.crimson;
        const barWidth = Math.min(Math.abs(p.rate), 100);
        return (
          <div
            key={p.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 100px 100px 100px 120px',
              gap: 12,
              padding: '16px 24px',
              borderBottom: `1px solid ${C.lineSoft}`,
              alignItems: 'center',
            }}
          >
            <span style={{ width: 8, height: 8, background: dotColor, display: 'inline-block', alignSelf: 'center' }} />
            <span style={{ fontFamily: F.jp, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            <span style={{ fontFamily: F.num, fontSize: 13, color: C.textSub, textAlign: 'right', fontFeatureSettings: "'tnum' 1" }}>
              {yenShort(p.revenue)}
            </span>
            <span style={{ fontFamily: F.num, fontSize: 13, color: C.textSub, textAlign: 'right', fontFeatureSettings: "'tnum' 1" }}>
              {yenShort(p.expense)}
            </span>
            <span style={{ fontFamily: F.num, fontSize: 14, color: barColor, textAlign: 'right', fontFeatureSettings: "'tnum' 1", fontWeight: 500 }}>
              {yenShort(p.profit)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 3, background: C.lineSoft, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barWidth}%`, background: barColor }} />
              </div>
              <span style={{ fontFamily: F.num, fontSize: 11, color: barColor, fontFeatureSettings: "'tnum' 1", minWidth: 40, textAlign: 'right' }}>
                {p.rate.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
