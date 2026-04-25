'use client';

import { useState, useEffect } from 'react';

/**
 * useViewport — komu10 レスポンシブ判定
 *
 * ブレークポイント: 768px
 * - スマホ(<768px): 簡易ビュー(入力主体)
 * - タブレット縦・PC(>=768px): 没入体験フル表示
 *
 * SSR/初回レンダリング時は isWide=true(PC前提)で初期化し、
 * クライアントマウント後にwindow.innerWidthで上書き。
 * これによりPCでのCLS(Layout Shift)を防ぐ。
 */
export function useViewport() {
  const [isWide, setIsWide] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 768);
    check();
    setMounted(true);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return { isWide, mounted };
}
