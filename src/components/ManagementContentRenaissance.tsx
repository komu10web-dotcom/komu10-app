'use client';

/**
 * ManagementContentRenaissance.tsx — komu10 経営ダッシュボード δ案 v0.22.0
 *
 * 設計思想:
 *   - スマホ(<768px) = 入力主体・簡易チェック・誘導文
 *   - タブレット縦・PC(>=768px) = 没入体験フル表示・5年先を行く格
 *   - 配色: 黒(#0a0a0b) / 白 / 金黄(#D4A03A) / 緑(#1B4D3E) / 赤(#C23728)
 *   - フォント: Saira Condensed / Shippori Mincho / Inter
 *   - 装飾: 影・グラデ・絵文字 完全禁止
 *   - JSX直書きスタイル(!important禁止)
 *
 * STEP 8 通過済(四面トリプルチェック+Jobs+COMMANDER)
 *
 * v0.22.0 改修:
 *   - スマホ簡易ビュー新設(KPIのみ+案C「入力は、ここで。経営は、PC で。」)
 *   - PC/タブレットの没入度を強化(max-width 1200・余白拡大・Saira大型化)
 *   - 事業別バー基準を全事業最大値で正規化(SUPだけバー長同じ問題修正)
 *   - PJ別テーブルの情報密度調整(カラム幅広く)
 *   - 数字フェードイン(初回マウント時 280ms)
 *
 * ブランド統括: Hedi Slimane / AD: Raf Simons / 窓口: David Sims
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { DIVISIONS, KAMOKU } from '@/types/database';
import type { Transaction, Project, TransactionAllocation, BankAccount } from '@/types/database';
import { Loader2 } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';
import { useViewport } from '@/lib/useViewport';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useCountUp } from '@/lib/useCountUp';
import { ViewSwitch } from '@/lib/ViewSwitch';

import { APP_DARK, FONTS, TYPE_SCALE } from '@/lib/brandTokens';

// v0.33.0: ブランドトークン一元管理に統合(brandTokens.ts)
// 旧: ローカル C/F オブジェクト定義 → 新: APP_DARK / FONTS から参照
// ブランド規定変更時は brandTokens.ts の1箇所変更で全画面に波及
const C = APP_DARK;
// Renaissance ローカル命名(body/jp/num)をブランドトークン正式名(ui/mincho/num)へマッピング
const F = {
  body: FONTS.ui,
  jp:   FONTS.mincho,
  num:  FONTS.num,
} as const;
// Phase 1 (session77): タイポ階層 7階層+h1Jp(Khoi Vinh modular scale 1.333)
// 直書き fontSize 全廃 → T.t1 〜 T.t7 / T.h1Jp で参照
const T = TYPE_SCALE;

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

export default function ManagementContentRenaissance() {
  const { mode, owner, startDate, endDate, year } = usePeriodRange();
  const { isWide, mounted } = useViewport();
  // session77 Phase 1 軸4: prefers-reduced-motion 対応(WCAG / Léonie Watson 必須)
  const reduceMotion = useReducedMotion();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<TransactionAllocation[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [chartYearTx, setChartYearTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pl' | 'cf'>('pl');
  const [appeared, setAppeared] = useState(false);
  // session77 Phase 1 B3: Tufte 流メタ情報帯(更新日)
  const [lastUpdated, setLastUpdated] = useState<string>('—');

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
      // session77 Phase 1 B3: メタ情報帯の更新日を記録(YYYY-MM-DD HH:MM)
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setLastUpdated(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`);
    }
  }, [owner, startDate, endDate, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allocByTx = useMemo(() => {
    const m: Record<string, TransactionAllocation[]> = {};
    allocations.forEach(a => {
      if (!m[a.transaction_id]) m[a.transaction_id] = [];
      m[a.transaction_id].push(a);
    });
    return m;
  }, [allocations]);

  const revenueTotal = transactions.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + (t.amount || 0), 0);
  const expenseTotal = transactions.filter(t => t.tx_type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const profitTotal = revenueTotal - expenseTotal;
  const profitRate = revenueTotal > 0 ? (profitTotal / revenueTotal) * 100 : 0;

  // v0.31.0: 実績/予測分離。settled=実績、それ以外(forecast/accrued/billed)=予測
  // IncomeContent と同じ getEffectiveStatus パターン(status null は settled 扱い)
  const isSettled = (t: Transaction): boolean => (t.status || 'settled') === 'settled';

  const monthlyPL = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mTx = chartYearTx.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() + 1 === m;
    });
    const revs = mTx.filter(t => t.tx_type === 'revenue');
    const exps = mTx.filter(t => t.tx_type === 'expense');
    const revSettled = revs.filter(isSettled).reduce((s, t) => s + (t.amount || 0), 0);
    const revForecast = revs.filter(t => !isSettled(t)).reduce((s, t) => s + (t.amount || 0), 0);
    const expSettled = exps.filter(isSettled).reduce((s, t) => s + (t.amount || 0), 0);
    const expForecast = exps.filter(t => !isSettled(t)).reduce((s, t) => s + (t.amount || 0), 0);
    const rev = revSettled + revForecast;
    const exp = expSettled + expForecast;
    return {
      month: m,
      rev, exp, profit: rev - exp,
      revSettled, revForecast,
      expSettled, expForecast,
      profitSettled: revSettled - expSettled,
    };
  }), [chartYearTx]);

  const monthlyCF = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mStr = String(m).padStart(2, '0');
    const prefix = `${year}-${mStr}`;
    const mTx = (chartYearTx.length > 0 ? chartYearTx : transactions).filter(t => {
      const payDate = t.actual_payment_date || t.date;
      return payDate.startsWith(prefix);
    });
    const ins = mTx.filter(t => t.tx_type === 'revenue');
    const outs = mTx.filter(t => t.tx_type === 'expense');
    const inflowSettled = ins.filter(isSettled).reduce((s, t) => s + (t.amount || 0), 0);
    const inflowForecast = ins.filter(t => !isSettled(t)).reduce((s, t) => s + (t.amount || 0), 0);
    const outflowSettled = outs.filter(isSettled).reduce((s, t) => s + (t.amount || 0), 0);
    const outflowForecast = outs.filter(t => !isSettled(t)).reduce((s, t) => s + (t.amount || 0), 0);
    const inflow = inflowSettled + inflowForecast;
    const outflow = outflowSettled + outflowForecast;
    return {
      month: m,
      inflow, outflow, net: inflow - outflow,
      inflowSettled, inflowForecast,
      outflowSettled, outflowForecast,
      netSettled: inflowSettled - outflowSettled,
    };
  }), [chartYearTx, transactions, year]);

  const cfTotalInflow = monthlyCF.reduce((s, m) => s + m.inflow, 0);
  const cfTotalOutflow = monthlyCF.reduce((s, m) => s + m.outflow, 0);
  const cfNet = cfTotalInflow - cfTotalOutflow;

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

  const activeDivisions = useMemo(
    () => Object.entries(DIVISIONS).filter(([id]) => id !== 'general'),
    []
  );

  const divisionPL = useMemo(() => {
    const divExp: Record<string, number> = {};
    const divRev: Record<string, number> = {};
    // session77 Phase 1 B5: Small Multiples 用に月次推移を集計
    const divMonthlyRev: Record<string, number[]> = {};
    const divMonthlyExp: Record<string, number[]> = {};
    const ensureMonth = (rec: Record<string, number[]>, id: string) => {
      if (!rec[id]) rec[id] = Array(12).fill(0);
      return rec[id];
    };
    const monthIdxOf = (date: string | null | undefined): number => {
      if (!date) return -1;
      const mm = parseInt(date.slice(5, 7), 10);
      return isNaN(mm) ? -1 : mm - 1;
    };
    transactions.forEach(t => {
      const allocs = allocByTx[t.id];
      const mIdx = monthIdxOf(t.date);
      if (t.tx_type === 'revenue') {
        const div = t.division || 'general';
        divRev[div] = (divRev[div] || 0) + (t.amount || 0);
        if (mIdx >= 0 && mIdx < 12) ensureMonth(divMonthlyRev, div)[mIdx] += (t.amount || 0);
      } else if (t.tx_type === 'expense') {
        if (allocs && allocs.length > 0) {
          allocs.forEach(a => {
            divExp[a.division_id] = (divExp[a.division_id] || 0) + (a.amount || 0);
            if (mIdx >= 0 && mIdx < 12) ensureMonth(divMonthlyExp, a.division_id)[mIdx] += (a.amount || 0);
          });
        }
      }
    });
    return activeDivisions.map(([id, v]) => {
      const rev = divRev[id] || 0;
      const exp = divExp[id] || 0;
      const mRev = divMonthlyRev[id] || Array(12).fill(0);
      const mExp = divMonthlyExp[id] || Array(12).fill(0);
      const monthlyProfit = mRev.map((r, i) => r - mExp[i]);
      return { id, name: v.name, label: v.label, color: v.color, revenue: rev, expense: exp, profit: rev - exp, monthlyProfit };
    });
  }, [transactions, allocByTx, activeDivisions]);

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

  const projectPL = useMemo(() => {
    const m: Record<string, { revenue: number; expense: number; monthlyRev: number[]; monthlyExp: number[] }> = {};
    const ensure = (id: string) => {
      if (!m[id]) m[id] = {
        revenue: 0, expense: 0,
        monthlyRev: Array(12).fill(0),
        monthlyExp: Array(12).fill(0),
      };
      return m[id];
    };
    transactions.forEach(t => {
      const allocs = allocByTx[t.id];
      // 月次 index は date の月から(0-11)
      const monthIdx = (() => {
        if (!t.date) return -1;
        const mm = parseInt(t.date.slice(5, 7), 10);
        return isNaN(mm) ? -1 : mm - 1;
      })();
      if (t.tx_type === 'revenue' && t.project_id) {
        const rec = ensure(t.project_id);
        rec.revenue += (t.amount || 0);
        if (monthIdx >= 0 && monthIdx < 12) rec.monthlyRev[monthIdx] += (t.amount || 0);
      } else if (t.tx_type === 'expense' && allocs) {
        allocs.forEach(a => {
          if (a.project_id) {
            const rec = ensure(a.project_id);
            rec.expense += (a.amount || 0);
            if (monthIdx >= 0 && monthIdx < 12) rec.monthlyExp[monthIdx] += (a.amount || 0);
          }
        });
      }
    });
    return projects
      .map(pj => {
        const pl = m[pj.id] || { revenue: 0, expense: 0, monthlyRev: Array(12).fill(0), monthlyExp: Array(12).fill(0) };
        const profit = pl.revenue - pl.expense;
        const rate = pl.revenue > 0 ? (profit / pl.revenue) * 100 : 0;
        const monthlyProfit = pl.monthlyRev.map((r, i) => r - pl.monthlyExp[i]);
        return {
          id: pj.id, name: pj.name, division: pj.division,
          revenue: pl.revenue, expense: pl.expense, profit, rate,
          monthlyProfit,
        };
      })
      .filter(p => p.revenue > 0 || p.expense > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);
  }, [transactions, projects, allocByTx]);

  if (loading || !mounted) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 20, height: 20, color: C.gold }} className="animate-spin" />
      </div>
    );
  }

  if (!isWide) {
    return (
      <MobileView
        appeared={appeared}
        year={year}
        revenueTotal={revenueTotal}
        expenseTotal={expenseTotal}
        profitTotal={profitTotal}
        profitRate={profitRate}
        runwayMonths={runwayMonths}
        runwayColor={runwayColor}
        runwayLabel={runwayLabel}
        totalBankBalance={totalBankBalance}
      />
    );
  }

  const poeticTitle = 'いま、儲かっているのか。';
  const subContext = viewMode === 'pl' ? 'お金は、どう生まれたか。' : 'お金は、どう動いたか。';
  const sectionLabel = viewMode === 'pl' ? '損益 — Profit & Loss' : 'キャッシュフロー — Cash Flow';

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.text,
      fontFamily: F.body,
      opacity: appeared ? 1 : 0,
      transition: reduceMotion ? 'none' : 'opacity 280ms ease-out',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 96px 128px' }}>

        <header style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 56, marginBottom: 96 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <p style={{ fontFamily: F.num, fontSize: T.t6, letterSpacing: '0.35em', color: C.gold, marginBottom: 22, fontWeight: 500 }}>
                VOLUME 04 · MANAGEMENT
              </p>
              <h1 style={{
                fontFamily: F.jp,
                fontSize: T.h1Jp,
                fontWeight: 400,
                color: C.text,
                lineHeight: 1.35,
                letterSpacing: '0.04em',
                marginBottom: 14,
              }}>
                {poeticTitle}
              </h1>
              <p style={{
                fontFamily: F.jp,
                fontSize: T.t4,
                fontWeight: 400,
                color: C.textSub,
                letterSpacing: '0.06em',
                lineHeight: 1.5,
                marginBottom: 16,
              }}>
                — {subContext}
              </p>
              <p style={{ fontSize: T.t6, color: C.textMute, letterSpacing: '0.2em', fontWeight: 300 }}>
                {sectionLabel} · {year}
              </p>
            </div>

            <nav style={{ display: 'flex', border: `1px solid ${C.line}` }}>
              {([{ v: 'pl', label: 'PL' }, { v: 'cf', label: 'CF' }] as const).map((tab, i) => (
                <button
                  key={tab.v}
                  onClick={() => setViewMode(tab.v)}
                  style={{
                    padding: '12px 28px',
                    fontSize: T.t6,
                    fontFamily: F.body,
                    fontWeight: 500,
                    letterSpacing: '0.2em',
                    background: viewMode === tab.v ? C.gold : 'transparent',
                    color: viewMode === tab.v ? C.bg : C.textSub,
                    border: 'none',
                    borderLeft: i > 0 ? `1px solid ${C.line}` : 'none',
                    cursor: 'pointer',
                    transition: reduceMotion ? 'none' : 'background 0.18s ease, color 0.18s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <ViewSwitch viewKey={`${viewMode}-${year}`}>
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
        </ViewSwitch>

        <footer style={{
          marginTop: 96,
          paddingTop: 32,
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 24,
          fontSize: T.t7,
          color: C.textMute,
          letterSpacing: '0.15em',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: F.num, fontWeight: 500, fontSize: T.t5, color: C.text }}>
              komu<span style={{ color: C.gold }}>10</span>
            </span>
            {/* session77 Phase 1 軸3 / B3: Tufte 流メタ情報帯(出典・単位・更新日) */}
            <span style={{ fontFamily: F.num, fontSize: T.t7, letterSpacing: '0.2em', color: C.textFade, textTransform: 'uppercase' }}>
              Unit · JPY  /  Source · Supabase
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'right' }}>
            <span style={{ fontFamily: F.num, letterSpacing: '0.25em' }}>
              VOLUME 04 · MANAGEMENT · {year}
            </span>
            <span style={{ fontFamily: F.num, fontSize: T.t7, letterSpacing: '0.2em', color: C.textFade, textTransform: 'uppercase' }}>
              Last updated · {lastUpdated}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ========== スマホ簡易ビュー ==========

