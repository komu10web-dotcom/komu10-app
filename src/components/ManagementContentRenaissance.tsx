'use client';

/**
 * ManagementContentRenaissance.tsx
 *
 * komu10 経営ダッシュボード — δ案 Renaissance 実装
 *
 * Phase 1 (本ファイル):
 *   - δ案ネイティブのヘッダー(VOLUME表記+詩的タイトル)
 *   - KPIストリップ(売上/原価/利益/利益率) Saira Condensed主役
 *   - PL月次チャート(暗色基調)
 *
 * Phase 2 (次セッション以降):
 *   - サンキー図(事業 → 勘定科目 → 内訳)
 *
 * Phase 3 (次セッション以降):
 *   - 勘定科目別カード
 *   - プロジェクト別利益率テーブル
 *   - CF/資金ビュー
 *
 * 設計原則:
 *   - 配色: 黒(#0a0a0b) / 白 / 金黄(#D4A03A) / 緑(#1B4D3E) / 赤(#C23728) のみ
 *   - フォント: Saira Condensed(数字主役) / Shippori Mincho(和文タイトル) / Inter(本文)
 *   - 装飾: 影・グラデーション・絵文字 すべて禁止
 *   - 雑誌的構成: VOLUME表記 / 詩的タイトル / セクション番号
 *   - !important / CSS上書き禁止 — JSX直書きスタイルで完結
 *
 * ブランド統括: Hedi Slimane / AD: Raf Simons / 窓口: David Sims
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import type { Transaction } from '@/types/database';
import { Loader2 } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';

// ========== デザイントークン ==========

const C = {
  bg: '#0a0a0b',          // 純黒に近いベース
  surface: '#131316',     // カード背景(ベースよりわずかに明るい)
  line: 'rgba(255,255,255,0.08)',
  lineSoft: 'rgba(255,255,255,0.04)',
  text: 'rgba(255,255,255,0.92)',
  textSub: 'rgba(255,255,255,0.55)',
  textMute: 'rgba(255,255,255,0.32)',
  gold: '#D4A03A',        // 主要数値・選択中
  green: '#1B4D3E',       // 健全・正
  crimson: '#C23728',     // 警告・負
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
  if (Math.abs(n) >= 100000000) return `¥${(n / 100000000).toFixed(1)}億`;
  if (Math.abs(n) >= 10000000) return `¥${(n / 10000000).toFixed(0)}千万`;
  if (Math.abs(n) >= 1000000) return `¥${(n / 10000).toFixed(0)}万`;
  if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString()}`;
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

// ========== コンポーネント ==========

export default function ManagementContentRenaissance() {
  const { owner, startDate, endDate, year } = usePeriodRange();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartYearTx, setChartYearTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pl' | 'cf' | 'fund'>('pl');

  // ========== データ取得 ==========

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // 期間バー範囲のトランザクション
      let txQ = supabase.from('transactions').select('*')
        .gte('date', startDate).lt('date', endDate);
      if (owner !== 'all') txQ = txQ.eq('owner', owner);
      const { data: txData } = await txQ;
      const txList = (txData as Transaction[]) || [];
      setTransactions(txList);

      // チャート用: 当年全件
      if (startDate !== `${year}-01-01` || endDate !== `${parseInt(year) + 1}-01-01`) {
        let cyQ = supabase.from('transactions').select('date, amount, tx_type, status')
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

  // ========== KPI計算 ==========

  const revenueTotal = transactions
    .filter(t => t.tx_type === 'revenue')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const expenseTotal = transactions
    .filter(t => t.tx_type === 'expense')
    .reduce((s, t) => s + (t.amount || 0), 0);

  const profitTotal = revenueTotal - expenseTotal;

  const profitRate = revenueTotal > 0
    ? (profitTotal / revenueTotal) * 100
    : 0;

  // ========== 月次集計 ==========

  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const monthTx = chartYearTx.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() + 1 === m;
    });
    const rev = monthTx.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + (t.amount || 0), 0);
    const exp = monthTx.filter(t => t.tx_type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    return { month: m, rev, exp, profit: rev - exp };
  });

  // ========== UI ==========

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 style={{ width: 20, height: 20, color: C.gold }} className="animate-spin" />
      </div>
    );
  }

  // 詩的タイトル(viewModeで切替)
  const poeticTitle =
    viewMode === 'pl' ? 'いま、儲かっているのか。' :
    viewMode === 'cf' ? 'いま、お金は足りているのか。' :
    'お金の動き、すべてを記録する。';

  const sectionLabel =
    viewMode === 'pl' ? '損益 — Profit & Loss' :
    viewMode === 'cf' ? 'キャッシュフロー — Cash Flow' :
    '資金移動 — Fund Transfer';

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: F.body }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* ===== ヘッダー(雑誌的) ===== */}
        <header style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 28, marginBottom: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              {/* Volume表記 */}
              <p style={{
                fontFamily: F.num,
                fontSize: 11,
                letterSpacing: '0.3em',
                color: C.gold,
                marginBottom: 14,
                fontWeight: 500,
              }}>
                VOLUME 04 · MANAGEMENT
              </p>
              {/* 詩的タイトル */}
              <h1 style={{
                fontFamily: F.jp,
                fontSize: 30,
                fontWeight: 400,
                color: C.text,
                lineHeight: 1.4,
                letterSpacing: '0.02em',
                marginBottom: 10,
              }}>
                {poeticTitle}
              </h1>
              {/* セクション英訳 */}
              <p style={{
                fontSize: 11,
                color: C.textMute,
                letterSpacing: '0.15em',
                fontWeight: 300,
              }}>
                {sectionLabel}
              </p>
            </div>

            {/* PL/CF/資金 セグメント切替(δ案版) */}
            <nav style={{
              display: 'flex',
              gap: 0,
              border: `1px solid ${C.line}`,
              padding: 0,
            }}>
              {([
                { v: 'pl', label: 'PL' },
                { v: 'cf', label: 'CF' },
                { v: 'fund', label: '資金' },
              ] as const).map((tab, i) => (
                <button
                  key={tab.v}
                  onClick={() => setViewMode(tab.v)}
                  style={{
                    padding: '10px 18px',
                    fontSize: 11,
                    fontFamily: F.body,
                    fontWeight: 500,
                    letterSpacing: '0.1em',
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

        {/* ===== Section 01 — KPIストリップ ===== */}
        <section style={{ marginBottom: 56 }}>
          {/* セクション番号+タイトル */}
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{
              fontFamily: F.num,
              fontSize: 12,
              color: C.gold,
              letterSpacing: '0.2em',
              fontWeight: 500,
            }}>— 01</span>
            <span style={{
              fontFamily: F.jp,
              fontSize: 14,
              color: C.textSub,
              letterSpacing: '0.05em',
            }}>
              {year}年の手応え
            </span>
          </div>

          {/* KPI 4カラム */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 0,
            border: `1px solid ${C.line}`,
          }}>
            {[
              { label: '売上', value: revenueTotal, color: C.gold, sign: '' },
              { label: '経費', value: expenseTotal, color: C.crimson, sign: '' },
              { label: '利益', value: profitTotal, color: profitTotal >= 0 ? C.green : C.crimson, sign: '' },
              { label: '利益率', value: profitRate, color: profitRate >= 0 ? C.green : C.crimson, sign: '%', isRate: true },
            ].map((kpi, i) => (
              <div
                key={kpi.label}
                style={{
                  padding: '28px 24px',
                  borderLeft: i > 0 ? `1px solid ${C.line}` : 'none',
                  background: C.surface,
                }}
              >
                <p style={{
                  fontSize: 10,
                  letterSpacing: '0.25em',
                  color: C.textMute,
                  marginBottom: 14,
                  textTransform: 'uppercase',
                  fontWeight: 500,
                }}>
                  {kpi.label}
                </p>
                <p style={{
                  fontFamily: F.num,
                  fontSize: 38,
                  fontWeight: 400,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  color: kpi.color,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                }}>
                  {kpi.isRate
                    ? `${kpi.value.toFixed(1)}${kpi.sign}`
                    : yenShort(kpi.value)
                  }
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Section 02 — 月次推移 ===== */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{
              fontFamily: F.num,
              fontSize: 12,
              color: C.gold,
              letterSpacing: '0.2em',
              fontWeight: 500,
            }}>— 02</span>
            <span style={{
              fontFamily: F.jp,
              fontSize: 14,
              color: C.textSub,
              letterSpacing: '0.05em',
            }}>
              {year}年の月別、お金の流れ
            </span>
          </div>

          <MonthlyChart data={monthlyData} />
        </section>

        {/* ===== Phase 2/3 placeholder ===== */}
        <section style={{
          padding: '40px 32px',
          border: `1px solid ${C.line}`,
          background: C.surface,
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: F.num,
            fontSize: 11,
            letterSpacing: '0.25em',
            color: C.gold,
            marginBottom: 12,
          }}>— COMING SOON</p>
          <p style={{
            fontFamily: F.jp,
            fontSize: 16,
            color: C.textSub,
            marginBottom: 8,
          }}>
            お金は、どこに流れていったのか。
          </p>
          <p style={{
            fontSize: 11,
            color: C.textMute,
            letterSpacing: '0.05em',
          }}>
            サンキー図 · 勘定科目別 · プロジェクト別利益率
          </p>
        </section>

        {/* ===== フッター ===== */}
        <footer style={{
          marginTop: 64,
          paddingTop: 24,
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 10,
          color: C.textMute,
          letterSpacing: '0.1em',
        }}>
          <span style={{ fontFamily: F.num, fontWeight: 500 }}>
            komu<span style={{ color: C.gold }}>10</span>
          </span>
          <span style={{ fontFamily: F.num }}>
            MANAGEMENT · {year}
          </span>
        </footer>
      </div>
    </div>
  );
}

// ========== 月次推移チャート(δ案ネイティブ) ==========

interface MonthlyDataPoint {
  month: number;
  rev: number;
  exp: number;
  profit: number;
}

function MonthlyChart({ data }: { data: MonthlyDataPoint[] }) {
  const allValues = data.flatMap(d => [d.rev, d.exp]);
  const maxVal = Math.max(...allValues, 1);
  const ticks = calcAxisTicks(maxVal);
  const chartMax = ticks[ticks.length - 1] || 1;

  const chartHeight = 240;
  const yAxisWidth = 56;

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.line}`,
      padding: '28px 24px',
    }}>
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 10, letterSpacing: '0.15em', color: C.textSub }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, background: C.gold, display: 'inline-block' }} />
          売上
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, background: C.crimson, display: 'inline-block' }} />
          経費
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 10,
            height: 2,
            background: C.green,
            display: 'inline-block',
            transform: 'translateY(-3px)',
          }} />
          利益
        </span>
      </div>

      <div style={{ display: 'flex', height: chartHeight }}>
        {/* 縦軸 */}
        <div style={{
          width: yAxisWidth,
          flexShrink: 0,
          paddingRight: 8,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingBottom: 24,
        }}>
          {[...ticks].reverse().map((t, i) => (
            <span key={i} style={{
              fontFamily: F.num,
              fontSize: 9,
              color: C.textMute,
              textAlign: 'right',
              fontFeatureSettings: "'tnum' 1",
            }}>
              {yenShort(t)}
            </span>
          ))}
        </div>

        {/* グラフ領域 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* バーエリア */}
          <div style={{ flex: 1, position: 'relative' }}>
            {/* グリッドライン */}
            {ticks.map((t, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${(t / chartMax) * 100}%`,
                  borderTop: `1px solid ${C.lineSoft}`,
                }}
              />
            ))}

            {/* 月ごとのバー */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'flex-end',
            }}>
              {data.map(d => {
                const revH = (d.rev / chartMax) * 100;
                const expH = (d.exp / chartMax) * 100;
                return (
                  <div
                    key={d.month}
                    style={{
                      flex: 1,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-end',
                      gap: 2,
                      height: '100%',
                    }}
                  >
                    {/* 売上バー */}
                    <div
                      style={{
                        width: 8,
                        height: `${revH}%`,
                        background: C.gold,
                        opacity: d.rev > 0 ? 1 : 0,
                        transition: 'opacity 0.2s',
                      }}
                      title={`${d.month}月 売上 ${yen(d.rev)}`}
                    />
                    {/* 経費バー */}
                    <div
                      style={{
                        width: 8,
                        height: `${expH}%`,
                        background: C.crimson,
                        opacity: d.exp > 0 ? 1 : 0,
                        transition: 'opacity 0.2s',
                      }}
                      title={`${d.month}月 経費 ${yen(d.exp)}`}
                    />
                  </div>
                );
              })}
            </div>

            {/* 利益ライン(SVG) */}
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
            >
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

          {/* X軸ラベル */}
          <div style={{
            display: 'flex',
            paddingTop: 8,
            height: 24,
          }}>
            {data.map(d => (
              <div
                key={d.month}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontFamily: F.num,
                  fontSize: 10,
                  color: C.textMute,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {d.month}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
