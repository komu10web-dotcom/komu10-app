'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Modal from '@/components/Modal';
import TransactionForm from '@/components/TransactionForm';
import { supabase, Transaction, Project } from '@/lib/supabase';
import { COLORS, DIVISIONS, formatYen, getDivision, getKamoku, getUser } from '@/lib/constants';

function TransactionsContent() {
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    type: '',
    month: '',
    division: '',
    search: '',
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [txRes, pjRes] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('projects').select('*'),
      ]);
      if (txRes.data) setTransactions(txRes.data);
      if (pjRes.data) setProjects(pjRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      type: searchParams.get('type') || '',
      month: searchParams.get('month') || '',
      division: searchParams.get('division') || '',
    }));
  }, [searchParams]);

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

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (filters.type && tx.tx_type !== filters.type) return false;
      if (filters.month && !tx.date.startsWith(filters.month)) return false;
      if (filters.division && tx.division !== filters.division) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchStore = tx.store?.toLowerCase().includes(search);
        const matchDesc = tx.description?.toLowerCase().includes(search);
        if (!matchStore && !matchDesc) return false;
      }
      return true;
    });
  }, [transactions, filters]);

  const handleAdd = () => { setEditingTransaction(undefined); setIsModalOpen(true); };
  const handleEdit = (tx: Transaction) => { setEditingTransaction(tx); setIsModalOpen(true); };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) setTransactions(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null);
  };

  const handleSubmit = async (data: Partial<Transaction>) => {
    if (editingTransaction) {
      const { data: updated, error } = await supabase
        .from('transactions')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', editingTransaction.id)
        .select()
        .single();
      if (!error && updated) setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
    } else {
      const { data: created, error } = await supabase
        .from('transactions')
        .insert([{ ...data, owner: currentUser }])
        .select()
        .single();
      if (!error && created) setTransactions(prev => [created, ...prev]);
    }
    setIsModalOpen(false);
    setEditingTransaction(undefined);
  };

  const clearFilters = () => {
    setFilters({ type: '', month: '', division: '', search: '' });
    window.history.replaceState({}, '', '/transactions');
  };

  const hasFilters = filters.type || filters.month || filters.division || filters.search;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div>
    </div>;
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>取引一覧</h1>
          <button className="btn btn-primary" onClick={handleAdd}>+ 取引追加</button>
        </div>

        <div className="card mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <select className="input select w-32" value={filters.type} onChange={e => setFilters(prev => ({ ...prev, type: e.target.value }))}>
              <option value="">すべて</option>
              <option value="revenue">売上</option>
              <option value="expense">経費</option>
            </select>
            <input type="month" className="input w-40" value={filters.month} onChange={e => setFilters(prev => ({ ...prev, month: e.target.value }))} />
            <select className="input select w-48" value={filters.division} onChange={e => setFilters(prev => ({ ...prev, division: e.target.value }))}>
              <option value="">全部門</option>
              {DIVISIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input type="text" className="input flex-1 min-w-48" placeholder="取引先・内容で検索..." value={filters.search} onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))} />
            {hasFilters && <button className="btn btn-ghost" onClick={clearFilters}>リセット</button>}
          </div>
          {hasFilters && <div className="mt-3 text-xs" style={{ color: COLORS.textMuted }}>{filteredTransactions.length}件の取引</div>}
        </div>

        <div className="card overflow-hidden p-0">
          <table className="table">
            <thead>
              <tr>
                <th>日付</th><th>種別</th><th>担当</th><th>部門</th><th>科目</th><th>取引先</th><th>内容</th><th className="text-right">金額</th><th>PJ</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map(tx => {
                const div = getDivision(tx.division);
                const kamoku = getKamoku(tx.kamoku);
                const owner = getUser(tx.owner);
                const project = projects.find(p => p.id === tx.project_id);
                return (
                  <tr key={tx.id}>
                    <td className="font-number whitespace-nowrap">{tx.date}</td>
                    <td><span className={`badge ${tx.tx_type === 'revenue' ? 'badge-revenue' : 'badge-expense'}`}>{tx.tx_type === 'revenue' ? '売上' : '経費'}</span></td>
                    <td className="text-sm">{owner?.name || tx.owner}</td>
                    <td><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: div?.color || COLORS.sand }} /><span className="text-sm">{div?.abbr || tx.division}</span></div></td>
                    <td className="text-sm">{kamoku?.name || tx.kamoku}</td>
                    <td className="text-sm max-w-32 truncate">{tx.store || '—'}</td>
                    <td className="text-sm max-w-40 truncate">{tx.description || '—'}</td>
                    <td className="text-right"><span className="font-number" style={{ color: tx.tx_type === 'revenue' ? COLORS.gold : COLORS.crimson }}>{formatYen(tx.amount)}</span></td>
                    <td className="text-xs truncate max-w-24" style={{ color: COLORS.textMuted }}>{project?.name || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="p-1 rounded hover:bg-gray-100" onClick={() => handleEdit(tx)} style={{ color: COLORS.textMuted }}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button className="p-1 rounded hover:bg-red-50" onClick={() => setDeleteConfirm(tx.id)} style={{ color: COLORS.crimson }}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && <div className="text-center py-12" style={{ color: COLORS.textMuted }}>取引がありません</div>}
        </div>
      </main>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingTransaction(undefined); }} title={editingTransaction ? '取引を編集' : '取引を追加'}>
        <TransactionForm transaction={editingTransaction} projects={projects} currentUser={currentUser} onSubmit={handleSubmit} onCancel={() => { setIsModalOpen(false); setEditingTransaction(undefined); }} />
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="取引を削除">
        <p className="text-sm mb-4" style={{ color: COLORS.textSecondary }}>この取引を削除しますか？この操作は取り消せません。</p>
        <div className="flex gap-2">
          <button className="btn flex-1" style={{ background: COLORS.crimson, color: 'white' }} onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>削除</button>
          <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>キャンセル</button>
        </div>
      </Modal>
    </div>
  );
}

export default function TransactionsPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div></div>}><TransactionsContent /></Suspense>;
}