function MobileView({ appeared, year, revenueTotal, expenseTotal, profitTotal, profitRate, runwayMonths, runwayColor, runwayLabel, totalBankBalance }: {
  appeared: boolean;
  year: string;
  revenueTotal: number;
  expenseTotal: number;
  profitTotal: number;
  profitRate: number;
  runwayMonths: number | null;
  runwayColor: string;
  runwayLabel: string;
  totalBankBalance: number;
}) {
  // session77 Phase 1 軸4: 主指標 4KPI のカウントアップ + reduceMotion 対応
  const reduceMotion = useReducedMotion();
  const animRev    = useCountUp(revenueTotal);
  const animExp    = useCountUp(expenseTotal);
  const animProfit = useCountUp(profitTotal);
  const animRate   = useCountUp(profitRate);
  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.text,
      fontFamily: F.body,
      opacity: appeared ? 1 : 0,
      transition: reduceMotion ? 'none' : 'opacity 280ms ease-out',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px 64px' }}>

        <header style={{ paddingBottom: 24, marginBottom: 36, borderBottom: `1px solid ${C.line}` }}>
          <p style={{ fontFamily: F.num, fontSize: T.t6, letterSpacing: '0.3em', color: C.gold, marginBottom: 14, fontWeight: 500 }}>
            VOLUME 04 · MANAGEMENT
          </p>
          <h1 style={{
            fontFamily: F.jp,
            fontSize: T.t3,
            fontWeight: 400,
            color: C.text,
            lineHeight: 1.45,
            letterSpacing: '0.03em',
            marginBottom: 10,
          }}>
            いま、儲かっているのか。
          </h1>
          <p style={{ fontSize: T.t7, color: C.textMute, letterSpacing: '0.2em', fontWeight: 300 }}>
            損益 · {year}
          </p>
        </header>

        <section style={{ marginBottom: 40 }}>
          <p style={{ fontFamily: F.num, fontSize: T.t7, letterSpacing: '0.25em', color: C.gold, marginBottom: 16, fontWeight: 500 }}>
            — 簡易チェック
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: `1px solid ${C.line}`,
            background: C.surface,
          }}>
            {[
              { label: '売上', value: yenShort(animRev), color: C.gold, borderLeft: false, borderTop: false },
              { label: '経費', value: yenShort(animExp), color: C.crimson, borderLeft: true, borderTop: false },
              { label: '利益', value: yenShort(animProfit), color: profitTotal >= 0 ? C.green : C.crimson, borderLeft: false, borderTop: true },
              { label: '利益率', value: `${animRate.toFixed(1)}%`, color: profitRate >= 0 ? C.green : C.crimson, borderLeft: true, borderTop: true },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  padding: '24px 18px',
                  borderLeft: kpi.borderLeft ? `1px solid ${C.line}` : 'none',
                  borderTop: kpi.borderTop ? `1px solid ${C.line}` : 'none',
                }}
              >
                <p style={{ fontSize: T.t7, letterSpacing: '0.25em', color: C.textMute, marginBottom: 12, textTransform: 'uppercase' }}>
                  {kpi.label}
                </p>
                <p style={{
                  fontFamily: F.num,
                  fontSize: T.t3,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  color: kpi.color,
                  fontFeatureSettings: "'tnum' 1",
                }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {runwayMonths !== null && (
          <section style={{ marginBottom: 48 }}>
            <p style={{ fontFamily: F.num, fontSize: T.t7, letterSpacing: '0.25em', color: C.gold, marginBottom: 16, fontWeight: 500 }}>
              — このペースで
            </p>
            <div style={{
              background: C.surface,
              border: `1px solid ${C.line}`,
              padding: '28px 24px',
            }}>
              <p style={{ fontSize: T.t7, letterSpacing: '0.25em', color: C.textMute, marginBottom: 14, textTransform: 'uppercase' }}>
                Runway · あと
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                <span style={{
                  fontFamily: F.num,
                  fontSize: T.t2,
                  fontWeight: 400,
                  lineHeight: 0.9,
                  letterSpacing: '-0.03em',
                  color: runwayColor,
                  fontFeatureSettings: "'tnum' 1",
                }}>
                  {runwayMonths.toFixed(1)}
                </span>
                <span style={{ fontFamily: F.jp, fontSize: T.t4, color: C.textSub }}>ヶ月</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: T.t7, letterSpacing: '0.1em' }}>
                <span style={{
                  padding: '3px 8px',
                  background: runwayColor === C.crimson ? C.crimsonSoft : runwayColor === C.gold ? C.goldSoft : C.greenSoft,
                  color: runwayColor,
                  fontWeight: 500,
                }}>
                  {runwayLabel}
                </span>
                <span style={{ color: C.textSub }}>
                  口座残高 {yenShort(totalBankBalance)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ===== 誘導メッセージ(案C 静謐) ===== */}
        <section style={{ marginTop: 56, marginBottom: 24 }}>
          <div style={{
            padding: '40px 8px',
            borderTop: `1px solid ${C.line}`,
            borderBottom: `1px solid ${C.line}`,
            textAlign: 'center',
          }}>
            <p style={{
              fontFamily: F.jp,
              fontSize: T.t4,
              color: C.text,
              lineHeight: 2,
              letterSpacing: '0.08em',
              marginBottom: 4,
            }}>
              入力は、ここで。
            </p>
            <p style={{
              fontFamily: F.jp,
              fontSize: T.t4,
              color: C.text,
              lineHeight: 2,
              letterSpacing: '0.08em',
              marginBottom: 28,
            }}>
              経営は、PC で。
            </p>
            <p style={{
              fontSize: T.t6,
              color: C.textSub,
              lineHeight: 1.95,
              letterSpacing: '0.05em',
              maxWidth: 320,
              margin: '0 auto',
            }}>
              いま使っている画面の、外側に余白があります。
              <br />
              komu10 の経営ダッシュボードは、PC・タブレットでご覧ください。
            </p>
          </div>
        </section>

        <footer style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: T.t7,
          color: C.textMute,
          letterSpacing: '0.15em',
        }}>
          <span style={{ fontFamily: F.num, fontWeight: 500, fontSize: T.t6 }}>
            komu<span style={{ color: C.gold }}>10</span>
          </span>
          <span style={{ fontFamily: F.num, letterSpacing: '0.25em' }}>
            VOLUME 04 · {year}
          </span>
        </footer>
      </div>
    </div>
  );
}

