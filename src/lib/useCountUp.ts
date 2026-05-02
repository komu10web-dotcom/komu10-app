'use client';

import { useState, useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * useCountUp — 数字確定カウントアップフック
 *
 * Renaissance Phase 1 (session77) で導入
 * 軸4 動きの設計:数字の確定は 280-400ms で旧値→新値を意味的に運ぶ
 * Bloomberg / Stripe Dashboard 級の体験を業務 SaaS に移植
 *
 * 判定:Val Head(モーション原則)/ Léonie Watson(WCAG)/ Patrick Collison(実装)
 *
 * 仕様:
 *   - 主指標 4KPI(売上・経費・利益・利益率)のみで使用
 *   - duration デフォルト 320ms(280-400ms 範囲の中央)
 *   - easing: easeOutQuart(終端で減速・自然な確定感)
 *   - prefers-reduced-motion: reduce のとき即座に最終値表示(アニメ無効化)
 *   - SSR 安全:初回マウントまでは初期値 0 でなく target を即時表示(CLS 防止)
 *
 * 使い方:
 *   const displayed = useCountUp(revenueTotal);
 *   <span>{yenShort(displayed)}</span>
 *
 * 注意:
 *   - target が頻繁に変わる入力系では使わない(切替混乱)
 *   - 閲覧系の主役 KPI のみで限定運用(石原さとみ業務効率監督)
 */
export function useCountUp(target: number, duration: number = 320): number {
  const reduceMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(target);
  const fromRef = useRef(target);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // 初回マウント時は target を即時表示(チラつき防止)
    if (!initializedRef.current) {
      initializedRef.current = true;
      fromRef.current = target;
      setDisplayed(target);
      return;
    }

    // prefers-reduced-motion: 即座に最終値
    if (reduceMotion) {
      fromRef.current = target;
      setDisplayed(target);
      return;
    }

    // target 変化時:現在値から target へカウントアップ
    const from = fromRef.current;
    const to = target;
    if (from === to) return;

    // 既存アニメーション破棄
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    startTimeRef.current = null;

    const step = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart:1 - (1 - x)^4
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = from + (to - from) * eased;
      setDisplayed(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, reduceMotion]);

  return displayed;
}
