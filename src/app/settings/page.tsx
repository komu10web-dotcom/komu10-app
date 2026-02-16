'use client';

import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Save, Check, ExternalLink } from 'lucide-react';

export default function SettingsPage() {
  const [gasUrl, setGasUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // ローカルストレージから読み込み
    const storedUrl = localStorage.getItem('gasUrl');
    if (storedUrl) setGasUrl(storedUrl);
  }, []);

  const handleSave = () => {
    localStorage.setItem('gasUrl', gasUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-surface pb-20 md:pt-20">
      <Navigation />

      <main className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-xl font-medium text-black/90 mb-1">設定</h1>
          <p className="text-sm text-black/40">アプリの設定</p>
        </header>

        {/* GAS URL */}
        <section className="bg-white rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-medium text-black/80 mb-3">Google Apps Script</h2>
          <p className="text-xs text-black/40 mb-4">
            領収書をGoogle Driveに保存するためのURL
          </p>
          
          <div className="space-y-3">
            <input
              type="url"
              value={gasUrl}
              onChange={(e) => setGasUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/..."
              className="w-full px-4 py-3 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
            
            <button
              onClick={handleSave}
              className="flex items-center justify-center gap-2 w-full py-3 bg-gold text-white rounded-xl text-sm font-medium transition-smooth hover:bg-gold/90"
            >
              {saved ? (
                <>
                  <Check className="w-4 h-4" />
                  保存しました
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  保存
                </>
              )}
            </button>
          </div>
        </section>

        {/* Version Info */}
        <section className="bg-white rounded-2xl p-5 mb-4">
          <h2 className="text-sm font-medium text-black/80 mb-3">バージョン</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-black/60">komu10 会計</span>
            <span className="text-xs text-black/40">Phase 1.0</span>
          </div>
        </section>

        {/* Links */}
        <section className="bg-white rounded-2xl p-5">
          <h2 className="text-sm font-medium text-black/80 mb-3">リンク</h2>
          <div className="space-y-2">
            <a
              href="https://komu10.jp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between py-2 text-sm text-black/60 hover:text-gold transition-smooth"
            >
              komu10.jp
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