function PLView({ year, revenueTotal, expenseTotal, profitTotal, profitRate, monthlyPL, divisionPL, kamokuExpense, projectPL }: {
  year: string;
  revenueTotal: number;
  expenseTotal: number;
  profitTotal: number;
  profitRate: number;
  monthlyPL: { month: number; rev: number; exp: number; profit: number;
    revSettled: number; revForecast: number;
    expSettled: number; expForecast: number;
    profitSettled: number;
  }[];
  divisionPL: { id: string; name: string; label: string; color: string; revenue: number; expense: number; profit: number; monthlyProfit: number[] }[];
  kamokuExpense: { kamoku: string; name: string; amount: number }[];
  projectPL: { id: string; name: string; division: string; revenue: number; expense: number; profit: number; rate: number; monthlyProfit: number[] }[];
}) {
  // session77 Phase 1 軸4: 主指標 4KPI のカウントアップ(280-400ms / easeOutQuart)
  // prefers-reduced-motion: reduce のとき即時表示にフォールバック
  const animRev    = useCountUp(revenueTotal);
  const animExp    = useCountUp(expenseTotal);
  const animProfit = useCountUp(profitTotal);
  const animRate   = useCountUp(profitRate);
  return (
    <>
      <Section num="01" title={`${year}年の手応え`} tone="lead">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          border: `1px solid ${C.line}`,
        }}>
          {[
            { label: '売上', value: yenShort(animRev), color: C.gold },
            { label: '経費', value: yenShort(animExp), color: C.crimson },
            { label: '利益', value: yenShort(animProfit), color: profitTotal >= 0 ? C.green : C.crimson },
            { label: '利益率', value: `${animRate.toFixed(1)}%`, color: profitRate >= 0 ? C.green : C.crimson },
          ].map((kpi, i) => (
            <div
              key={kpi.label}
              style={{
                padding: '40px 32px',
                borderLeft: i > 0 ? `1px solid ${C.line}` : 'none',
                background: C.surface,
              }}
            >
              <p style={{ fontSize: T.t7, letterSpacing: '0.3em', color: C.textMute, marginBottom: 22, textTransform: 'uppercase', fontWeight: 500 }}>
                {kpi.label}
              </p>
              <p style={{
                fontFamily: F.num,
                fontSize: T.t2,
                fontWeight: 400,
                letterSpacing: '-0.025em',
                lineHeight: 1,
                color: kpi.color,
                fontFeatureSettings: "'tnum' 1, 'lnum' 1",
              }}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section num="02" title={`${year}年の月別、お金の流れ`}>
        <PLChart data={monthlyPL} />
      </Section>

      <Section num="03" title="事業ごとに、利益はどこで立ったか">
        <DivisionFlow divisions={divisionPL} />
      </Section>

      <Section num="04" title="経費は、どこに使われたか">
        <KamokuBars items={kamokuExpense} total={expenseTotal} />
      </Section>

      <Section num="05" title="プロジェクト別、利益が立つ場所">
        <ProjectTable items={projectPL} />
      </Section>
    </>
  );
}

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
  monthlyCF: { month: number; inflow: number; outflow: number; net: number;
    inflowSettled: number; inflowForecast: number;
    outflowSettled: number; outflowForecast: number;
    netSettled: number;
  }[];
}) {
  // session77 Phase 1 軸4: 主指標カウントアップ + reduceMotion 対応
  const animRunway   = useCountUp(runwayMonths ?? 0);
  const animInflow   = useCountUp(cfTotalInflow);
  const animOutflow  = useCountUp(cfTotalOutflow);
  const animNet      = useCountUp(cfNet);
  const animBalance  = useCountUp(totalBankBalance);
  return (
    <>
      <Section num="01" title="このペースで、あと何ヶ月もつのか" tone="lead">
        <div style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          padding: '64px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 48,
        }}>
          <div>
            <p style={{ fontSize: T.t6, letterSpacing: '0.3em', color: C.textMute, marginBottom: 24, textTransform: 'uppercase', fontWeight: 500 }}>
              RUNWAY · あと
            </p>
            {runwayMonths !== null ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 18 }}>
                <span style={{
                  fontFamily: F.num,
                  fontSize: T.t1,
                  fontWeight: 400,
                  lineHeight: 0.88,
                  letterSpacing: '-0.05em',
                  color: runwayColor,
                  fontFeatureSettings: "'tnum' 1",
                }}>
                  {animRunway.toFixed(1)}
                </span>
                <span style={{ fontFamily: F.jp, fontSize: T.t3, color: C.textSub, letterSpacing: '0.05em' }}>ヶ月</span>
              </div>
            ) : (
              <p style={{ fontFamily: F.jp, fontSize: T.t4, color: C.textMute, marginBottom: 18 }}>
                データ不足
              </p>
            )}
            {runwayMonths !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: T.t6, letterSpacing: '0.12em' }}>
                <span style={{
                  padding: '5px 14px',
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

          <div style={{ minWidth: 280, paddingLeft: 32, borderLeft: `1px solid ${C.line}` }}>
            <p style={{ fontSize: T.t6, letterSpacing: '0.3em', color: C.textMute, marginBottom: 18, textTransform: 'uppercase', fontWeight: 500 }}>
              口座残高
            </p>
            {bankAccounts.length === 0 ? (
              <p style={{ fontSize: T.t6, color: C.textMute }}>口座未登録</p>
            ) : (
              <>
                {bankAccounts.map(ba => (
                  <div key={ba.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, fontSize: T.t5 }}>
                    <span style={{ color: C.textSub }}>{ba.name}</span>
                    <span style={{ fontFamily: F.num, color: C.text, letterSpacing: '-0.01em' }}>{yenShort(ba.balance)}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: T.t6, color: C.textSub, letterSpacing: '0.08em' }}>合計</span>
                  <span style={{ fontFamily: F.num, fontSize: T.t3, color: C.gold, fontWeight: 500 }}>{yenShort(animBalance)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section num="02" title={`${year}年の入金と出金`}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          border: `1px solid ${C.line}`,
        }}>
          {[
            { label: '入金', value: animInflow,  color: C.gold },
            { label: '出金', value: animOutflow, color: C.crimson },
            { label: '差引', value: animNet,     color: cfNet >= 0 ? C.green : C.crimson },
          ].map((kpi, i) => (
            <div key={kpi.label} style={{ padding: '40px 32px', borderLeft: i > 0 ? `1px solid ${C.line}` : 'none', background: C.surface }}>
              <p style={{ fontSize: T.t7, letterSpacing: '0.3em', color: C.textMute, marginBottom: 22, textTransform: 'uppercase', fontWeight: 500 }}>{kpi.label}</p>
              <p style={{
                fontFamily: F.num,
                fontSize: T.t2,
                fontWeight: 400,
                letterSpacing: '-0.025em',
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

      <Section num="03" title={`${year}年の月別、入出金`}>
        <CFChart data={monthlyCF} />
      </Section>
    </>
  );
}

function Section({ num, title, tone = 'normal', children }: {
  num: string;
  title: string;
  tone?: 'lead' | 'normal' | 'meta';
  children: React.ReactNode;
}) {
  // session77 Phase 1 軸3 / B1: セクション間余白の階層化(原研哉「間」の哲学)
  // lead   = 主役セクション(画面冒頭の主指標 KPI 群)
  // normal = 補助セクション(月別チャート・部門別など)
  // meta   = 末尾のメタ・参考情報
  const sectionMb = tone === 'lead' ? 120 : tone === 'meta' ? 64 : 80;
  return (
    <section style={{ marginBottom: sectionMb }}>
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'baseline', gap: 20 }}>
        <span style={{
          fontFamily: F.num,
          fontSize: T.t5,
          color: C.gold,
          letterSpacing: '0.25em',
          fontWeight: 500,
        }}>— {num}</span>
        <span style={{
          fontFamily: F.jp,
          fontSize: T.t4,
          color: C.textSub,
          letterSpacing: '0.06em',
        }}>
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

function PLChart({ data }: { data: { month: number; rev: number; exp: number; profit: number;
  revSettled: number; revForecast: number;
  expSettled: number; expForecast: number;
  profitSettled: number;
}[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.rev, d.exp]), 1);
  const ticks = calcAxisTicks(maxVal);
  const chartMax = ticks[ticks.length - 1] || 1;

  // v0.31.0: 実績/予測分離。境界月=settled が profit に存在する最後の月
  // 境界月までは実線、境界月の次月以降は点線で利益折れ線を描く
  const lastSettledIdx = (() => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].revSettled > 0 || data[i].expSettled > 0) return i;
    }
    return -1;
  })();
  const settledLine = data
    .filter((_, i) => i <= lastSettledIdx)
    .map((d, i) => `${((i + 0.5) / 12) * 100},${100 - Math.max(0, (d.profitSettled / chartMax) * 100)}`)
    .join(' ');
  const forecastLine = data.map((d, i) => `${((i + 0.5) / 12) * 100},${100 - Math.max(0, (d.profit / chartMax) * 100)}`).join(' ');

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 36px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 28, fontSize: T.t6, letterSpacing: '0.18em', color: C.textSub }}>
          <Legend color={C.gold} label="売上" />
          <Legend color={C.crimson} label="経費" />
          <Legend color={C.green} label="利益" line />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: T.t7, letterSpacing: '0.2em', color: C.textMute, textTransform: 'uppercase' }}>
          <SubLegend variant="solid" label="実績" />
          <SubLegend variant="hatched" label="見込み" />
        </div>
      </div>

      <div style={{ display: 'flex', height: 280 }}>
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
                <div key={d.month} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 3, height: '100%' }}>
                  {/* 売上棒: 下=settled / 上=forecast 斜線 */}
                  <div style={{ width: 10, height: `${(d.rev / chartMax) * 100}%`, display: 'flex', flexDirection: 'column-reverse', opacity: d.rev > 0 ? 1 : 0 }} title={`${d.month}月 売上 ${yen(d.rev)}\n  実績 ${yen(d.revSettled)}\n  見込み ${yen(d.revForecast)}`}>
                    <div style={{ width: '100%', height: `${d.rev > 0 ? (d.revSettled / d.rev) * 100 : 0}%`, background: C.gold }} />
                    <div style={{ width: '100%', height: `${d.rev > 0 ? (d.revForecast / d.rev) * 100 : 0}%`, background: `repeating-linear-gradient(135deg, ${C.gold} 0 2px, transparent 2px 5px)`, border: `1px solid ${C.gold}`, boxSizing: 'border-box' }} />
                  </div>
                  {/* 経費棒: 下=settled / 上=forecast 斜線 */}
                  <div style={{ width: 10, height: `${(d.exp / chartMax) * 100}%`, display: 'flex', flexDirection: 'column-reverse', opacity: d.exp > 0 ? 1 : 0 }} title={`${d.month}月 経費 ${yen(d.exp)}\n  実績 ${yen(d.expSettled)}\n  見込み ${yen(d.expForecast)}`}>
                    <div style={{ width: '100%', height: `${d.exp > 0 ? (d.expSettled / d.exp) * 100 : 0}%`, background: C.crimson }} />
                    <div style={{ width: '100%', height: `${d.exp > 0 ? (d.expForecast / d.exp) * 100 : 0}%`, background: `repeating-linear-gradient(135deg, ${C.crimson} 0 2px, transparent 2px 5px)`, border: `1px solid ${C.crimson}`, boxSizing: 'border-box' }} />
                  </div>
                </div>
              ))}
            </div>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 100 100">
              {/* 着地見込み利益(全status・点線) */}
              <polyline
                fill="none"
                stroke={C.green}
                strokeWidth="0.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="1.5 1.2"
                vectorEffect="non-scaling-stroke"
                points={forecastLine}
              />
              {/* 確定利益(settled のみ・実線) */}
              {lastSettledIdx >= 0 && (
                <polyline
                  fill="none"
                  stroke={C.green}
                  strokeWidth="0.55"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  points={settledLine}
                />
              )}
            </svg>
          </div>
          <XAxis />
        </div>
      </div>
    </div>
  );
}

