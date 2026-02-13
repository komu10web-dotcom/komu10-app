'use client';
import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { COLORS } from '@/lib/constants';

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [gasUrl, setGasUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('komu10_user='));
    if (userCookie) {
      const user = userCookie.split('=')[1];
      if (user === 'tomo' || user === 'toshiki') setCurrentUser(user);
    }
    const storedUrl = localStorage.getItem('gas_api_url');
    if (storedUrl) setGasUrl(storedUrl);
  }, []);

  const handleUserChange = (user: string) => {
    setCurrentUser(user);
    document.cookie = `komu10_user=${user}; path=/; max-age=31536000`;
  };

  const handleSaveGasUrl = () => {
    localStorage.setItem('gas_api_url', gasUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-lg font-medium mb-6" style={{ color: COLORS.textPrimary }}>設定</h1>

        {/* GAS URL設定 */}
        <div className="card mb-6">
          <div className="text-sm font-medium mb-3" style={{ color: COLORS.textPrimary }}>スプレッドシート連携</div>
          <div className="space-y-3">
            <div>
              <label className="text-xs block mb-1" style={{ color: COLORS.textMuted }}>GAS API URL</label>
              <input
                type="text"
                value={gasUrl}
                onChange={(e) => setGasUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/..."
                className="input w-full"
              />
            </div>
            <button onClick={handleSaveGasUrl} className="btn btn-primary">
              保存
            </button>
            {saved && <span className="text-sm ml-2" style={{ color: COLORS.green }}>保存しました</span>}
          </div>
        </div>

        {/* アプリ情報 */}
        <div className="card mb-6">
          <div className="text-sm font-medium mb-3" style={{ color: COLORS.textPrimary }}>アプリ情報</div>
          <div className="space-y-2 text-sm" style={{ color: COLORS.textSecondary }}>
            <div className="flex justify-between">
              <span>バージョン</span>
              <span className="font-number">0.3.0</span>
            </div>
            <div className="flex justify-between">
              <span>現在のユーザー</span>
              <span>{currentUser === 'all' ? '全体' : currentUser === 'tomo' ? 'トモ' : 'トシキ'}</span>
            </div>
          </div>
        </div>

        {/* テーマ */}
        <div className="card mb-6">
          <div className="text-sm font-medium mb-3" style={{ color: COLORS.textPrimary }}>テーマ</div>
          <div className="flex gap-2">
            {['ライト', 'ウォーム', 'クール'].map(theme => (
              <button
                key={theme}
                className="px-4 py-2 rounded-lg text-sm transition-all"
                style={{
                  background: theme === 'ライト' ? COLORS.green : 'transparent',
                  color: theme === 'ライト' ? 'white' : COLORS.textSecondary,
                  border: `1px solid ${theme === 'ライト' ? COLORS.green : COLORS.border}`,
                }}
              >
                {theme}
              </button>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: COLORS.textMuted }}>
            ※ テーマ切り替えは今後のアップデートで対応予定
          </p>
        </div>

        {/* データ管理 */}
        <div className="card">
          <div className="text-sm font-medium mb-3" style={{ color: COLORS.textPrimary }}>データ管理</div>
          <div className="space-y-3">
            <button className="btn btn-secondary w-full justify-start">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              データをエクスポート
            </button>
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              ※ データエクスポートは今後のアップデートで対応予定
            </p>
          </div>
        </div>

        {/* 技術情報 */}
        <div className="mt-8 text-center">
          <div className="text-xs" style={{ color: COLORS.textMuted }}>
            komu10 会計・事業管理システム
          </div>
          <div className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
            Built with Next.js + Supabase + Vercel
          </div>
        </div>
      </main>
    </div>
  );
}
