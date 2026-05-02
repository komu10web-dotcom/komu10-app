'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * ViewSwitch — 期間切替・タブ切替の差分提示用 crossfade ラッパー
 *
 * Renaissance Phase 1 (session77) B2 で導入
 * 軸4 動きの設計:差分提示は瞬間切替ではなく重なり遷移で意味を運ぶ
 *
 * 判定:Val Head(モーション12原則)/ Léonie Watson(WCAG)/ Hedi(クリエイティブ承認)
 *
 * 仕様:
 *   - viewKey が変わると 200ms で旧→新を crossfade(opacity + translateY 4px)
 *   - prefers-reduced-motion: reduce のとき即時切替(アニメ無効化)
 *   - children は viewKey に対応する内容を毎回新たに描画する想定
 *
 * 使い方:
 *   <ViewSwitch viewKey={`${viewMode}-${year}`}>
 *     {viewMode === 'pl' ? <PLView ... /> : <CFView ... />}
 *   </ViewSwitch>
 */
export function ViewSwitch({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [displayedKey, setDisplayedKey] = useState(viewKey);
  const [opacity, setOpacity] = useState(1);
  const [yShift, setYShift] = useState(0);

  useEffect(() => {
    if (viewKey === displayedKey) return;

    if (reduceMotion) {
      // 即時切替
      setDisplayedKey(viewKey);
      setOpacity(1);
      setYShift(0);
      return;
    }

    // フェードアウト → key 切替 → フェードイン
    setOpacity(0);
    setYShift(-4);
    const t1 = setTimeout(() => {
      setDisplayedKey(viewKey);
      setYShift(4);
      // 次フレームでフェードイン
      requestAnimationFrame(() => {
        setOpacity(1);
        setYShift(0);
      });
    }, 200);

    return () => clearTimeout(t1);
  }, [viewKey, displayedKey, reduceMotion]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${yShift}px)`,
        transition: reduceMotion ? 'none' : 'opacity 200ms ease-out, transform 200ms ease-out',
        willChange: reduceMotion ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}
