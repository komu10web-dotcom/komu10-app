'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { supabase, AnbunSetting } from '@/lib/supabase';
import { COLORS, KAMOKU, getKamoku } from '@/lib/constants';

export default function AnbunPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [settings, setSettings] = useState<AnbunSetting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data } = await supabase.from('anbun_settings').select('*');
      if (data) setSettings(data);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('komu10_user='));
    if (userCookie) {
      const user = userCookie.split('=')[1];
      if (user === 'all' || user === 'tomo' || user === 'toshiki') setCurrentUser(user);
    }
  }, []);

  const handleUserChange = (user: string) => {
    setCurrentUser(user);
    document.cookie = `komu10_user=${user}; path=/; max-age=31536000`;
  };

  // 按分可能な科目
  const anbunKamoku = KAMOKU.filter(k => k.anbun);

  // 現在のユーザーの設定を取得
  const getUserSetting = (kamokuId: string) => {
    return settings.find(s => s.kamoku === kamokuId && s.owner === currentUser);
  };

  // 設定を更新
  const handleUpdate = async (kamokuId: string, ratio: number, note: string) => {
    const existing = getUserSetting(kamokuId);
    
    if (existing) {
      const { data, error } = await supabase
        .from('anbun_settings')
        .update({ ratio, note, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (!error && data) {
        setSettings(prev => prev.map(s => s.id === data.id ? data : s));
      }
    } else {
      const { data, error } = await supabase
        .from('anbun_settings')
        .insert([{ kamoku: kamokuId, owner: currentUser, ratio, note }])
        .select()
        .single();
      
      if (!error && data) {
        setSettings(prev => [...prev, data]);
      }
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div></div>;

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>按分設定</h1>
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
            家賃や通信費など、事業とプライベートで共用している経費の事業使用割合を設定します。
            申告レポートで自動的に按分後の金額が計算されます。
          </p>
        </div>

        <div className="card">
          <div className="space-y-4">
            {anbunKamoku.map(k => {
              const setting = getUserSetting(k.id);
              const ratio = setting?.ratio ?? 100;
              const note = setting?.note ?? '';
              
              return (
                <div key={k.id} className="py-4 border-b" style={{ borderColor: COLORS.border }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium">{k.name}</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={ratio}
                        onChange={e => handleUpdate(k.id, parseInt(e.target.value), note)}
                        className="w-32"
                        style={{ accentColor: COLORS.green }}
                      />
                      <div className="w-16 text-right">
                        <span className="font-number text-lg" style={{ color: COLORS.green }}>{ratio}</span>
                        <span className="text-xs" style={{ color: COLORS.textMuted }}>%</span>
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder="根拠メモ（例：仕事部屋の面積割合）"
                    value={note}
                    onChange={e => handleUpdate(k.id, ratio, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 説明 */}
        <div className="mt-6 p-4 rounded-lg" style={{ background: 'rgba(27,77,62,0.1)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: COLORS.green }}>💡 按分のポイント</div>
          <ul className="text-xs space-y-1" style={{ color: COLORS.textSecondary }}>
            <li>• <strong>家賃</strong>: 仕事部屋の面積比で計算（例: 6畳/24畳 = 25%）</li>
            <li>• <strong>通信費</strong>: 事業使用時間の割合（例: 1日8時間/16時間 = 50%）</li>
            <li>• <strong>光熱費</strong>: 家賃と同じ面積比が一般的</li>
            <li>• <strong>車両費</strong>: 走行距離記録から事業利用割合を計算</li>
            <li>• 税務調査に備えて、根拠を明確に記録しておきましょう</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
