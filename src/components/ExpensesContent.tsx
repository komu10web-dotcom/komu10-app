'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { KAMOKU, TRANSACTION_STATUS } from '@/types/database';

// ステータスバッジの色定義
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  forecast: { bg: 'bg-[#F5F5F3]', text: 'text-[#999]' },
  accrued:  { bg: 'bg-[#81D8D0]/10', text: 'text-[#1B4D3E]' },
  billed:   { bg: 'bg-[#D4A03A]/10', text: 'text-[#D4A03A]' },
  settled:  { bg: 'bg-[#1B4D3E]/10', text: 'text-[#1B4D3E]' },
};
import type { Transaction, Project } from '@/types/database';
import { Plus, Upload, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import TransactionModal from './TransactionModal';
import { usePeriodRange } from './HeaderControls';

export default function ExpensesContent() {
  const { owner, startDate, endDate } = usePeriodRange();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // フィルター
  const [searchText, setSearchText] = useState('');

  // モーダル
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);

  // CSVインポート
  const [importing, setImporting] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // プロジェクト（TransactionModalに渡す）
  const [projects, setProjects] = useState<Project[]>([]);

  const fetchTransactions = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('tx_type', 'expense')
        .gte('date', startDate)
        .lt('date', endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (owner !== 'all') {
        query = query.eq('owner', owner);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions((data as Transaction[]) || []);

      // プロジェクト取得
      const { data: pjData } = await supabase.from('projects').select('*').order('name');
      setProjects((pjData as Project[]) || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, startDate, endDate]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // フィルター適用
  const filtered = transactions.filter((tx) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      const haystack = `${tx.store || ''} ${tx.description || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // 集計
  const expenseSum = filtered.reduce((s, t) => s + t.amount, 0);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
      setDeleteTarget(null);
      fetchTransactions();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // CSVインポート
  const handleCsvImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch('/api/transactions/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, owner: owner === 'all' ? 'tomo' : owner }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      fetchTransactions();
    } catch (err) {
      console.error('CSV import error:', err);
      alert('CSVインポートに失敗しました');
    } finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── ヘッダー ── */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">経費</h1>
            <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">EXPENSES</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              手入力
            </button>
            <label className="flex items-center gap-1.5 px-4 py-2 bg-white text-[#1a1a1a] rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors cursor-pointer border border-gray-200">
              <Upload className="w-3.5 h-3.5" />
              {importing ? 'インポート中...' : 'CSV'}
              <input
                ref={csvRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsvImport(f);
                }}
              />
            </label>
          </div>
        </div>

        {/* ── フィルター ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999]" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="検索..."
              className="pl-8 pr-3 py-2 bg-white rounded-lg text-xs border border-gray-200 outline-none focus:ring-2 focus:ring-[#D4A03A]/50 w-40"
            />
          </div>
          <span className="text-xs text-[#999] ml-auto">
            {filtered.length}件
          </span>
        </div>

        {/* ── テーブル ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-[#ccc]">
              取引がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">日付</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">ステータス</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">取引先</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">科目</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal">金額</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx) => {
                    const kamokuName = KAMOKU[tx.kamoku as keyof typeof KAMOKU]?.name || tx.kamoku;
                    const effStatus = tx.status || 'settled';
                    const statusStyle = STATUS_STYLES[effStatus] || STATUS_STYLES.settled;
                    const statusLabel = TRANSACTION_STATUS[effStatus as keyof typeof TRANSACTION_STATUS] || TRANSACTION_STATUS.settled;
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-[#F5F5F3]/50 transition-colors">
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs text-[#999] tabular-nums">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#1a1a1a]">{tx.store || '—'}</div>
                          {tx.description && (
                            <div className="text-xs text-[#999] mt-0.5">{tx.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6b6b6b]">{kamokuName}</td>
                        <td className="px-4 py-3 text-right font-['Saira_Condensed'] tabular-nums text-[#1a1a1a]">
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditTarget(tx); setModalOpen(true); }}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors"
                              title="編集"
                            >
                              <Pencil className="w-3.5 h-3.5 text-[#999]" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(tx.id)}
                              className="p-1.5 hover:bg-[#C23728]/10 rounded-md transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── フッター集計 ── */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-end px-4 py-3 border-t border-gray-100 bg-[#F5F5F3]/50">
              <div className="text-xs">
                <span className="text-[#999]">合計: </span>
                <span className="font-['Saira_Condensed'] text-[#1a1a1a] tabular-nums">{formatAmount(expenseSum)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 手入力/編集モーダル ── */}
      <TransactionModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
        onSaved={fetchTransactions}
        editData={editTarget}
        defaultOwner={owner}
        projects={projects}
      />

      {/* ── 削除確認 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この取引を削除しますか？</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e22] transition-colors"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
