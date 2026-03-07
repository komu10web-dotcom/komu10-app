'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { REVENUE_TYPES } from '@/types/database';
import type { Transaction } from '@/types/database';
import { Plus, Upload, Pencil, Trash2, Search, Loader2, X } from 'lucide-react';

const MONTHS = [
  { value: '0', label: '全月' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}月`,
  })),
];

const REVENUE_TYPE_OPTIONS = Object.entries(REVENUE_TYPES).map(([id, label]) => ({
  id,
  label,
}));

export default function IncomeContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'all';
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // フィルター
  const [filterMonth, setFilterMonth] = useState('0');
  const [searchText, setSearchText] = useState('');

  // モーダル
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);

  // CSVインポート
  const [importing, setImporting] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── データ取得 ──
  const fetchTransactions = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('tx_type', 'revenue')
        .gte('date', `${year}-01-01`)
        .lt('date', `${parseInt(year) + 1}-01-01`)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (owner !== 'all') {
        query = query.eq('owner', owner);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions((data as Transaction[]) || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, year]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // ── フィルター適用 ──
  const filtered = transactions.filter((tx) => {
    if (filterMonth !== '0') {
      const m = parseInt(tx.date.split('-')[1]);
      if (m !== parseInt(filterMonth)) return false;
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      const haystack = `${tx.store || ''} ${tx.description || ''} ${tx.revenue_type ? REVENUE_TYPES[tx.revenue_type as keyof typeof REVENUE_TYPES] || '' : ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // ── 集計 ──
  const revenueSum = filtered.reduce((s, t) => s + t.amount, 0);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  // ── 削除 ──
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

  // ── CSVインポート（売上用） ──
  const handleCsvImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      // 売上CSVの手動パース: 日付, 取引先, 金額, 収益タイプ, 摘要
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) {
        alert('CSVにデータがありません');
        return;
      }

      const imported: Array<{
        tx_type: string;
        date: string;
        amount: number;
        kamoku: string;
        division: string;
        owner: string;
        store: string;
        description: string;
        revenue_type: string;
        source: string;
        confirmed: boolean;
      }> = [];

      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
        if (vals.length < 3) continue;

        let date = '';
        let store = '';
        let amount = 0;

        vals.forEach((v) => {
          if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(v)) {
            date = v.replace(/\//g, '-');
          } else if (/^\d+$/.test(v) && Number(v) > 0 && !amount) {
            amount = Number(v);
          } else if (v.length > 1 && !date && !/^\d+$/.test(v) && !store) {
            store = v;
          }
        });

        if (date && amount > 0) {
          imported.push({
            tx_type: 'revenue',
            date,
            amount,
            kamoku: 'sales',
            division: 'general',
            owner: owner === 'all' ? 'tomo' : owner,
            store,
            description: '',
            revenue_type: 'other',
            source: 'csv',
            confirmed: true,
          });
        }
      }

      if (imported.length === 0) {
        alert('インポートできるデータがありませんでした');
        return;
      }

      if (!supabase) return;
      const { error } = await supabase.from('transactions').insert(imported);
      if (error) throw error;
      alert(`${imported.length}件の売上を取り込みました`);
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
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── ヘッダー ── */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">入金</h1>
            <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">INCOME</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              売上入力
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
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 bg-white rounded-lg text-xs border border-gray-200 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
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
              売上がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">日付</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">取引先</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">収益タイプ</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal">金額</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx) => {
                    const revTypeLabel = tx.revenue_type
                      ? REVENUE_TYPES[tx.revenue_type as keyof typeof REVENUE_TYPES] || tx.revenue_type
                      : '—';
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-[#F5F5F3]/50 transition-colors">
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs text-[#999] tabular-nums">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#1a1a1a]">{tx.store || '—'}</div>
                          {tx.description && (
                            <div className="text-xs text-[#999] mt-0.5">{tx.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6b6b6b]">{revTypeLabel}</td>
                        <td className="px-4 py-3 text-right font-['Saira_Condensed'] tabular-nums text-[#1B4D3E]">
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
                <span className="font-['Saira_Condensed'] text-[#1B4D3E] tabular-nums">{formatAmount(revenueSum)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 売上入力/編集モーダル ── */}
      {modalOpen && (
        <IncomeModal
          editData={editTarget}
          defaultOwner={owner === 'all' ? 'tomo' : owner}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
          onSaved={() => { setModalOpen(false); setEditTarget(null); fetchTransactions(); }}
        />
      )}

      {/* ── 削除確認 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この売上を削除しますか？</p>
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


// ═══════════════════════════════════════════
// 売上入力モーダル（IncomeContent内で自己完結）
// ═══════════════════════════════════════════

interface IncomeModalProps {
  editData: Transaction | null;
  defaultOwner: string;
  onClose: () => void;
  onSaved: () => void;
}

function IncomeModal({ editData, defaultOwner, onClose, onSaved }: IncomeModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    date: editData?.date || new Date().toISOString().split('T')[0],
    amount: editData?.amount.toString() || '',
    store: editData?.store || '',
    revenue_type: editData?.revenue_type || 'consulting',
    owner: editData?.owner || defaultOwner,
    description: editData?.description || '',
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!supabase) return;
    if (!form.date || !form.amount || !form.revenue_type) {
      setError('日付・金額・収益タイプは必須です');
      return;
    }

    const amount = parseInt(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError('金額は正の整数で入力してください');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const record = {
        tx_type: 'revenue' as const,
        date: form.date,
        amount,
        kamoku: 'sales',
        division: 'general',
        owner: form.owner,
        store: form.store || null,
        description: form.description || null,
        revenue_type: form.revenue_type,
        source: 'manual',
        confirmed: true,
      };

      if (editData) {
        const { error: err } = await supabase
          .from('transactions')
          .update(record)
          .eq('id', editData.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('transactions').insert(record);
        if (err) throw err;
      }

      onSaved();
    } catch (err) {
      console.error('Save error:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            {editData ? '売上を編集' : '売上を入力'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {/* フォーム */}
        <div className="px-5 py-4 space-y-4">
          {/* 日付 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">日付</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          {/* 金額 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">金額（円）</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums"
            />
          </div>

          {/* 取引先 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">取引先</label>
            <input
              type="text"
              value={form.store}
              onChange={(e) => handleChange('store', e.target.value)}
              placeholder="例: 長崎市DMO"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          {/* 収益タイプ */}
          <div>
            <label className="block text-xs text-[#999] mb-1">収益タイプ</label>
            <select
              value={form.revenue_type}
              onChange={(e) => handleChange('revenue_type', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              {REVENUE_TYPE_OPTIONS.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.label}</option>
              ))}
            </select>
          </div>

          {/* 担当者 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">担当者</label>
            <select
              value={form.owner}
              onChange={(e) => handleChange('owner', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>

          {/* 摘要 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">摘要</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="例: DMO観光データ分析・3月分"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          {/* エラー */}
          {error && (
            <p className="text-xs text-[#C23728]">{error}</p>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {editData ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
