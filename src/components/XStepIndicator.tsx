/**
 * XStepIndicator.tsx — 状態マーカー X 形(Step Glyph 4.2 作例4 系譜)
 *
 * canon-brand 第2部 Step Glyph 別冊 §3.4 例外:
 *   状態カテゴリ(順調/警戒/危険/完了)の意味的色相対応のみ複数色併用許容
 *
 * 4色対応:
 *   - 順調 = X Green (#2A4A3A)
 *   - 警戒 = X Gold  (#B8893A)
 *   - 危険 = X Red   (#AA2A2A)
 *   - 判定外/完了 = X Black or mute
 *
 * stroke-linecap: butt(canon §2.4 共通仕様)
 * 線の角度: 45°(canon §2.4)
 *
 * 統括: Hedi (CEO) / Saville (CBO) / Paula Scher (CDO)
 * 実装: Patrick Collison / v0.45.0 — 2026-05-05
 */

import React from 'react';

export type XStepState = 'good' | 'warn' | 'danger' | 'mute';

interface XStepIndicatorProps {
  state: XStepState;
  size?: number;       // 描画サイズ (px) デフォルト 16
  stroke?: number;     // stroke 太さ デフォルト 3 (size に比例推奨)
}

const STATE_COLORS: Record<XStepState, string> = {
  good:   '#2A4A3A',   // X Green
  warn:   '#B8893A',   // X Gold
  danger: '#AA2A2A',   // X Red
  mute:   'rgba(255,255,255,0.32)',  // 暗背景の textMute
};

export default function XStepIndicator({
  state,
  size = 16,
  stroke = 3,
}: XStepIndicatorProps) {
  const color = STATE_COLORS[state];
  // viewBox 0 0 200 200 (Step Glyph canon §2.4 共通仕様)
  // 4本の線・45°・stroke-linecap butt
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <g stroke={color} strokeWidth={stroke * (200 / size)} strokeLinecap="butt" fill="none">
        {/* 左上 → 中央右下方向 */}
        <line x1="50" y1="50" x2="92" y2="92" />
        {/* 右上 → 中央左下方向 */}
        <line x1="150" y1="50" x2="108" y2="92" />
        {/* 左下 → 中央右上方向 */}
        <line x1="50" y1="150" x2="92" y2="108" />
        {/* 右下 → 中央左上方向 */}
        <line x1="150" y1="150" x2="108" y2="108" />
      </g>
    </svg>
  );
}

/**
 * 利益率から状態を判定(現 ProjectTable のドット色相ロジックを継承)
 */
export function rateToState(rate: number, profit: number): XStepState {
  if (profit < 0) return 'danger';
  if (rate >= 50) return 'warn';   // 高利益率は警戒域(現ロジック踏襲・将来見直し)
  if (rate >= 20) return 'good';
  return 'mute';
}
