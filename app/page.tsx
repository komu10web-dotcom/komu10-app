import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { DIVISIONS, KAMOKU } from '@/lib/constants';
import type { Transaction, Project } from '@/lib/types';

async function getStats(owner: string) {
  const supabase = createServerClient();
  const year = new Date().getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // 取引データ取得
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('owner', owner)
    .gte('date', startDate)
    .lte('date', endDate);

  // プロジェクトデータ取得
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('owner', owner);

  const tx = transactions || [];
  const pj = projects || [];

  // 集計
  let revenue = 0;
  let expense = 0;
  const byDivision: Record<string, number> = {};
  const byKamoku: Record<string, number> = {};

  tx.forEach((t: Transaction) => {
    const amount = t.amount || 0;
    if (t.tx_type === 'revenue') {
      revenue += amount;
    } else {
      expense += amount;
    }
    byDivision[t.division] = (byDivision[t.division] || 0) + (t.tx_type === 'revenue' ? amount : -amount);
    byKamoku[t.kamoku] = (byKamoku[t.kamoku] || 0) + amount;
  });

  return {
    revenue,
    expense,
    profit: revenue - expense,
    transactionCount: tx.length,
    projectCount: pj.length,
    activeProjects: pj.filter((p: Project) => p.status === 'active').length,
    byDivision,
    byKamoku,
  };
}

export default async function DashboardPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const stats = await getStats(currentUser);

  return (
    <div className="pt-14 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold font-mincho">ダッシュボード</h2>
        <span className="text-sm text-gray-500">{new Date().getFullYear()}年</span>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">売上</p>
          <p className="text-2xl font-saira font-semibold text-k10-green">
            {formatCurrency(stats.revenue)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">経費</p>
          <p className="text-2xl font-saira font-semibold text-k10-crimson">
            {formatCurrency(stats.expense)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">利益</p>
          <p className={`text-2xl font-saira font-semibold ${stats.profit >= 0 ? 'text-k10-green' : 'text-k10-crimson'}`}>
            {formatCurrency(stats.profit)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">進行中PJ</p>
          <p className="text-2xl font-saira font-semibold text-k10-navy">
            {stats.activeProjects}件
          </p>
        </div>
      </div>

      {/* 部門別 */}
      <div className="bg-white rounded-xl p-6 border border-gray-100">
        <h3 className="text-sm font-medium mb-4">部門別収支</h3>
        <div className="grid grid-cols-3 gap-4">
          {DIVISIONS.map((div) => {
            const amount = stats.byDivision[div.id] || 0;
            return (
              <div key={div.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: div.color }}
                />
                <div className="flex-1">
                  <p className="text-xs text-gray-500">{div.short}</p>
                  <p className={`text-sm font-medium ${amount >= 0 ? 'text-k10-green' : 'text-k10-crimson'}`}>
                    {formatCurrency(amount)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 科目別経費 */}
      <div className="bg-white rounded-xl p-6 border border-gray-100">
        <h3 className="text-sm font-medium mb-4">科目別経費</h3>
        <div className="grid grid-cols-4 gap-3">
          {KAMOKU.filter(k => k.type === 'expense').map((kamoku) => {
            const amount = stats.byKamoku[kamoku.id] || 0;
            if (amount === 0) return null;
            return (
              <div key={kamoku.id} className="flex items-center gap-2 p-2 rounded bg-gray-50">
                <span>{kamoku.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 truncate">{kamoku.label}</p>
                  <p className="text-sm font-medium">{formatCurrency(amount)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
