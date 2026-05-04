'use client';

/**
 * XBreathChart — komu10 X 呼吸チャート(s87 ボス確定仕様)
 *
 * 設計裁定:
 *   - 起案: イナモトレイ(CBPO・Brand × Product 統合戦略)
 *   - 演出: Es Devlin(CAD・空間体験)
 *   - 色彩: Maureen Stone(色彩科学)
 *   - 統治: Hedi Slimane(CEO) / Saville(CBO) / Paula Scher(CDO) / Jony Ive(CXO)
 *   - 実装: Patrick Collison(s88 / 2026-05-04)
 *
 * 仕様(s87 確定・ハンドオフ §1.1〜§1.4 参照):
 *   - 線の位置(4象限) = 部門識別(上左 YT・上右 EDIT・下左 TP・下右 SUP)
 *   - 線の太さ        = 売上額(maxValue で正規化・最小12px〜最大28px)
 *   - 線の色          = 売上モード:トップ部門のみ Xゴールド・他白
 *                      利益モード:利益額トップのみ Xゴールド・赤字部門は赤
 *   - 中心点          = Xゴールド・呼吸(逆位相 opacity 1.0⇄0.4)
 *   - 呼吸演出        = 線太さ ±6%・周期3秒・4本同位相・中心は逆位相
 *   - トグル UI       = 売上/利益 切替・Ive 4条件(Xゴールドのアンダーライン1本のみ・44pt 以上)
 *   - 切替アニメ      = 800ms(収縮 0-300 / 書換 300-350 / 再描画 350-800)
 *   - prefers-reduced-motion: reduce → 完全停止
 *   - document.hidden                 → 停止(Page Visibility API)
 *
 * 失敗事例 #43 是正:過去確定 v1.0(線の太さ=売上・1色アクセント)を独断変更しない。
 * 失敗事例 #46 是正:既存 DivisionFlow を破壊せず・新規追加コンポーネントとして実装。
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { APP_DARK, FONTS, MONEYBOOK, X_BRAND } from '@/lib/brandTokens';
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

const QUADRANT = {
  // 4象限の終端座標(SVG viewBox 400x400・中心 200,200・各線の長さ約110)
  // 上左(180度〜270度方向) / 上右(270度〜360度) / 下左(90度〜180度) / 下右(0度〜90度)
  upLeft:  { x: 90,  y: 90  }, // 北西
  upRight: { x: 310, y: 90  }, // 北東
  downLeft:  { x: 90,  y: 310 }, // 南西
  downRight: { x: 310, y: 310 }, // 南東
} as const;

const QUADRANT_BY_INDEX: Array<keyof typeof QUADRANT> = ['upLeft', 'upRight', 'downLeft', 'downRight'];

export default function XBreathChart({ divisions }: { divisions: Division[] }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>('revenue');
  const [isVisible, setIsVisible] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const breathRef = useRef<SVGSVGElement | null>(null);

  // localStorage モード記憶(s87 確定仕様)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('komu10-xchart-mode');
      if (saved === 'revenue' || saved === 'profit') {
        setMode(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  // Page Visibility API: 背景タブで呼吸停止
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const update = () => setIsVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // 表示用データ整形(売上順ソート・上位4部門のみ表示)
  const sorted = useMemo(() => {
    return [...divisions]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4);
  }, [divisions]);

  // モード別の値抽出
  const valueOf = (d: Division) => mode === 'revenue' ? d.revenue : d.profit;

  // 線の太さ正規化(売上額ベース・モードに依らず売上を採用 = ボス確定 §1.1)
  const maxRevenue = Math.max(...sorted.map(d => d.revenue), 1);
  const strokeOf = (d: Division) => {
    const ratio = d.revenue / maxRevenue;
    return 12 + ratio * 16; // 12〜28px
  };

  // 色付けロジック(s87 確定 §1.1)
  const colorOf = (d: Division, idx: number): string => {
    if (mode === 'revenue') {
      // 売上モード:トップ部門のみ Xゴールド・他は白
      const isTop = idx === 0; // sorted は売上降順なので index 0 が売上トップ
      return isTop ? X_BRAND.gold : X_BRAND.white;
    } else {
      // 利益モード:赤字部門は赤・利益トップは Xゴールド・他は白
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
    try {
      window.localStorage.setItem('komu10-xchart-mode', next);
    } catch {
      // ignore
    }
    // Phase 1: 収縮 (0-300ms)
    // Phase 2: データ書換 (300-350ms)
    setTimeout(() => setMode(next), 300);
    // Phase 3: 再描画 (350-800ms) → 完了
    setTimeout(() => setIsTransitioning(false), 800);
  };

  // 呼吸アニメーション制御
  const breathing = !reduceMotion && isVisible && !isTransitioning;

  const totalValue = sorted.reduce((s, d) => s + valueOf(d), 0);
  const yenShort = (n: number): string => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 100000000) return `${sign}¥${(abs / 100000000).toFixed(1)}億`;
    if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(0)}万`;
    return `${sign}¥${abs.toLocaleString()}`;
  };

  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.line}`,
      padding: '36px 32px',
    }}>
      {/* ─────── 上部ヘッダー:トグル UI + 合計値 ─────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 24,
        marginBottom: 28,
        paddingBottom: 20,
        borderBottom: `1px solid ${C.lineSoft}`,
        flexWrap: 'wrap',
      }}>
        {/* トグル UI(Ive 4条件:Xゴールドのアンダーライン1本のみ・44pt 以上) */}
        <div role="tablist" aria-label="表示モード切替" style={{
          display: 'flex',
          gap: 0,
          position: 'relative',
        }}>
          {(['revenue', 'profit'] as Mode[]).map((m) => {
            const active = mode === m;
            const label = m === 'revenue' ? 'REVENUE' : 'PROFIT';
            const labelJp = m === 'revenue' ? '売上' : '利益';
            return (
              <button
                key={m}
                role="tab"
                aria-selected={active}
                onClick={() => handleModeSwitch(m)}
                disabled={isTransitioning}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '12px 20px', // 高さ44pt確保
                  minHeight: 44,
                  cursor: isTransitioning ? 'wait' : 'pointer',
                  position: 'relative',
                  fontFamily: F.display,
                  fontWeight: 900,
                  fontSize: 22,
                  letterSpacing: '0.08em',
                  color: active ? C.text : C.textMute,
                  transition: reduceMotion ? 'none' : 'color 280ms ease-out',
                }}
              >
                <span style={{ display: 'block', lineHeight: 1 }}>{label}</span>
                <span style={{
                  display: 'block',
                  fontFamily: F.uiJp,
                  fontSize: 10,
                  fontWeight: 400,
                  letterSpacing: '0.2em',
                  color: active ? C.textSub : C.textMute,
                  marginTop: 4,
                }}>{labelJp}</span>
                {active && (
                  <span aria-hidden style={{
                    position: 'absolute',
                    left: 12,
                    right: 12,
                    bottom: -1,
                    height: 1,
                    background: X_BRAND.gold,
                    transition: reduceMotion ? 'none' : 'all 280ms ease-out',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* 合計値表示(モード連動) */}
        <div style={{ textAlign: 'right' }}>
          <p style={{
            fontSize: 10,
            letterSpacing: '0.3em',
            color: C.textMute,
            marginBottom: 6,
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>{mode === 'revenue' ? 'TOTAL REVENUE' : 'TOTAL PROFIT'}</p>
          <p style={{
            fontFamily: F.display,
            fontWeight: 900,
            fontSize: 44,
            color: mode === 'profit' && totalValue < 0 ? X_BRAND.red : C.text,
            lineHeight: 1,
            fontFeatureSettings: "'tnum' 1, 'lnum' 1",
            letterSpacing: '-0.01em',
          }}>{yenShort(totalValue)}</p>
        </div>
      </div>

      {/* ─────── X 呼吸チャート本体 ─────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 400px) 1fr',
        gap: 40,
        alignItems: 'center',
      }}>
        {/* SVG X 図形 */}
        <div style={{ position: 'relative', width: '100%', maxWidth: 400, margin: '0 auto' }}>
          <svg
            ref={breathRef}
            viewBox="0 0 400 400"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              opacity: isTransitioning ? 0 : 1,
              transition: reduceMotion ? 'none' : `opacity 300ms ease-${isTransitioning ? 'in' : 'out'}`,
            }}
            role="img"
            aria-label={`事業部別${mode === 'revenue' ? '売上' : '利益'}チャート(X 呼吸)`}
          >
            {/* 背景グリッド(微細・凛) */}
            <line x1="200" y1="40" x2="200" y2="360" stroke={C.lineSoft} strokeWidth="0.5" />
            <line x1="40" y1="200" x2="360" y2="200" stroke={C.lineSoft} strokeWidth="0.5" />

            {/* 4本の線 */}
            {sorted.map((d, idx) => {
              const quadrantKey = QUADRANT_BY_INDEX[idx];
              const end = QUADRANT[quadrantKey];
              const stroke = strokeOf(d);
              const color = colorOf(d, idx);
              return (
                <line
                  key={d.id}
                  x1="200"
                  y1="200"
                  x2={end.x}
                  y2={end.y}
                  stroke={color}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                  className={breathing ? 'x-breath-line' : ''}
                  style={{
                    transition: reduceMotion ? 'none' : 'stroke-width 320ms ease-out, stroke 320ms ease-out',
                  }}
                />
              );
            })}

            {/* 中心点(間のシンボル・Xゴールド・逆位相呼吸) */}
            <circle
              cx="200"
              cy="200"
              r="6"
              fill={X_BRAND.gold}
              className={breathing ? 'x-breath-center' : ''}
              style={{ opacity: breathing ? undefined : 1 }}
            />
          </svg>

          {/* 呼吸アニメーション CSS */}
          <style jsx>{`
            @keyframes xBreathLine {
              0%, 100% { stroke-width: var(--base-stroke, 20); }
              50% { stroke-width: calc(var(--base-stroke, 20) * 1.06); }
            }
            @keyframes xBreathCenter {
              0%, 100% { opacity: 1.0; }
              50% { opacity: 0.4; }
            }
            .x-breath-line {
              animation: xBreathLine 3s ease-in-out infinite;
            }
            .x-breath-center {
              animation: xBreathCenter 3s ease-in-out infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .x-breath-line, .x-breath-center {
                animation: none !important;
              }
            }
          `}</style>
        </div>

        {/* 凡例(モード連動・縦並び) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sorted.map((d, idx) => {
            const color = colorOf(d, idx);
            const value = valueOf(d);
            const stroke = strokeOf(d);
            const isHighlight = color === X_BRAND.gold || color === X_BRAND.red;
            return (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  paddingBottom: 12,
                  borderBottom: `1px solid ${C.lineSoft}`,
                }}
              >
                {/* ラインインジケータ(線色と太さを反映) */}
                <span style={{
                  display: 'inline-block',
                  width: 28,
                  height: Math.max(2, stroke / 4),
                  background: color,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontFamily: F.brico,
                    fontSize: 12,
                    letterSpacing: '0.18em',
                    color: isHighlight ? color : C.text,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    marginBottom: 2,
                  }}>{d.name}</p>
                  <p style={{
                    fontFamily: F.uiJp,
                    fontSize: 11,
                    color: C.textMute,
                    letterSpacing: '0.04em',
                  }}>{d.label}</p>
                </div>
                <p style={{
                  fontFamily: F.display,
                  fontWeight: 900,
                  fontSize: 22,
                  color: isHighlight ? color : C.text,
                  fontFeatureSettings: "'tnum' 1, 'lnum' 1",
                  letterSpacing: '-0.01em',
                }}>{yenShort(value)}</p>
              </div>
            );
          })}

          {/* 補足説明(凛・微細) */}
          <p style={{
            fontFamily: F.uiJp,
            fontSize: 11,
            color: C.textMute,
            letterSpacing: '0.06em',
            lineHeight: 1.6,
            marginTop: 8,
          }}>
            線の太さは売上の大きさ。色は{mode === 'revenue' ? '売上トップ部門' : '利益トップ部門と赤字部門'}を示す。
          </p>
        </div>
      </div>
    </div>
  );
}
