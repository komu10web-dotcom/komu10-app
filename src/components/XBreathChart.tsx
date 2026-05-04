'use client';

/**
 * XBreathChart — komu10 X 呼吸チャート(s87 ボス確定仕様・v0.42.1 完全再実装)
 *
 * 失敗事例 #58 是正(s88 認定):
 *   v0.42.0 の独断構造変更を破棄し、v1.0 デザイン HTML(File ID 1geEZy0izYmB49aN8I9iSWTr12hi1HAAO)の
 *   SVG コードを1対1で React 移植。座標・stroke 値・viewBox・終端金額ラベル位置すべて元 v1.0 そのまま。
 *
 * 元 SVG の設計(変更不可・触るな資産):
 *   viewBox: 0 0 400 420
 *   YT   上左 (100, 80)  → (184, 164)  stroke 14
 *   EDIT 上右 (300, 80)  → (216, 164)  stroke  6
 *   TP   下左 (100, 320) → (184, 236)  stroke  9
 *   SUP  下右 (300, 320) → (216, 236)  stroke 11
 *   center: cx=200 cy=200 r=3 fill=#b8893a
 *
 * 起案: イナモトレイ(CBPO) / 演出: Es Devlin(CAD) / 色彩: Maureen Stone
 * 統治: Hedi(CEO) / Saville(CBO) / Paula Scher(CDO) / Jony Ive(CXO)
 * 実装: Patrick Collison(s88 v0.42.1 / 2026-05-04)
 */

import { useState, useEffect, useMemo } from 'react';
import { APP_DARK, FONTS, X_BRAND } from '@/lib/brandTokens';
import { useReducedMotion } from '@/lib/useReducedMotion';

const C = APP_DARK;
const F = FONTS;

type Division = {
  id: string;
  name: string;
  label: string;
  revenue: number;
  expense: number;
  profit: number;
};

type Mode = 'revenue' | 'profit';

// 元 v1.0 デザインの座標(変更禁止・viewBox 400x420)
const LINE_COORDS = {
  upLeft:  { x1: 100, y1: 80,  x2: 184, y2: 164 },
  upRight: { x1: 300, y1: 80,  x2: 216, y2: 164 },
  downLeft:  { x1: 100, y1: 320, x2: 184, y2: 236 },
  downRight: { x1: 300, y1: 320, x2: 216, y2: 236 },
} as const;

const LABEL_POS = {
  upLeft:  { x: 20,  y: 34, yMoney: 60, anchor: 'start' as const },
  upRight: { x: 380, y: 34, yMoney: 60, anchor: 'end'   as const },
  downLeft:  { x: 20,  y: 370, yMoney: 392, anchor: 'start' as const },
  downRight: { x: 380, y: 370, yMoney: 392, anchor: 'end'   as const },
} as const;

const QUADRANT_BY_INDEX: Array<keyof typeof LINE_COORDS> = ['upLeft', 'upRight', 'downLeft', 'downRight'];

