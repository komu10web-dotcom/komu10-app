'use client';

/**
 * AnimatedChapterTitle.tsx — Phase 1.5a-2 章扉カオス→結晶化アニメ
 *
 * 設計裁定: session78 委員会
 *   Hedi(CEO) / Saville(CBO) / Paula(CDO) / Es Devlin(CAD) / 川村(CXD)
 *   / Raf(COO) / 石原(BCD-CSU) / Léonie(A11y) / Val Head(モーション)
 *   / Patrick(実装)
 *
 * 仕様:
 *   - 初回マウント時のみ 800ms のカオス→結晶化アニメ
 *   - sessionStorage で章名フラグ管理(同セッション2回目以降スキップ)
 *   - prefers-reduced-motion: reduce 完全準拠(0ms 即時表示)
 *   - Easing: expo.out (Apple 標準系)
 *   - タイムライン:
 *       0-200ms: 各文字が画面外周ランダム位置・ランダム回転・scale 1.4・blur 8px
 *       200-600ms: expo.out で所定位置に収束(回転0・scale 1.0・blur 0)
 *       600-800ms: 静止の質を作る微調整(0.5px)
 *
 * Violent Discipline 採用: 重力を持って所定位置に落ちる・最後にカチッと止まる
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState, useMemo, type CSSProperties } from 'react';

interface AnimatedChapterTitleProps {
  /** 章名(英語ストレッチ・MANAGEMENT / EXPENSES 等) */
  text: string;
  /** インラインスタイル(既存 h1 から移植) */
  style?: CSSProperties;
  /** sessionStorage キー識別子(章名そのもの推奨) */
  storageKey: string;
  /** as で出力タグ指定(デフォルト h1) */
  as?: 'h1' | 'h2' | 'div';
}

export default function AnimatedChapterTitle({
  text,
  style,
  storageKey,
  as = 'h1',
}: AnimatedChapterTitleProps) {
  const reduceMotion = useReducedMotion();
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    // SSR では animate せず、マウント後に判定
    if (reduceMotion) {
      setShouldAnimate(false);
      return;
    }
    try {
      const key = `chapter_title_seen_${storageKey}`;
      const seen = sessionStorage.getItem(key);
      if (!seen) {
        setShouldAnimate(true);
        sessionStorage.setItem(key, '1');
      }
    } catch {
      // sessionStorage 利用不可環境(SSR/プライベートブラウジング)はアニメ実行
      setShouldAnimate(true);
    }
  }, [reduceMotion, storageKey]);

  // 文字を1文字ずつ分解(スペースは保持)
  const chars = useMemo(() => text.split(''), [text]);

  // ランダム初期位置を文字ごとに決定(再レンダー時固定するため useMemo)
  const initialStates = useMemo(
    () =>
      chars.map(() => ({
        x: (Math.random() - 0.5) * 240, // ±120px
        y: (Math.random() - 0.5) * 140, // ±70px
        rotate: (Math.random() - 0.5) * 60, // ±30deg
        scale: 1.4,
        opacity: 0,
        filter: 'blur(8px)',
      })),
    [chars]
  );

  const Tag = motion[as];

  // アニメ不要(2回目以降 or reduce-motion)は静的レンダリング
  if (!shouldAnimate) {
    const StaticTag = as;
    return (
      <StaticTag style={style}>
        {text}
      </StaticTag>
    );
  }

  return (
    <Tag
      style={{
        ...style,
        // span を inline-flex で並べるためのリセット(letter-spacing は span 側で継承)
        display: 'block',
      }}
      aria-label={text}
    >
      {/* スクリーンリーダー向けに視覚的非表示の真テキストを提供 */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {text}
      </span>

      {/* 視覚的にはアニメする1文字ずつの span(aria-hidden) */}
      <span aria-hidden="true" style={{ display: 'inline-block' }}>
        {chars.map((ch, i) => (
          <motion.span
            key={`${storageKey}-${i}`}
            style={{
              display: 'inline-block',
              willChange: 'transform, opacity, filter',
              // 半角スペースの幅を保つ
              whiteSpace: 'pre',
            }}
            initial={initialStates[i]}
            animate={{
              x: 0,
              y: 0,
              rotate: 0,
              scale: 1,
              opacity: 1,
              filter: 'blur(0px)',
            }}
            transition={{
              duration: 0.6,
              delay: 0.2 + i * 0.012, // 文字ごとに 12ms ずらす(波のように結晶化)
              ease: [0.16, 1, 0.3, 1], // expo.out (Val Head 推奨)
            }}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </motion.span>
        ))}
      </span>
    </Tag>
  );
}
