import { cookies } from 'next/headers';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DIVISIONS, KAMOKU } from '@/lib/constants';
import type { Transaction } from '@/lib/types';

async function getTransactions(owner: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('owner', owner)
    .order('date', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
  return data || [];
}

export default async function TransactionsPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const transactions = await getTransactions(currentUser);

  return (
    <div className="pt-14 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold font-mincho">取引一覧</h2>
        <Link
          href="/transactions/new"
          className="px-4 py-2 bg-k10-gold text-white rounded-lg text-sm font-medium hover:bg-k10-gold/90 transition-colors"
        >
          ＋ 取引追加
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">日付</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">種別</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">科目</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">部門</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">内容</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">金額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {transactions.map((tx: Transaction) => {
              const kamoku = KAMOKU.find((k) => k.id === tx.kamoku);
              const division = DIVISIONS.find((d) => d.id === tx.division);
              return (
                <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        tx.tx_type === 'revenue'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {tx.tx_type === 'revenue' ? '売上' : '経費'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1">
                      <span>{kamoku?.icon}</span>
                      <span>{kamoku?.label || tx.kamoku}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: division?.color || '#999' }}
                    >
                      {division?.short || tx.division}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {tx.description || tx.store || '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-saira font-medium">
                    <span className={tx.tx_type === 'revenue' ? 'text-k10-green' : 'text-k10-crimson'}>
                      {formatCurrency(tx.amount)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  取引データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