export default function XBreathChart({ divisions }: { divisions: Division[] }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>('revenue');
  const [isVisible, setIsVisible] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('komu10-xchart-mode');
      if (saved === 'revenue' || saved === 'profit') setMode(saved);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => setIsVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const sorted = useMemo(() => {
    return [...divisions].sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  }, [divisions]);

  const valueOf = (d: Division) => mode === 'revenue' ? d.revenue : d.profit;

  const maxRevenue = Math.max(...sorted.map(d => d.revenue), 1);
  const strokeOf = (d: Division) => 6 + (d.revenue / maxRevenue) * 8; // 6〜14px(元v1.0準拠)

  const colorOf = (d: Division, idx: number): string => {
    if (mode === 'revenue') {
      return idx === 0 ? X_BRAND.gold : X_BRAND.white;
    } else {
      if (d.profit < 0) return X_BRAND.red;
      const profitTopIdx = sorted
        .map((sd, i) => ({ profit: sd.profit, i }))
        .filter(x => x.profit >= 0)
        .sort((a, b) => b.profit - a.profit)[0]?.i;
      return idx === profitTopIdx ? X_BRAND.gold : X_BRAND.white;
    }
  };

  const handleModeSwitch = (next: Mode) => {
    if (next === mode || isTransitioning) return;
    setIsTransitioning(true);
    try { window.localStorage.setItem('komu10-xchart-mode', next); } catch { /* ignore */ }
    setTimeout(() => setMode(next), 300);
    setTimeout(() => setIsTransitioning(false), 800);
  };

  const breathing = !reduceMotion && isVisible && !isTransitioning;

  const totalValue = sorted.reduce((s, d) => s + valueOf(d), 0);
  const yenShortM = (n: number): string => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${sign}¥${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}¥${(abs / 1000).toFixed(0)}K`;
    return `${sign}¥${abs}`;
  };
  const yenShort = (n: number): string => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 100000000) return `${sign}¥${(abs / 100000000).toFixed(1)}億`;
    if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(0)}万`;
    return `${sign}¥${abs.toLocaleString()}`;
  };

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, padding: '36px 32px' }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        gap: 24, marginBottom: 28, paddingBottom: 20,
        borderBottom: `1px solid ${C.lineSoft}`, flexWrap: 'wrap',
      }}>
        <div role="tablist" aria-label="表示モード切替" style={{ display: 'flex', gap: 0, position: 'relative' }}>
          {(['revenue', 'profit'] as Mode[]).map((m) => {
            const active = mode === m;
            const label = m === 'revenue' ? 'REVENUE' : 'PROFIT';
            const labelJp = m === 'revenue' ? '売上' : '利益';
            return (
              <button
                key={m} role="tab" aria-selected={active}
                onClick={() => handleModeSwitch(m)} disabled={isTransitioning}
                style={{
                  background: 'transparent', border: 'none',
                  padding: '12px 20px', minHeight: 44,
                  cursor: isTransitioning ? 'wait' : 'pointer',
                  position: 'relative',
                  fontFamily: F.display, fontWeight: 900, fontSize: 22,
                  letterSpacing: '0.08em',
                  color: active ? C.text : C.textMute,
                  transition: reduceMotion ? 'none' : 'color 280ms ease-out',
                }}
              >
                <span style={{ display: 'block', lineHeight: 1 }}>{label}</span>
                <span style={{
                  display: 'block', fontFamily: F.uiJp,
                  fontSize: 10, fontWeight: 400, letterSpacing: '0.2em',
                  color: active ? C.textSub : C.textMute, marginTop: 4,
                }}>{labelJp}</span>
                {active && (
                  <span aria-hidden style={{
                    position: 'absolute', left: 12, right: 12, bottom: -1,
                    height: 1, background: X_BRAND.gold,
                    transition: reduceMotion ? 'none' : 'all 280ms ease-out',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ textAlign: 'right' }}>
          <p style={{
            fontSize: 10, letterSpacing: '0.3em', color: C.textMute,
            marginBottom: 6, textTransform: 'uppercase', fontWeight: 500,
          }}>{mode === 'revenue' ? 'TOTAL REVENUE' : 'TOTAL PROFIT'}</p>
          <p style={{
            fontFamily: F.display, fontWeight: 900, fontSize: 44,
            color: mode === 'profit' && totalValue < 0 ? X_BRAND.red : C.text,
            lineHeight: 1, fontFeatureSettings: "'tnum' 1, 'lnum' 1",
            letterSpacing: '-0.01em',
          }}>{yenShort(totalValue)}</p>
        </div>
      </div>

      {/* X 呼吸チャート本体(SVG は元 v1.0 を完全コピー) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 480px) 1fr',
        gap: 40, alignItems: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
          <svg
            viewBox="0 0 400 420"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              width: '100%', height: 'auto', display: 'block',
              opacity: isTransitioning ? 0 : 1,
              transition: reduceMotion ? 'none' : `opacity 300ms ease-${isTransitioning ? 'in' : 'out'}`,
            }}
            role="img"
            aria-label={`事業部別${mode === 'revenue' ? '売上' : '利益'}チャート(X 呼吸)`}
          >
            {sorted.map((d, idx) => {
              const quadrantKey = QUADRANT_BY_INDEX[idx];
              const coords = LINE_COORDS[quadrantKey];
              const labelPos = LABEL_POS[quadrantKey];
              const stroke = strokeOf(d);
              const color = colorOf(d, idx);
              const value = valueOf(d);

              return (
                <g key={d.id} className="x-line-group">
                  <text
                    x={labelPos.x} y={labelPos.y}
                    textAnchor={labelPos.anchor}
                    fontFamily="'Saira Condensed', sans-serif"
                    fontSize={13} fill={C.textMute}
                    letterSpacing="0.2em"
                  >{d.name}</text>
                  <text
                    x={labelPos.x} y={labelPos.yMoney}
                    textAnchor={labelPos.anchor}
                    fontFamily="'Big Shoulders Display', sans-serif"
                    fontWeight={900} fontSize={26} fill={color}
                    style={{ transition: reduceMotion ? 'none' : 'fill 320ms ease-out' }}
                  >{yenShortM(value)}</text>
                  <line
                    x1={coords.x1} y1={coords.y1}
                    x2={coords.x2} y2={coords.y2}
                    stroke={color} strokeWidth={stroke}
                    strokeLinecap="butt" pathLength={100}
                    className={breathing ? 'x-breath-line' : ''}
                    style={{
                      transition: reduceMotion ? 'none' : 'stroke-width 320ms ease-out, stroke 320ms ease-out',
                    }}
                  />
                </g>
              );
            })}
            <circle
              cx={200} cy={200} r={3}
              fill={X_BRAND.gold}
              className={breathing ? 'x-breath-center' : ''}
            />
          </svg>

          <style jsx>{`
            @keyframes xBreathLine {
              0%, 100% { stroke-width: var(--base-stroke, 10); }
              50% { stroke-width: calc(var(--base-stroke, 10) * 1.06); }
            }
            @keyframes xBreathCenter {
              0%, 100% { opacity: 1.0; }
              50% { opacity: 0.4; }
            }
            .x-breath-line { animation: xBreathLine 3s ease-in-out infinite; }
            .x-breath-center { animation: xBreathCenter 3s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) {
              .x-breath-line, .x-breath-center { animation: none !important; }
            }
          `}</style>
        </div>

        {/* 凡例 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sorted.map((d, idx) => {
            const color = colorOf(d, idx);
            const value = valueOf(d);
            const stroke = strokeOf(d);
            const isHighlight = color === X_BRAND.gold || color === X_BRAND.red;
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                paddingBottom: 12, borderBottom: `1px solid ${C.lineSoft}`,
              }}>
                <span style={{
                  display: 'inline-block', width: 28,
                  height: Math.max(2, stroke / 3),
                  background: color, flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: F.brico, fontSize: 12,
                    letterSpacing: '0.18em',
                    color: isHighlight ? color : C.text,
                    textTransform: 'uppercase', fontWeight: 600,
                    marginBottom: 2,
                  }}>{d.name}</p>
                  <p style={{
                    fontFamily: F.uiJp, fontSize: 11,
                    color: C.textMute, letterSpacing: '0.04em',
                  }}>{d.label}</p>
                </div>
                <p style={{
                  fontFamily: F.display, fontWeight: 900, fontSize: 22,
                  color: isHighlight ? color : C.text,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                  letterSpacing: '-0.01em',
                }}>{yenShort(value)}</p>
              </div>
            );
          })}

          <p style={{
            fontFamily: F.uiJp, fontSize: 11, color: C.textMute,
            letterSpacing: '0.06em', lineHeight: 1.6, marginTop: 8,
          }}>
            線の太さは売上の大きさ。色は{mode === 'revenue' ? '売上トップ部門' : '利益トップ部門と赤字部門'}を示す。
          </p>
        </div>
      </div>
    </div>
  );
}
