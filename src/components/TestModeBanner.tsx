'use client';

import { FlaskConical } from 'lucide-react';
import { useTestMode } from '@/lib/useTestMode';

// ============================================================
// v0.52.0: テストモードバナー
// ============================================================
// ヘッダー直下に表示される赤い細バナー(テストモードON時のみ)
// ハンドオフs101 ボス確定:
// 「本番URL・本番DBを使って・テストするモード。本番データに影響を与えない」
// ============================================================
export default function TestModeBanner() {
  const { isTestMode } = useTestMode();

  if (!isTestMode) return null;

  return (
    <div className="bg-app-red text-white px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] font-medium sticky top-0 z-40">
      <FlaskConical className="w-3 h-3" />
      <span>テストモード中 — 採番カウンタ・本番集計・本番Driveフォルダに影響しません</span>
    </div>
  );
}
