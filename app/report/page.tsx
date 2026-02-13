import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { KAMOKU } from '@/lib/constants';
import type { Transaction, AnbunSetting } from '@/lib/types';

async function getReportData(owner: string) {
  const supabase = createServerClient();
  const year = new Date().getFullYear();
  
  const [txResult, anbunResult] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .eq('owner', owner)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`),
    supabase
      .from('anbun_settings')
      .select('*')
      .eq('owner', owner),
  ]);

  return {
    transactions: txResult.data || [],
    anbunSettings: anbunResult.data || [],
  };
}

export default async function ReportPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const { transactions, anbunSettings } = await getReportData(currentUser);
  const year = new Date().getFullYear();

  // 按分設定をマップ化
  const anbunMap: Record<string, number> = {};
  anbunSettings.forEach((a: AnbunSetting) => {
    anbunMap[a.kamoku] = a.ratio;
  });

  // 科目別集計
  let totalRevenue = 0;
  let totalExpense = 0;
  let totalExpenseAfterAnbun = 0;
  const byKamoku: Record<string, { amount: number; afterAnbun: number }> = {};

  transactions.forEach((tx: Transaction) => {
    const amount = tx.amount || 0;
    const kamoku = KAMOKU.find((k) => k.id === tx.kamoku);
    
    if (tx.tx_type === 'revenue') {
      totalRevenue += amount;
    } else {
      totalExpense += amount;
      
      // 按分計算
      const ratio = anbunMap[tx.kamoku] ?? 100;
      const afterAnbun = Math.round(amount * ratio / 100);
      totalExpenseAfterAnbun += afterAnbun;
      
      if (!byKamoku[tx.kamoku]) {
        byKamoku[tx.kamoku] = { amount: 0, afterAnbun: 0 };
      }
      byKamoku[tx.kamoku].amount += amount;
      byKamoku[tx.kamoku].afterAnbun += afterAnbun;
    }
  });

  const profit = totalRevenue - totalExpenseAfterAnbun;

  return (
    <div className="pt-14 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold font-mincho">申告レポート</h2>
        <span className="text-sm text-gray-500">{year}年</span>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">売上高</p>
          <p className="text-2xl font-saira font-semibold text-k10-green">
            {formatCurrency(totalRevenue)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">経費（税込）</p>
          <p className="text-2xl font-saira font-semibold text-gray-600">
            {formatCurrency(totalExpense)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">経費（按分後）</p>
          <p className="text-2xl font-saira font-semibold text-k10-crimson">
            {formatCurrency(totalExpenseAfterAnbun)}
          </p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">所得</p>
          <p className={`text-2xl font-saira font-semibold ${profit >= 0 ? 'text-k10-green' : 'text-k10-crimson'}`}>
            {formatCurrency(profit)}
          </p>
        </div>
      </div>

      {/* 科目別内訳 */}
      <div className="bg-white rounded-xl p-6 border border-gray-100">
        <h3 className="text-sm font-medium mb-4">科目別経費</h3>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">科目</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">支出額</th>
              <th className="px-4 py-2 text-center font-medium text-gray-500">按分率</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">経費計上額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {KAMOKU.filter((k) => k.type === 'expense' && byKamoku[k.id]).map((kamoku) => {
              const data = byKamoku[kamoku.id];
              const ratio = anbunMap[kamoku.id] ?? 100;
              return (
                <tr key={kamoku.id}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span>{kamoku.icon}</span>
                      <span>{kamoku.label}</span>
                      {kamoku.anbun && (
                        <span className="text-xs text-k10-gold">按分</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-saira">
                    {formatCurrency(data.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ratio}%
                  </td>
                  <td className="px-4 py-3 text-right font-saira font-medium">
                    {formatCurrency(data.afterAnbun)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-gray-200 font-medium">
            <tr>
              <td className="px-4 py-3">合計</td>
              <td className="px-4 py-3 text-right font-saira">{formatCurrency(totalExpense)}</td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-right font-saira">{formatCurrency(totalExpenseAfterAnbun)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 65万円控除チェック */}
      <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200">
        <h3 className="text-sm font-medium text-yellow-800 mb-2">💡 65万円控除の条件</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>✓ 複式簿記で記帳（このアプリで対応）</li>
          <li>✓ E-TAXで電子申告</li>
          <li>✓ 貸借対照表・損益計算書を添付</li>
        </ul>
      </div>
    </div>
  );
}
