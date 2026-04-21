'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2, XCircle, FileText, Play } from 'lucide-react';

type PlanItem = {
  receiptId: string;
  fileId: string;
  oldName: string;
  newName: string;
};

type SkippedItem = {
  receiptId: string;
  reason: string;
  filename: string;
};

type FailedItem = PlanItem & { error: string };

type DryRunResult = {
  success: boolean;
  mode: string;
  total: number;
  targets: PlanItem[];
  skipped: SkippedItem[];
  renamed: PlanItem[];
  failed: FailedItem[];
  error?: string;
};

/**
 * v0.12.0 既存領収書ファイル一括リネームセクション
 * - ドライランで対応表を確認
 * - 本実行で Drive + DB を更新
 * - 管理者のみ使用前提（設定ページ最下部「危険な操作」）
 */
export default function RenameReceiptsSection() {
  const [phase, setPhase] = useState<'idle' | 'dry-run' | 'confirm' | 'executing' | 'done'>('idle');
  const [dryResult, setDryResult] = useState<DryRunResult | null>(null);
  const [execResult, setExecResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDryRun = async () => {
    setPhase('dry-run');
    setError(null);
    setDryResult(null);
    try {
      const res = await fetch('/api/admin/rename-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'dry-run' }),
      });
      const data: DryRunResult = await res.json();
      if (!data.success && data.error) {
        setError(data.error);
        setPhase('idle');
        return;
      }
      setDryResult(data);
      setPhase('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('idle');
    }
  };

  const runExecute = async () => {
    setPhase('executing');
    setError(null);
    try {
      const res = await fetch('/api/admin/rename-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'execute' }),
      });
      const data: DryRunResult = await res.json();
      if (!data.success && data.error && !data.renamed) {
        setError(data.error);
        setPhase('confirm');
        return;
      }
      setExecResult(data);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('confirm');
    }
  };

  const reset = () => {
    setPhase('idle');
    setDryResult(null);
    setExecResult(null);
    setError(null);
  };

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-3 h-3 text-[#C83838]" />
        <div className="text-[10px] font-medium tracking-widest text-[#C83838]">
          危険な操作
        </div>
      </div>

      <div
        className="bg-white rounded-2xl px-5 py-5 border border-[#F3D7D7]"
        style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}
      >
        <h3 className="text-xs font-medium text-[#1a1a1a] mb-2">
          既存領収書ファイル名の一括リネーム
        </h3>
        <p className="text-[11px] text-[#666] mb-4 leading-relaxed">
          過去にアップロードされた領収書ファイルを、v0.11.0 の新しい命名規則
          <code className="mx-1 px-1 py-0.5 bg-[#F5F5F3] rounded text-[10px]">
            日付_科目_支払先_担当者_摘要_連番_ラベル
          </code>
          に統一します。旧ファイル名は DB に記録され、復元可能です。
        </p>

        {/* Phase: idle — ドライランボタン */}
        {phase === 'idle' && (
          <>
            <button
              onClick={runDryRun}
              className="flex items-center gap-1.5 px-4 py-2 border border-[#ddd] text-[#333] rounded-lg text-xs font-medium hover:bg-[#f5f5f5] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              ドライラン実行（変更前の対応表を確認）
            </button>
            {error && (
              <p className="text-[10px] text-red-500 mt-2">{error}</p>
            )}
          </>
        )}

        {/* Phase: dry-run — ローディング */}
        {phase === 'dry-run' && (
          <div className="flex items-center gap-2 text-xs text-[#666]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ドライラン実行中...
          </div>
        )}

        {/* Phase: confirm — 対応表 + 本実行ボタン */}
        {phase === 'confirm' && dryResult && (
          <div>
            <div className="mb-3 flex flex-wrap gap-4 text-[11px]">
              <div>
                <span className="text-[#999]">対象総数: </span>
                <span className="font-medium text-[#1a1a1a]">{dryResult.total}件</span>
              </div>
              <div>
                <span className="text-[#999]">リネーム対象: </span>
                <span className="font-medium text-[#D4A03A]">{dryResult.targets.length}件</span>
              </div>
              <div>
                <span className="text-[#999]">スキップ: </span>
                <span className="font-medium text-[#999]">{dryResult.skipped.length}件</span>
              </div>
            </div>

            {dryResult.targets.length > 0 ? (
              <div className="mb-4 max-h-64 overflow-y-auto border border-[#eee] rounded-lg">
                <table className="w-full text-[10px]">
                  <thead className="bg-[#FAFAF8] sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-[#999] font-medium w-8">#</th>
                      <th className="px-2 py-1.5 text-left text-[#999] font-medium">旧名</th>
                      <th className="px-2 py-1.5 text-left text-[#999] font-medium">新名</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f5]">
                    {dryResult.targets.map((t, i) => (
                      <tr key={t.receiptId}>
                        <td className="px-2 py-1.5 text-[#999]">{i + 1}</td>
                        <td className="px-2 py-1.5 text-[#999] break-all">{t.oldName}</td>
                        <td className="px-2 py-1.5 text-[#1a1a1a] break-all">{t.newName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mb-4 text-[11px] text-[#999]">リネーム対象がありません（全て新命名規則に統一済み）</p>
            )}

            {dryResult.skipped.length > 0 && (
              <details className="mb-4">
                <summary className="text-[10px] text-[#999] cursor-pointer select-none">
                  スキップ {dryResult.skipped.length}件の詳細
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto border border-[#eee] rounded-lg">
                  <table className="w-full text-[10px]">
                    <tbody className="divide-y divide-[#f5f5f5]">
                      {dryResult.skipped.map((s, i) => (
                        <tr key={s.receiptId + i}>
                          <td className="px-2 py-1.5 text-[#999] w-20">{s.reason}</td>
                          <td className="px-2 py-1.5 text-[#999] break-all">{s.filename}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="flex gap-2">
              <button
                onClick={reset}
                className="px-4 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
              {dryResult.targets.length > 0 && (
                <button
                  onClick={runExecute}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#C83838] text-white rounded-lg text-xs font-medium hover:bg-[#A82828] transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  本実行（{dryResult.targets.length}件をリネーム）
                </button>
              )}
            </div>
            {error && (
              <p className="text-[10px] text-red-500 mt-2">{error}</p>
            )}
          </div>
        )}

        {/* Phase: executing — 本実行中 */}
        {phase === 'executing' && (
          <div className="flex items-center gap-2 text-xs text-[#666]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            リネーム実行中... しばらくお待ちください
          </div>
        )}

        {/* Phase: done — 完了レポート */}
        {phase === 'done' && execResult && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              {execResult.failed.length === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-emerald-600">リネーム完了</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-[#D4A03A]" />
                  <span className="text-xs font-medium text-[#D4A03A]">一部成功</span>
                </>
              )}
            </div>

            <div className="mb-4 flex flex-wrap gap-4 text-[11px]">
              <div>
                <span className="text-[#999]">成功: </span>
                <span className="font-medium text-emerald-600">{execResult.renamed.length}件</span>
              </div>
              <div>
                <span className="text-[#999]">失敗: </span>
                <span className="font-medium text-red-500">{execResult.failed.length}件</span>
              </div>
            </div>

            {execResult.failed.length > 0 && (
              <details className="mb-4" open>
                <summary className="text-[11px] text-red-500 cursor-pointer select-none font-medium">
                  失敗詳細 {execResult.failed.length}件
                </summary>
                <div className="mt-2 max-h-64 overflow-y-auto border border-red-100 rounded-lg">
                  <table className="w-full text-[10px]">
                    <thead className="bg-red-50">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-red-600 font-medium">ファイル名</th>
                        <th className="px-2 py-1.5 text-left text-red-600 font-medium">エラー</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                      {execResult.failed.map((f) => (
                        <tr key={f.receiptId}>
                          <td className="px-2 py-1.5 text-[#666] break-all">{f.oldName}</td>
                          <td className="px-2 py-1.5 text-red-500 break-all">{f.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <button
              onClick={reset}
              className="px-4 py-2 text-xs text-[#333] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
