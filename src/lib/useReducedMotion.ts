'use client';

import { useState, useEffect } from 'react';

/**
 * useReducedMotion — prefers-reduced-motion 対応フック
 *
 * Léonie Watson(WCAG 必須)/ Sara Soueidan / Val Head(モーション12原則)監督
 * Renaissance Phase 1 (session77) で導入
 *
 * WCAG 2.2 SC 2.3.3: Animation from Interactions (AAA)
 * - 前庭障害(乗り物酔い体質)・てんかん患者・モーション過敏ユーザー対応
 * - prefers-reduced-motion: reduce が真のとき、全アニメーションを静止表示にフォールバック
 *
 * 使い方:
 *   const reduceMotion = useReducedMotion();
 *   const transition = reduceMotion ? 'none' : 'opacity 280ms ease-out';
 *
 * SSR 安全:初回レンダリングは false(動かす側)で初期化し、
 * クライアントマウント後に matchMedia で上書き。
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();

    // Safari < 14 互換のため addEventListener / addListener 両対応
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    } else {
      // legacy fallback
      mq.addListener(update);
      return () => mq.removeListener(update);
    }
  }, []);

  return reduceMotion;
}
