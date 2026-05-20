'use client';

import { useEffect, useState, useCallback } from 'react';

// ============================================================
// v0.52.0: テストモード切替フック
// ============================================================
// 用途: 本番運用中に新機能を実機テストするためのモード切替
// 仕様:
//   - localStorage 永続化(keyは komu10_test_mode)
//   - ヘッダー右上トグルから ON/OFF
//   - テストモード時:
//     * 請求書番号は TEST-INV-YYYY-XXXX(別カウンタ)
//     * 売上/請求書に is_test=true 自動付与
//     * Drive 格納は 99_テスト 配下
//     * 集計クエリから is_test=true は除外
// ============================================================

const STORAGE_KEY = 'komu10_test_mode';
const EVENT_NAME = 'komu10TestModeChanged';

/**
 * テストモードの読み取りと切替
 * 全コンポーネントから呼べる(localStorage + CustomEvent で同期)
 */
export function useTestMode() {
  const [isTestMode, setIsTestMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  // 他コンポーネントでのトグル変更を受信
  useEffect(() => {
    const handler = () => {
      setIsTestMode(localStorage.getItem(STORAGE_KEY) === 'true');
    };
    window.addEventListener(EVENT_NAME, handler);
    // 他タブからの変更も検知(storage event)
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const toggle = useCallback(() => {
    if (typeof window === 'undefined') return;
    const next = !isTestMode;
    localStorage.setItem(STORAGE_KEY, String(next));
    setIsTestMode(next);
    // 全コンポーネントへ通知
    window.dispatchEvent(new Event(EVENT_NAME));
  }, [isTestMode]);

  const setValue = useCallback((value: boolean) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(value));
    setIsTestMode(value);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return { isTestMode, toggle, setIsTestMode: setValue };
}

/**
 * SSR 環境やフック外でテストモードを参照する場合の同期ヘルパー
 * 注意: クライアントサイドのみ動作
 */
export function getTestMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}