function CFChart({ data }: { data: { month: number; inflow: number; outflow: number; net: number;
  inflowSettled: number; inflowForecast: number;
  outflowSettled: number; outflowForecast: number;
  netSettled: number;
}[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.inflow, d.outflow]), 1);
  const ticks = calcAxisTicks(maxVal);
  const chartMax = ticks[ticks.length - 1] || 1;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '40px 36px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 28, fontSize: T.t6, letterSpacing: '0.18em', color: C.textSub }}>
          <Legend color={C.gold} label="入金" />
          <Legend color={C.crimson} label="出金" />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: T.t7, letterSpacing: '0.2em', color: C.textMute, textTransform: 'uppercase' }}>
          <SubLegend variant="solid" label="実績" />
          <SubLegend variant="hatched" label="見込み" />
        </div>
      </div>
      <div style={{ display: 'flex', height: 260 }}>
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
                <div key={d.month} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 3, height: '100%' }}>
                  <div style={{ width: 10, height: `${(d.inflow / chartMax) * 100}%`, display: 'flex', flexDirection: 'column-reverse', opacity: d.inflow > 0 ? 1 : 0 }} title={`${d.month}月 入金 ${yen(d.inflow)}\n  実績 ${yen(d.inflowSettled)}\n  見込み ${yen(d.inflowForecast)}`}>
                    <div style={{ width: '100%', height: `${d.inflow > 0 ? (d.inflowSettled / d.inflow) * 100 : 0}%`, background: C.gold }} />
                    <div style={{ width: '100%', height: `${d.inflow > 0 ? (d.inflowForecast / d.inflow) * 100 : 0}%`, background: `repeating-linear-gradient(135deg, ${C.gold} 0 2px, transparent 2px 5px)`, border: `1px solid ${C.gold}`, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ width: 10, height: `${(d.outflow / chartMax) * 100}%`, display: 'flex', flexDirection: 'column-reverse', opacity: d.outflow > 0 ? 1 : 0 }} title={`${d.month}月 出金 ${yen(d.outflow)}\n  実績 ${yen(d.outflowSettled)}\n  見込み ${yen(d.outflowForecast)}`}>
                    <div style={{ width: '100%', height: `${d.outflow > 0 ? (d.outflowSettled / d.outflow) * 100 : 0}%`, background: C.crimson }} />
                    <div style={{ width: '100%', height: `${d.outflow > 0 ? (d.outflowForecast / d.outflow) * 100 : 0}%`, background: `repeating-linear-gradient(135deg, ${C.crimson} 0 2px, transparent 2px 5px)`, border: `1px solid ${C.crimson}`, boxSizing: 'border-box' }} />
                  </div>
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

