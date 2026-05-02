'use client';

/**
 * XLineFlash.tsx — Phase 1.5b X ライン武器化(画面横一閃)
 *
 * 設計裁定: session78 委員会
 *   Hedi(CEO) / Saville(CBO) / Es Devlin(CAD) / 川村(CXD)
 *   / Raf(COO) / Léonie(A11y) / Val Head(モーション) / Patrick(実装)
 *
 * 仕様:
 *   - 章扉マウント時に画面を横一閃する金色 X ライン
 *   - 0ms: 画面左外から発射 → 500ms: 画面右外へ抜ける
 *   - 抜けた後、所定位置に stroke 1.0pt の残骸が静止(永続)
 *   - 色: X Gold #B8893A(komu10 親ブランド強調色)
 *   - prefers-reduced-motion: reduce 完全準拠(残骸のみ即時表示・閃光なし)
 *   - sessionStorage 2回目以降スキップ(残骸のみ即時表示)
 *
 * Violent Discipline 採用:
 *   章扉カオス→結晶化と同時発火・視覚の暴力性最大化
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface XLineFlashProps {
  /** sessionStorage キー識別子(章名そのもの推奨) */
  storageKey: string;
  /**
   * 配置基準。'top'(親要素の上端からの距離) or 'bottom'(下端からの距離)
   * 既定: 'bottom'(章扉 header の下端に残骸ラインを置く設計)
   */
  position?: 'top' | 'bottom';
  /** 基準点からのオフセット(px) */
  offset?: number;
  /** 閃光時 stroke 太さ(px) */
  flashStrokeWidth?: number;
  /** 残骸 stroke 太さ(px) */
  residualStrokeWidth?: number;
  /** ラインの色(既定: X Gold) */
  color?: string;
}

export default function XLineFlash({
  storageKey,
  position = 'bottom',
  offset = 0,
  flashStrokeWidth = 2.6,
  residualStrokeWidth = 1.0,
  color = '#B8893A',
}: XLineFlashProps) {
  const reduceMotion = useReducedMotion();
  const [shouldFlash, setShouldFlash] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (reduceMotion) {
      setShouldFlash(false);
      return;
    }
    try {
      const key = `xline_flash_seen_${storageKey}`;
      const seen = sessionStorage.getItem(key);
      if (!seen) {
        setShouldFlash(true);
        sessionStorage.setItem(key, '1');
      }
    } catch {
      setShouldFlash(true);
    }
  }, [reduceMotion, storageKey]);

  // SSR では何も描画しない(viewport 取得不可・残骸位置計算もできない)
  if (!mounted) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        ...(position === 'top' ? { top: offset } : { bottom: offset }),
        left: 0,
        right: 0,
        height: Math.max(flashStrokeWidth, residualStrokeWidth) + 2,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 1,
      }}
    >
      {shouldFlash ? (
        <>
          {/* 閃光: 画面左外 → 画面右外(500ms) */}
          <motion.div
            initial={{
              left: '-30%',
              width: '30%',
              opacity: 0,
            }}
            animate={{
              left: ['-30%', '0%', '100%', '130%'],
              opacity: [0, 1, 1, 0],
              width: ['30%', '60%', '60%', '30%'],
            }}
            transition={{
              duration: 0.5,
              times: [0, 0.15, 0.85, 1],
              ease: [0.7, 0, 0.3, 1], // 鋭い加速→等速→鋭い減速
            }}
            style={{
              position: 'absolute',
              top: 0,
              height: flashStrokeWidth,
              backgroundColor: color,
              willChange: 'left, width, opacity',
              boxShadow: `0 0 12px ${color}60, 0 0 24px ${color}30`, // 金色のグロー
            }}
          />

          {/* 残骸ライン: 閃光通過後にフェードイン(500ms 完了 → 200ms かけて出現) */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{
              duration: 0.2,
              delay: 0.5,
              ease: [0.16, 1, 0.3, 1], // expo.out
            }}
            style={{
              position: 'absolute',
              top: (flashStrokeWidth - residualStrokeWidth) / 2,
              left: 0,
              right: 0,
              height: residualStrokeWidth,
              backgroundColor: color,
              transformOrigin: 'left center',
              willChange: 'opacity, transform',
            }}
          />
        </>
      ) : (
        // 2回目以降 or reduce-motion: 残骸のみ即時表示
        <div
          style={{
            position: 'absolute',
            top: (flashStrokeWidth - residualStrokeWidth) / 2,
            left: 0,
            right: 0,
            height: residualStrokeWidth,
            backgroundColor: color,
          }}
        />
      )}
    </div>
  );
}
