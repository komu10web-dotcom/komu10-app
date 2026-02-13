'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [gasUrl, setGasUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // ローカルストレージからGAS URLを読み込み
  useEffect(() => {
    const savedUrl = localStorage.getItem('komu10_gas_url');
    const savedLastSynced = localStorage.getItem('komu10_last_synced');
    if (savedUrl) setGasUrl(savedUrl);
    if (savedLastSynced) setLastSynced(savedLastSynced);
  }, []);

  // GAS URLを保存
  const saveGasUrl = () => {
    localStorage.setItem('komu10_gas_url', gasUrl);
    setSyncStatus('URL を保存しました');
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // スプレッドシートと同期
  const syncWithSheets = async () => {
    if (!gasUrl) {
      setSyncStatus('GAS API URL を入力してください');
      return;
    }

    setSyncing(true);
    setSyncStatus('同期中...');

    try {
      const response = await fetch(gasUrl);
      if (!response.ok) throw new Error('API エラー');
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // プロジェクトデータをローカルストレージに保存（後でSupabaseに移行）
      localStorage.setItem('komu10_sheets_projects', JSON.stringify(data.projects || []));
      localStorage.setItem('komu10_sheets_revenue', JSON.stringify(data.revenue || []));
      
      const now = new Date().toLocaleString('ja-JP');
      setLastSynced(now);
      localStorage.setItem('komu10_last_synced', now);
      
      setSyncStatus(`同期完了: プロジェクト ${data.projects?.length || 0}件, 売上データ ${data.revenue?.length || 0}件`);
    } catch (error) {
      setSyncStatus(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">設定</h1>

      {/* アプリ情報 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">アプリ情報</h2>
        <div className="flex justify-between py-2 border-b border-gray-100">
          <span className="text-gray-600">バージョン</span>
          <span>0.3.1</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-gray-600">現在のユーザー</span>
          <span>全体</span>
        </div>
      </div>

      {/* Google Sheets 連携 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">Google Sheets 連携</h2>
        <p className="text-sm text-gray-500 mb-4">
          Google Apps Script（GAS）を使ってスプレッドシートからプロジェクト・売上データを自動取得します。
        </p>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            GAS API URL
          </label>
          <input
            type="text"
            value={gasUrl}
            onChange={(e) => setGasUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/xxxxx/exec"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#D4A03A] focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1">
            GAS をデプロイして取得した URL を貼り付けてください
          </p>
        </div>

        <div className="flex gap-3 mb-4">
          <button
            onClick={saveGasUrl}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition"
          >
            URL を保存
          </button>
          <button
            onClick={syncWithSheets}
            disabled={syncing || !gasUrl}
            className={`px-4 py-2 rounded-md transition flex items-center gap-2 ${
              gasUrl
                ? 'bg-[#D4A03A] text-white hover:bg-[#c4902a]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {syncing ? (
              <>
                <span className="animate-spin">⟳</span>
                同期中...
              </>
            ) : (
              <>🔄 今すぐ同期</>
            )}
          </button>
        </div>

        {syncStatus && (
          <div className={`p-3 rounded-md text-sm ${
            syncStatus.includes('エラー') 
              ? 'bg-red-50 text-red-700' 
              : syncStatus.includes('完了') 
                ? 'bg-green-50 text-green-700'
                : 'bg-blue-50 text-blue-700'
          }`}>
            {syncStatus}
          </div>
        )}

        {lastSynced && (
          <p className="text-xs text-gray-400 mt-3">
            最終同期: {lastSynced}
          </p>
        )}
      </div>

      {/* テーマ */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">テーマ</h2>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-[#D4A03A] text-white rounded-md">
            ライト
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
            ウォーム
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
            クール
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          ※ テーマ切り替えは今後のアップデートで対応予定
        </p>
      </div>

      {/* データ管理 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium mb-4">データ管理</h2>
        <button className="w-full py-3 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-2">
          ⬇ データをエクスポート
        </button>
        <p className="text-xs text-gray-400 mt-3">
          ※ データエクスポートは今後のアップデートで対応予定
        </p>
      </div>

      <p className="text-center text-xs text-gray-400 mt-8">
        komu10 会計・事業管理システム<br />
        Built with Next.js + Supabase + Vercel
      </p>
    </div>
  );
}