function YAxis({ ticks }: { ticks: number[] }) {
  return (
    <div style={{ width: 72, flexShrink: 0, paddingRight: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: 28 }}>
      {[...ticks].reverse().map((t, i) => (
        <span key={i} style={{ fontFamily: F.num, fontSize: T.t7, color: C.textMute, textAlign: 'right', fontFeatureSettings: "'tnum' 1" }}>
          {yenShort(t)}
        </span>
      ))}
    </div>
  );
}

function XAxis() {
  return (
    <div style={{ display: 'flex', paddingTop: 10, height: 28 }}>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center', fontFamily: F.num, fontSize: T.t6, color: C.textMute, fontFeatureSettings: "'tnum' 1" }}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 12,
        height: line ? 2 : 12,
        background: color,
        display: 'inline-block',
        transform: line ? 'translateY(-4px)' : undefined,
      }} />
      {label}
    </span>
  );
}

// v0.31.0: 棒グラフ実績/予測 サブ凡例
function SubLegend({ variant, label }: { variant: 'solid' | 'hatched'; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 14,
        height: 10,
        display: 'inline-block',
        background: variant === 'solid'
          ? C.textSub
          : `repeating-linear-gradient(135deg, ${C.textSub} 0 2px, transparent 2px 5px)`,
        border: variant === 'hatched' ? `1px solid ${C.textSub}` : 'none',
        boxSizing: 'border-box',
      }} />
      {label}
    </span>
  );
}

