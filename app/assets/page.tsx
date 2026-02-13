import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ASSET_CATEGORIES } from '@/lib/constants';
import type { Asset } from '@/lib/types';

async function getAssets(owner: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('owner', owner)
    .order('acquisition_date', { ascending: false });

  if (error) {
    console.error('Error fetching assets:', error);
    return [];
  }
  return data || [];
}

// 減価償却計算（定額法）
function calculateDepreciation(asset: Asset, year: number) {
  const acquiredYear = new Date(asset.acquisition_date).getFullYear();
  const yearsOwned = year - acquiredYear;
  
  if (yearsOwned < 0 || yearsOwned >= asset.useful_life) {
    return { annualDepreciation: 0, accumulatedDepreciation: asset.acquisition_cost, bookValue: 0 };
  }
  
  const annualDepreciation = Math.round(asset.acquisition_cost / asset.useful_life);
  const accumulatedDepreciation = annualDepreciation * (yearsOwned + 1);
  const bookValue = Math.max(0, asset.acquisition_cost - accumulatedDepreciation);
  
  // 事業使用割合を適用
  const adjustedAnnual = Math.round(annualDepreciation * asset.business_use_ratio / 100);
  
  return { annualDepreciation: adjustedAnnual, accumulatedDepreciation, bookValue };
}

export default async function AssetsPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const assets = await getAssets(currentUser);
  const currentYear = new Date().getFullYear();

  // 今年の償却費合計
  const totalDepreciation = assets.reduce((sum: number, asset: Asset) => {
    const { annualDepreciation } = calculateDepreciation(asset, currentYear);
    return sum + annualDepreciation;
  }, 0);

  return (
    <div className="pt-14 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold font-mincho">固定資産台帳</h2>
        <button className="px-4 py-2 bg-k10-gold text-white rounded-lg text-sm font-medium hover:bg-k10-gold/90 transition-colors">
          ＋ 資産追加
        </button>
      </div>

      {/* 今年の償却費 */}
      <div className="bg-white rounded-xl p-5 border border-gray-100">
        <p className="text-xs text-gray-500 mb-1">{currentYear}年 減価償却費合計</p>
        <p className="text-2xl font-saira font-semibold text-k10-navy">
          {formatCurrency(totalDepreciation)}
        </p>
      </div>

      {/* 資産一覧 */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">資産名</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">区分</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">取得日</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">取得価額</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">耐用年数</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">事業割合</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">今年の償却費</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">帳簿価額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {assets.map((asset: Asset) => {
              const category = ASSET_CATEGORIES.find((c) => c.id === asset.category);
              const depreciation = calculateDepreciation(asset, currentYear);
              
              return (
                <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{asset.name}</td>
                  <td className="px-4 py-3 text-gray-600">{category?.label || asset.category}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(asset.acquisition_date)}</td>
                  <td className="px-4 py-3 text-right font-saira">{formatCurrency(asset.acquisition_cost)}</td>
                  <td className="px-4 py-3 text-center">{asset.useful_life}年</td>
                  <td className="px-4 py-3 text-center">{asset.business_use_ratio}%</td>
                  <td className="px-4 py-3 text-right font-saira text-k10-crimson">
                    {formatCurrency(depreciation.annualDepreciation)}
                  </td>
                  <td className="px-4 py-3 text-right font-saira">
                    {formatCurrency(depreciation.bookValue)}
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  固定資産がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
