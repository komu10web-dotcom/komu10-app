'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { supabase, Asset } from '@/lib/supabase';
import { COLORS, formatYen, getUser } from '@/lib/constants';

const ASSET_CATEGORIES = [
  { id: 'camera', name: 'カメラ' },
  { id: 'lens', name: 'レンズ' },
  { id: 'pc', name: 'PC' },
  { id: 'drone', name: 'ドローン' },
  { id: 'other', name: 'その他' },
];

// 減価償却計算（定額法）
function calculateDepreciation(asset: Asset, year: number) {
  const acqDate = new Date(asset.acquisition_date);
  const acqYear = acqDate.getFullYear();
  const yearsOwned = year - acqYear;
  
  if (yearsOwned < 0) return { annual: 0, accumulated: 0, bookValue: asset.acquisition_cost };
  if (yearsOwned >= asset.useful_life) {
    return { annual: 0, accumulated: asset.acquisition_cost - 1, bookValue: 1 };
  }

  const annualDepreciation = Math.floor(asset.acquisition_cost / asset.useful_life);
  const businessAmount = Math.floor(annualDepreciation * (asset.business_use_ratio / 100));
  const accumulated = Math.min(annualDepreciation * (yearsOwned + 1), asset.acquisition_cost - 1);
  const bookValue = asset.acquisition_cost - accumulated;

  return { annual: businessAmount, accumulated, bookValue };
}

export default function AssetsPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data } = await supabase.from('assets').select('*').order('acquisition_date', { ascending: false });
      if (data) setAssets(data);
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

  // 今年の減価償却費合計
  const totalDepreciation = assets.reduce((sum, a) => {
    const dep = calculateDepreciation(a, selectedYear);
    return sum + dep.annual;
  }, 0);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div></div>;

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>固定資産台帳</h1>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>10万円以上の資産の減価償却を管理します</p>
          </div>
        </div>

        {/* 年度選択・サマリー */}
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select className="input select w-32" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
              <span className="text-sm" style={{ color: COLORS.textSecondary }}>{assets.length}件の資産</span>
            </div>
            <div className="text-right">
              <div className="text-xs" style={{ color: COLORS.textMuted }}>{selectedYear}年 減価償却費合計</div>
              <div className="font-number text-lg" style={{ color: COLORS.navy }}>{formatYen(totalDepreciation)}</div>
            </div>
          </div>
        </div>

        {/* 資産一覧 */}
        <div className="card overflow-hidden p-0">
          <table className="table">
            <thead>
              <tr>
                <th>資産名</th>
                <th>カテゴリ</th>
                <th>担当</th>
                <th>取得日</th>
                <th className="text-right">取得価額</th>
                <th className="text-center">耐用年数</th>
                <th className="text-center">事業割合</th>
                <th className="text-right">当期償却額</th>
                <th className="text-right">期末簿価</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => {
                const cat = ASSET_CATEGORIES.find(c => c.id === asset.category);
                const owner = getUser(asset.owner);
                const dep = calculateDepreciation(asset, selectedYear);
                return (
                  <tr key={asset.id}>
                    <td className="font-medium">{asset.name}</td>
                    <td className="text-sm">{cat?.name || asset.category}</td>
                    <td className="text-sm">{owner?.name || asset.owner}</td>
                    <td className="font-number text-sm">{asset.acquisition_date}</td>
                    <td className="text-right font-number">{formatYen(asset.acquisition_cost)}</td>
                    <td className="text-center text-sm">{asset.useful_life}年</td>
                    <td className="text-center text-sm">{asset.business_use_ratio}%</td>
                    <td className="text-right font-number" style={{ color: COLORS.navy }}>{formatYen(dep.annual)}</td>
                    <td className="text-right font-number" style={{ color: dep.bookValue <= 1 ? COLORS.textMuted : COLORS.textPrimary }}>{formatYen(dep.bookValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {assets.length === 0 && <div className="text-center py-12" style={{ color: COLORS.textMuted }}>固定資産がありません</div>}
        </div>

        {/* 説明 */}
        <div className="mt-6 p-4 rounded-lg" style={{ background: 'rgba(30,58,95,0.1)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: COLORS.navy }}>💡 減価償却について</div>
          <ul className="text-xs space-y-1" style={{ color: COLORS.textSecondary }}>
            <li>• 定額法で計算しています（取得価額 ÷ 耐用年数）</li>
            <li>• 事業使用割合を適用した金額が経費計上額です</li>
            <li>• 期末簿価が1円になるまで償却を続けます</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
