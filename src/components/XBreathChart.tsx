'use client';

/**
 * XBreathChart — komu10 X 呼吸チャート v0.44.0
 *
 * 指示書: komu10-app-XBreathChart-jisshi-shijisho-v1_0-s88-20260504.md
 * v1.0 プレゼン版 HTML §FRAME 02 を1対1で React 化。
 * デザイン判断・センス判断は一切行っていない。SVG コードの完全移植のみ。
 *
 * 触らない資産(変更禁止):
 *   viewBox: 0 0 400 420
 *   YT   上左 (100, 80)  → (184, 164)
 *   EDIT 上右 (300, 80)  → (216, 164)
 *   TP   下左 (100, 320) → (184, 236)
 *   SUP  下右 (300, 320) → (216, 236)
 *   center: cx=200 cy=200 r=3 fill=#b8893a
 *   呼吸: 2.4秒 ±15%  CSS変数(--breathe-min/max)で動的
 *   dept label fill: #9B9B9B
 *
 * 実装: Patrick Collison(s88 v0.44.0 / 2026-05-04)
 * 変更点(v0.43.0→v0.44.0):
 *   - 呼吸 keyframes を固定値から CSS変数(--breathe-min/max)に変更
 *   - dept label fill を rgba(255,255,255,0.32) → #9B9B9B に修正(v1.0準拠)
 *   - 単一 x-breathe-line keyframe で全部門を統一処理
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from '@/lib/useReducedMotion';

type Department = 'YT' | 'EDIT' | 'TP' | 'SUP';

type DepartmentData = {
  revenue: number;
  profit: number;
};

type XBreathChartProps = {
  departments: Record<Department, DepartmentData>;
  initialMode?: 'revenue' | 'profit';
  totalRevenue: number;
  totalProfit: number;
};

// v1.0 SVG 座標(変更禁止)
const DEPT_CONFIG: Record<Department, {
  x1: number; y1: number; x2: number; y2: number;
  labelX: number; labelY: number;
  moneyY: number;
  anchor: 'start' | 'end';
}> = {
  YT:   { x1: 100, y1: 80,  x2: 184, y2: 164, labelX: 20,  labelY: 34,  moneyY: 60,  anchor: 'start' },
  EDIT: { x1: 300, y1: 80,  x2: 216, y2: 164, labelX: 380, labelY: 34,  moneyY: 60,  anchor: 'end'   },
  TP:   { x1: 100, y1: 320, x2: 184, y2: 236, labelX: 20,  labelY: 370, moneyY: 392, anchor: 'start' },
  SUP:  { x1: 300, y1: 320, x2: 216, y2: 236, labelX: 380, labelY: 370, moneyY: 392, anchor: 'end'   },
};

const DEPT_ORDER: Department[] = ['YT', 'EDIT', 'TP', 'SUP'];
const MAX_WIDTH = 14;
const MIN_WIDTH = 4;
const ZERO_WIDTH = 4;

function calcWidth(value: number, allValues: number[]): number {
  const maxAbs = Math.max(...allValues.map(Math.abs));
  if (maxAbs === 0) return ZERO_WIDTH;
  if (value === 0) return ZERO_WIDTH;
  const ratio = Math.abs(value) / maxAbs;
  return MIN_WIDTH + ratio * (MAX_WIDTH - MIN_WIDTH);
}

function formatM(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${sign}¥${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}¥${(abs / 1_000).toFixed(0)}K`;
}

function getTopDept(departments: Record<Department, DepartmentData>, mode: 'revenue' | 'profit'): Department {
  return DEPT_ORDER.reduce((top, dept) => {
    const topVal = mode === 'revenue' ? departments[top].revenue : departments[top].profit;
    const deptVal = mode === 'revenue' ? departments[dept].revenue : departments[dept].profit;
    return deptVal > topVal ? dept : top;
  });
}

export default function XBreathChart({
  departments,
  initialMode = 'revenue',
  totalRevenue,
  totalProfit,
}: XBreathChartProps) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<'revenue' | 'profit'>(initialMode);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [breathingActive, setBreathingActive] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Page Visibility API
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => {
      if (document.hidden) setBreathingActive(false);
      else if (!isTransitioning) setBreathingActive(true);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [isTransitioning]);

  // IntersectionObserver
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !document.hidden) setBreathingActive(true);
      });
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // モード切替(800ms)
  const handleToggle = useCallback((newMode: 'revenue' | 'profit') => {
    if (newMode === mode || isTransitioning) return;
    setIsTransitioning(true);
    setBreathingActive(false);
    setTimeout(() => setMode(newMode), 350);
    setTimeout(() => {
      setIsTransitioning(false);
      if (!document.hidden) setBreathingActive(true);
    }, 800);
  }, [mode, isTransitioning]);

  const breathing = !reduceMotion && breathingActive && !isTransitioning;
  const allValues = DEPT_ORDER.map(dept =>
    mode === 'revenue' ? departments[dept].revenue : departments[dept].profit
  );
  const topDept = getTopDept(departments, mode);
  const totalValue = mode === 'revenue' ? totalRevenue : totalProfit;

  return (
    <div ref={wrapRef}>
      <style>{`
        /* 呼吸: CSS変数(--breathe-min / --breathe-max)で各線のリアル幅を参照 */
        @keyframes x-breathe-line {
          0%, 100% { stroke-width: var(--breathe-min); }
          50%       { stroke-width: var(--breathe-max); }
        }
        @keyframes x-breathe-center {
          0%, 100% { opacity: 1;    }
          50%       { opacity: 0.35; }
        }
        @keyframes x-collapse {
          from { stroke-dashoffset: 0;   }
          to   { stroke-dashoffset: 100; }
        }
        @keyframes x-redraw {
          from { stroke-dashoffset: 100; }
          to   { stroke-dashoffset: 0;   }
        }
        .xb-line-breathing {
          animation: x-breathe-line 2.4s ease-in-out infinite;
        }
        .xb-center-breathing {
          animation: x-breathe-center 2.4s ease-in-out infinite;
        }
        .xb-collapse {
          stroke-dasharray: 100;
          animation: x-collapse 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        .xb-redraw {
          stroke-dasharray: 100;
          animation: x-redraw 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .xb-line-breathing,
          .xb-center-breathing,
          .xb-collapse,
          .xb-redraw { animation: none !important; }
        }
        .xb-toggle-row {
          display: flex;
          gap: 0;
          margin-bottom: 20px;
        }
        .xb-btn {
          background: transparent;
          border: none;
          padding: 0 16px;
          min-height: 44px;
          min-width: 44px;
          cursor: pointer;
          font-family: 'Saira Condensed', sans-serif;
          font-size: 15px;
          letter-spacing: 0.15em;
          color: rgba(255, 255, 255, 0.38);
          position: relative;
          transition: color 280ms ease-out;
          text-transform: uppercase;
        }
        .xb-btn.active { color: rgba(255, 255, 255, 0.92); }
        .xb-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 12px;
          right: 12px;
          height: 1px;
          background: #b8893a;
        }
        .xb-btn:disabled { cursor: wait; }
        .xb-total {
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .xb-total-label {
          display: block;
          font-family: 'Saira Condensed', sans-serif;
          font-size: 11px;
          letter-spacing: 0.2em;
          color: rgba(255, 255, 255, 0.32);
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .xb-total-value {
          display: block;
          font-family: 'Big Shoulders Display', sans-serif;
          font-weight: 900;
          font-size: 32px;
          color: rgba(255, 255, 255, 0.92);
          line-height: 1;
          letter-spacing: -0.01em;
        }
        .xb-total-value.neg { color: #aa2a2a; }
        .xb-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          align-items: center;
        }
        .xb-svg-wrap {
          background: rgba(255, 255, 255, 0.02);
          padding: 32px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .xb-explainer h4 {
          font-family: 'Saira Condensed', sans-serif;
          font-size: 15px;
          letter-spacing: 0.08em;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 400;
          margin: 0 0 16px;
          line-height: 1.5;
        }
        .xb-explainer p {
          font-family: 'Noto Sans JP', sans-serif;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.38);
          line-height: 1.8;
          margin: 0 0 12px;
          letter-spacing: 0.04em;
        }
        @media (max-width: 768px) {
          .xb-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* トグル */}
      <div className="xb-toggle-row">
        {(['revenue', 'profit'] as const).map(m => (
          <button
            key={m}
            className={`xb-btn${mode === m ? ' active' : ''}`}
            onClick={() => handleToggle(m)}
            disabled={isTransitioning}
            aria-pressed={mode === m}
          >
            {m === 'revenue' ? '売上' : '利益'}
          </button>
        ))}
      </div>

      {/* TOTAL 合計 */}
      <div className="xb-total">
        <span className="xb-total-label">
          {mode === 'revenue' ? 'TOTAL REVENUE' : 'TOTAL PROFIT'}
        </span>
        <span className={`xb-total-value${mode === 'profit' && totalValue < 0 ? ' neg' : ''}`}>
          {formatM(totalValue)}
        </span>
      </div>

      {/* グリッド: SVG 左 | 説明 右 */}
      <div className="xb-grid">
        <div className="xb-svg-wrap">
          <svg
            viewBox="0 0 400 420"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label={`事業部別${mode === 'revenue' ? '売上' : '利益'} X 呼吸チャート`}
          >
            {DEPT_ORDER.map((dept) => {
              const cfg = DEPT_CONFIG[dept];
              const value = mode === 'revenue' ? departments[dept].revenue : departments[dept].profit;
              const w = calcWidth(value, allValues);
              const breatheMin = (w * 0.85).toFixed(2);
              const breatheMax = (w * 1.15).toFixed(2);

              let strokeColor: string;
              if (mode === 'profit' && value < 0) {
                strokeColor = '#aa2a2a';
              } else if (dept === topDept) {
                strokeColor = '#b8893a';
              } else {
                strokeColor = '#fafaf6';
              }

              // クラス: 呼吸 or トランジション
              let lineClass = '';
              if (isTransitioning) lineClass = 'xb-redraw';
              else if (breathing) lineClass = 'xb-line-breathing';

              return (
                <g key={dept} data-dept={dept}>
                  <line
                    x1={cfg.x1} y1={cfg.y1}
                    x2={cfg.x2} y2={cfg.y2}
                    stroke={strokeColor}
                    strokeWidth={w}
                    strokeLinecap="butt"
                    pathLength={100}
                    className={lineClass}
                    style={{
                      // CSS変数で呼吸幅をリアルデータ基準に設定
                      ['--breathe-min' as string]: breatheMin,
                      ['--breathe-max' as string]: breatheMax,
                      transition: reduceMotion
                        ? 'none'
                        : 'stroke 600ms ease-in-out, stroke-width 800ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  />
                  {/* dept label: v1.0準拠 fill=#9B9B9B */}
                  <text
                    x={cfg.labelX} y={cfg.labelY}
                    textAnchor={cfg.anchor}
                    fontFamily="'Saira Condensed', sans-serif"
                    fontSize={13}
                    fill="#9B9B9B"
                    letterSpacing="0.2em"
                  >{dept}</text>
                  {/* money: v1.0準拠 Big Shoulders 26px */}
                  <text
                    x={cfg.labelX} y={cfg.moneyY}
                    textAnchor={cfg.anchor}
                    fontFamily="'Big Shoulders Display', sans-serif"
                    fontWeight={900}
                    fontSize={26}
                    fill={mode === 'profit' && value < 0 ? '#aa2a2a' : '#fafaf6'}
                    style={{ transition: reduceMotion ? 'none' : 'fill 600ms ease-in-out' }}
                  >{formatM(value)}</text>
                </g>
              );
            })}

            {/* 中心点 = 間(ま): cx=200 cy=200 r=3 fill=#b8893a */}
            <circle
              cx={200} cy={200} r={3}
              fill="#b8893a"
              className={breathing ? 'xb-center-breathing' : ''}
            />
          </svg>
        </div>

        {/* 説明エリア(指示書§3.3準拠・金額一覧表示禁止・テキストのみ) */}
        <div className="xb-explainer">
          <h4>4本の線が<br />事業4部門の温度を語る</h4>
          <p>
            線の太さ = 各事業部門の今月収益。トップ部門のみ Xゴールド・他は白。
            中心の点 = 間(ま) = クライアントごとに毎回オリジナルが立ち上がる場所。
            これは X 原理(s86 確定)の直接実装。
          </p>
          <p>
            ↻ 呼吸演出(2.4秒周期):4本の線が同位相で呼吸(±15%・線太さが緩やかに伸縮)。
            中心点は逆位相(線が膨らむ瞬間に中心が縮む)。
            停止後の経営の温度を心臓のように示す。
          </p>
          <p>
            「売上 / 利益」トグルで切替時、800ms かけて X が再描画される。
            最終的な経営判断は利益額モードで下す。
          </p>
        </div>
      </div>
    </div>
  );
}