// ========== 事業別フロー(全事業最大値で正規化・v0.22.0修正) ==========

function DivisionFlow({ divisions }: { divisions: { id: string; name: string; label: string; color: string; revenue: number; expense: number; profit: number; monthlyProfit: number[] }[] }) {
  // session77 Phase 1 軸4: バー幅トランジション reduceMotion ガード
  const reduceMotion = useReducedMotion();
  const totalRev = divisions.reduce((s, d) => s + d.revenue, 0);
  const totalExp = divisions.reduce((s, d) => s + d.expense, 0);
  const totalProfit = totalRev - totalExp;

  // v0.22.0 修正: バー基準を「全事業の最大値(売上経費含む)」で統一
  // 旧: 売上バー=売上構成比 / 経費バー=経費構成比 → SUPだけだと両方100%で同長
  // 新: 共通の最大値で正規化 → 経費が小さければ赤バーが短く出る
  const maxValue = Math.max(...divisions.flatMap(d => [d.revenue, d.expense]), 1);
  const sorted = [...divisions].sort((a, b) => b.revenue - a.revenue);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '36px 32px' }}>
      <div style={{ display: 'flex', gap: 48, marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${C.lineSoft}`, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: T.t7, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8 }}>合計売上</p>
          <p style={{ fontFamily: F.num, fontSize: T.t3, color: C.gold, fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>{yenShort(totalRev)}</p>
        </div>
        <div>
          <p style={{ fontSize: T.t7, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8 }}>合計経費</p>
          <p style={{ fontFamily: F.num, fontSize: T.t3, color: C.crimson, fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>{yenShort(totalExp)}</p>
        </div>
        <div>
          <p style={{ fontSize: T.t7, letterSpacing: '0.25em', color: C.textMute, marginBottom: 8 }}>合計利益</p>
          <p style={{
            fontFamily: F.num,
            fontSize: T.t3,
            color: totalProfit >= 0 ? C.green : C.crimson,
            fontWeight: 500,
            fontFeatureSettings: "'tnum' 1",
          }}>{yenShort(totalProfit)}</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {sorted.map(d => {
          const revPct = (d.revenue / maxValue) * 100;
          const expPct = (d.expense / maxValue) * 100;
          const profitColor = d.profit >= 0 ? C.green : C.crimson;
          return (
            <div key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 10, height: 10, background: C.gold, display: 'inline-block' }} />
                  <span style={{ fontFamily: F.num, fontSize: T.t5, color: C.text, letterSpacing: '0.05em', fontWeight: 500 }}>{d.name.toUpperCase()}</span>
                  <span style={{ fontFamily: F.jp, fontSize: T.t5, color: C.textSub }}>{d.label}</span>
                </div>
                <span style={{ fontFamily: F.num, fontSize: T.t4, color: profitColor, fontWeight: 500, fontFeatureSettings: "'tnum' 1" }}>
                  {yenShort(d.profit)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 5 }}>
                <span style={{ width: 40, fontSize: T.t7, color: C.textMute, letterSpacing: '0.1em' }}>売上</span>
                <div style={{ flex: 1, height: 5, background: C.lineSoft, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${revPct}%`, background: C.gold, transition: reduceMotion ? 'none' : 'width 320ms ease-out' }} />
                </div>
                <span style={{ width: 96, textAlign: 'right', fontFamily: F.num, fontSize: T.t6, color: C.textSub, fontFeatureSettings: "'tnum' 1" }}>
                  {yenShort(d.revenue)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 40, fontSize: T.t7, color: C.textMute, letterSpacing: '0.1em' }}>経費</span>
                <div style={{ flex: 1, height: 5, background: C.lineSoft, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${expPct}%`, background: C.crimson, transition: reduceMotion ? 'none' : 'width 320ms ease-out' }} />
                </div>
                <span style={{ width: 96, textAlign: 'right', fontFamily: F.num, fontSize: T.t6, color: C.textSub, fontFeatureSettings: "'tnum' 1" }}>
                  {yenShort(d.expense)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* session77 Phase 1 B5: Small Multiples 部門別月次推移群(Tufte) */}
      {sorted.some(d => d.monthlyProfit && d.monthlyProfit.some(v => v !== 0)) && (
        <div style={{ marginTop: 36, paddingTop: 28, borderTop: `1px solid ${C.lineSoft}` }}>
          <p style={{ fontSize: T.t7, letterSpacing: '0.3em', color: C.textMute, marginBottom: 18, textTransform: 'uppercase', fontWeight: 500 }}>
            Monthly Profit Trends · 月次利益推移
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(sorted.length, 5)}, 1fr)`,
            gap: 20,
          }}>
            {sorted.map(d => {
              const profitColor = d.profit >= 0 ? C.green : C.crimson;
              return (
                <div key={`sm-${d.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontFamily: F.num, fontSize: T.t7, color: C.textSub, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                    {d.name}
                  </span>
                  <SmallMultiple data={d.monthlyProfit} color={profitColor} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KamokuBars({ items, total }: { items: { kamoku: string; name: string; amount: number }[]; total: number }) {
  // session77 Phase 1 軸4: バー transition reduceMotion ガード
  const reduceMotion = useReducedMotion();
  if (items.length === 0) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: T.t6, color: C.textMute }}>経費データがありません</p>
      </div>
    );
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '36px 32px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {items.map((item, i) => {
          const pct = total > 0 ? (item.amount / total) * 100 : 0;
          return (
            <div key={item.kamoku}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontFamily: F.num, fontSize: T.t7, color: C.textMute, letterSpacing: '0.18em', minWidth: 28 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontFamily: F.jp, fontSize: T.t5, color: C.text }}>{item.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                  <span style={{ fontFamily: F.num, fontSize: T.t6, color: C.textMute, fontFeatureSettings: "'tnum' 1" }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span style={{ fontFamily: F.num, fontSize: T.t4, color: C.text, fontFeatureSettings: "'tnum' 1", minWidth: 96, textAlign: 'right' }}>
                    {yenShort(item.amount)}
                  </span>
                </div>
              </div>
              <div style={{ height: 4, background: C.lineSoft, position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: C.crimson,
                  opacity: 0.75,
                  transition: reduceMotion ? 'none' : 'width 320ms ease-out',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== Sparkline(Tufte Beautiful Evidence・月次推移ミニグラフ) ==========
// session77 Phase 1 B4 / 軸5
// 仕様:幅 100px・高さ 18px・凡例なし・最大値 = データの絶対値最大
// 判定:Edward Tufte(必須監督)/ Maureen Stone(色覚)/ Sara Soueidan(SVG実装)
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return null;
  const w = 100;
  const h = 18;
  const max = Math.max(...data.map(Math.abs), 1);
  // 中央線を 0 として上下に描く(利益はゼロ基準で正負を見せる)
  const midY = h / 2;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = midY - (v / max) * (midY - 1);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block' }}
      role="img"
      aria-label="月次利益推移"
    >
      {/* ゼロ基準線 */}
      <line x1={0} y1={midY} x2={w} y2={midY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* 推移線 */}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        points={points}
      />
    </svg>
  );
}

// ========== SmallMultiple(Tufte / 部門別月次推移・並列比較) ==========
// session77 Phase 1 B5 / 軸5
// 仕様:幅 100% (auto fit)・高さ 40px・ゼロ基準線・縦軸は全部門共通スケール無し(各々独立)
// 並列で複数表示することで「形」の比較を可能にする = Small Multiples
// 判定:Edward Tufte(必須監督)/ Ralph Kimball / Maureen Stone
function SmallMultiple({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length === 0) return null;
  const w = 120;
  const h = 40;
  const max = Math.max(...data.map(Math.abs), 1);
  const midY = h / 2;
  const padX = 2;
  const innerW = w - padX * 2;
  const points = data.map((v, i) => {
    const x = padX + (i / (data.length - 1)) * innerW;
    const y = midY - (v / max) * (midY - 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  // 面塗り用パス(ゼロ基準線まで閉じる)
  const areaPath = `M ${points[0]} L ${points.slice(1).join(' L ')} L ${padX + innerW},${midY} L ${padX},${midY} Z`;
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      role="img"
      aria-label="部門別月次利益推移"
    >
      {/* ゼロ基準線 */}
      <line x1={0} y1={midY} x2={w} y2={midY} stroke="rgba(255,255,255,0.10)" strokeWidth="0.5" />
      {/* 面塗り(薄い透過) */}
      <path d={areaPath} fill={color} opacity="0.18" />
      {/* 推移線 */}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        points={points.join(' ')}
      />
    </svg>
  );
}

// ========== PJ別利益率テーブル(PC前提・カラム幅広く・v0.22.0修正) ==========

function ProjectTable({ items }: { items: { id: string; name: string; division: string; revenue: number; expense: number; profit: number; rate: number; monthlyProfit: number[] }[] }) {
  // session77 Phase 1 軸4: バー transition reduceMotion ガード
  const reduceMotion = useReducedMotion();
  if (items.length === 0) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: T.t6, color: C.textMute }}>プロジェクト別データがありません</p>
      </div>
    );
  }

  // PC/タブレット幅(>=768px)前提・カラム幅をゆったり
  // session77 Phase 1 B4: Sparkline カラム(100px)を PJ 名の右に追加
  const cols = '40px 1.4fr 100px 130px 130px 130px 160px';

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: cols,
        gap: 16,
        padding: '18px 32px',
        borderBottom: `1px solid ${C.line}`,
        fontSize: T.t7,
        letterSpacing: '0.25em',
        color: C.textMute,
        textTransform: 'uppercase',
        fontWeight: 500,
      }}>
        <span></span>
        <span>プロジェクト</span>
        <span>推移</span>
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
              gridTemplateColumns: cols,
              gap: 16,
              padding: '20px 32px',
              borderBottom: `1px solid ${C.lineSoft}`,
              alignItems: 'center',
            }}
          >
            <span style={{ width: 10, height: 10, background: dotColor, display: 'inline-block', alignSelf: 'center' }} />
            <span style={{ fontFamily: F.jp, fontSize: T.t5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            <Sparkline data={p.monthlyProfit} color={barColor} />
            <span style={{ fontFamily: F.num, fontSize: T.t5, color: C.textSub, textAlign: 'right', fontFeatureSettings: "'tnum' 1" }}>
              {yenShort(p.revenue)}
            </span>
            <span style={{ fontFamily: F.num, fontSize: T.t5, color: C.textSub, textAlign: 'right', fontFeatureSettings: "'tnum' 1" }}>
              {yenShort(p.expense)}
            </span>
            <span style={{ fontFamily: F.num, fontSize: T.t4, color: barColor, textAlign: 'right', fontFeatureSettings: "'tnum' 1", fontWeight: 500 }}>
              {yenShort(p.profit)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 4, background: C.lineSoft, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barWidth}%`, background: barColor, transition: reduceMotion ? 'none' : 'width 320ms ease-out' }} />
              </div>
              <span style={{ fontFamily: F.num, fontSize: T.t6, color: barColor, fontFeatureSettings: "'tnum' 1", minWidth: 44, textAlign: 'right' }}>
                {p.rate.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
