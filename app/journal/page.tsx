import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { KAMOKU } from '@/lib/constants';
import type { Transaction } from '@/lib/types';

async function getTransactions(owner: string) {
  const supabase = createServerClient();
  const year = new Date().getFullYear();
  
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('owner', owner)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
  return data || [];
}

export default async function JournalPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const transactions = await getTransactions(currentUser);

  // 仕訳帳形式に変換
  const journal = transactions.map((tx: Transaction) => {
    const kamoku = KAMOKU.find((k) => k.id === tx.kamoku);
    
    if (tx.tx_type === 'revenue') {
      return {
        id: tx.id,
        date: tx.date,
        debit: '普通預金',
        debitAmount: tx.amount,
        credit: kamoku?.label || '売上高',
        creditAmount: tx.amount,
        description: tx.description || tx.store || '',
      };
    } else {
      return {
        id: tx.id,
        date: tx.date,
        debit: kamoku?.label || '雑費',
        debitAmount: tx.amount,
        credit: '普通預金',
        creditAmount: tx.amount,
        description: tx.description || tx.store || '',
      };
    }
  });

  return (
    <div className="pt-14 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold font-mincho">仕訳帳</h2>
        <button className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          CSV出力
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">日付</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">借方科目</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">借方金額</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">貸方科目</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">貸方金額</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">摘要</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {journal.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-600">{formatDate(entry.date)}</td>
                <td className="px-4 py-3">{entry.debit}</td>
                <td className="px-4 py-3 text-right font-saira">{formatCurrency(entry.debitAmount)}</td>
                <td className="px-4 py-3">{entry.credit}</td>
                <td className="px-4 py-3 text-right font-saira">{formatCurrency(entry.creditAmount)}</td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">{entry.description}</td>
              </tr>
            ))}
            {journal.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  仕訳データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
