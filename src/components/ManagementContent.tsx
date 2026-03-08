'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DIVISIONS, KAMOKU } from '@/types/database';
import type { Transaction, Project, TransactionAllocation } from '@/types/database';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Save } from 'lucide-react';

// ========== ヘルパー ==========

function yen(n: number): string {
  if (n === 0) return '¥0';
  const prefix = n < 0 ? '-¥' : '¥';
  return prefix + Math.abs(n).toLocaleString();
}

function formatProjectId(pj: Project): string {
  const parts: string[] = [];
  if (pj.seq_no) parts.push(`PJ-${String(pj.seq_no).padStart(3, '0')}`);
  if (pj.external_id) {
    const div = DIVISIONS[pj.division as keyof typeof DIVISIONS];
    const prefix = div?.prefix || 'GEN';
    const num = pj.external_id.replace(/^yt-/, '');
    parts.push(`${prefix}-${String(num).padStart(3, '0')}`);
  }
  return parts.length > 0 ? parts.map(p => `[${p}]`).join('') : '';
}

const kamokuName = (k: string) => KAMOKU[k as keyof typeof KAMOKU]?.name || k;

const ASSIGN_DIVISIONS = Object.entries(DIVISIONS)
  .filter(([id]) => id !== 'general')
  .map(([id, v]) => ({ id, name: v.name, label: v.label, color: v.color }));

const ALL_DIV_FILTER = [
  { value: 'all', label: '全事業' },
  ...Object.entries(DIVISIONS).map(([id, v]) => ({ value: id, label: v.label })),
];

const MONTHS = [
  { value: '0', label: '年間累計' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` })),
];

// 按分行の編集用
interface AllocRow {
  id?: string;         // 既存行のID（新規はundefined）
  division_id: string;
  project_id: string;  // ''はnull扱い
  percent: number;
}

// ========== コンポーネント ==========

export default function ManagementContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'all';
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<TransactionAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMonth, setViewMonth] = useState('0');

  // 按分編集
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editRows, setEditRows] = useState<AllocRow[]>([]);
  const [savingAlloc, setSavingAlloc] = useState(false);

  // セクション開閉
  const [unassignedOpen, setUnassignedOpen] = useState(true);
  const [assignedOpen, setAssignedOpen] = useState(false);

  // PJ一覧
  const [divFilter, setDivFilter] = useState('all');
  const [showAllPJ, setShowAllPJ] = useState(false);

  // 同期
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // ========== データ取得 ==========

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // トランザクション
      let txQ = supabase.from('transactions').select('*')
        .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
      if (owner !== 'all') txQ = txQ.eq('owner', owner);
      const { data: txData } = await txQ;
      const txList = (txData as Transaction[]) || [];
      setTransactions(txList);

      // プロジェクト
      let pjQ = supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (owner !== 'all') pjQ = pjQ.eq('owner', owner);
      const { data: pjData } = await pjQ;
      setProjects((pjData as Project[]) || []);

      // 按分データ（この年の取引IDに紐づくもの）
      if (txList.length > 0) {
        const txIds = txList.map(t => t.id);
        const { data: allocData } = await supabase
          .from('transaction_allocations')
          .select('*')
          .in('transaction_id', txIds);
        setAllocations((allocData as TransactionAllocation[]) || []);
      } else {
        setAllocations([]);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ========== 月フィルター ==========

  const filteredTx = viewMonth === '0'
    ? transactions
    : transactions.filter(t => parseInt(t.date.split('-')[1], 10) === parseInt(viewMonth, 10));

  const filteredTxIds = new Set(filteredTx.map(t => t.id));
  const filteredAlloc = allocations.filter(a => filteredTxIds.has(a.transaction_id));

  // ========== 按分状態の判定 ==========

  // 取引IDごとの按分データ
  const allocByTx: Record<string, TransactionAllocation[]> = {};
  allocations.forEach(a => {
    if (!allocByTx[a.transaction_id]) allocByTx[a.transaction_id] = [];
    allocByTx[a.transaction_id].push(a);
  });

  // 未分類 = 経費で、allocationsに行がない
  const unassignedExpenses = filteredTx.filter(
    t => t.tx_type === 'expense' && !allocByTx[t.id]
  );

  // 分類済み = 経費で、allocationsに行がある
  const assignedExpenses = filteredTx.filter(
    t => t.tx_type === 'expense' && allocByTx[t.id]
  );

  // ========== 按分編集 ==========

  const startEdit = (txId: string) => {
    const existing = allocByTx[txId];
    if (existing && existing.length > 0) {
      setEditRows(existing.map(a => ({
        id: a.id,
        division_id: a.division_id,
        project_id: a.project_id || '',
        percent: a.percent,
      })));
    } else {
      setEditRows([{ division_id: '', project_id: '', percent: 100 }]);
    }
    setEditingTxId(txId);
  };

  const cancelEdit = () => {
    setEditingTxId(null);
    setEditRows([]);
  };

  const addAllocRow = () => {
    setEditRows(prev => [...prev, { division_id: '', project_id: '', percent: 0 }]);
  };

  const removeAllocRow = (idx: number) => {
    setEditRows(prev => prev.filter((_, i) => i !== idx));
  };

  const updateAllocRow = (idx: number, field: keyof AllocRow, value: string | number) => {
    setEditRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const totalPercent = editRows.reduce((s, r) => s + r.percent, 0);

  const saveAllocations = async () => {
    if (!supabase || !editingTxId) return;
    if (totalPercent !== 100) { alert('合計が100%になるようにしてください'); return; }
    if (editRows.some(r => !r.division_id)) { alert('事業を選択してください'); return; }

    setSavingAlloc(true);
    try {
      const tx = transactions.find(t => t.id === editingTxId);
      if (!tx) return;

      // 既存の按分を全削除
      await supabase.from('transaction_allocations').delete().eq('transaction_id', editingTxId);

      // 新規挿入
      const inserts = editRows.map(r => ({
        transaction_id: editingTxId,
        division_id: r.division_id,
        project_id: r.project_id || null,
        percent: r.percent,
        amount: Math.round(tx.amount * r.percent / 100),
      }));

      const { error } = await supabase.from('transaction_allocations').insert(inserts);
      if (error) throw error;

      // ローカルstate更新
      setAllocations(prev => {
        const filtered = prev.filter(a => a.transaction_id !== editingTxId);
        // 再取得の代わりに仮データ追加
        const newAllocs: TransactionAllocation[] = inserts.map((ins, i) => ({
          id: `temp-${Date.now()}-${i}`,
          transaction_id: editingTxId,
          division_id: ins.division_id,
          project_id: ins.project_id,
          percent: ins.percent,
          amount: ins.amount,
          created_at: new Date().toISOString(),
        }));
        return [...filtered, ...newAllocs];
      });

      cancelEdit();
    } catch (err) {
      console.error('Save allocations error:', err);
      alert('保存に失敗しました');
    } finally {
      setSavingAlloc(false);
    }
  };

  // ========== 集計ロジック ==========

  // KPI
  const totalRevenue = filteredTx.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filteredTx.filter(t => t.tx_type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalProfit = totalRevenue - totalExpense;
  const profitRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // 月別チャート（常に12ヶ月表示）
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mStr = String(m).padStart(2, '0');
    const mTx = transactions.filter(t => t.date.startsWith(`${year}-${mStr}`));
    return {
      month: m,
      revenue: mTx.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + t.amount, 0),
      expense: mTx.filter(t => t.tx_type === 'expense').reduce((s, t) => s + t.amount, 0),
    };
  });
  const maxMonthVal = Math.max(...monthlyData.map(m => Math.max(m.revenue, m.expense)), 1);

  // 部門別損益（allocationsベース）— generalは除外
  const activeDivisions = Object.entries(DIVISIONS).filter(([id]) => id !== 'general');

  // 按分ベースの経費集計
  // allocがある経費 → allocのdivision_id × amount で各事業に配分
  // allocがない経費 → 共通経費（general）として配賦対象
  const divExpenseFromAlloc: Record<string, number> = {};
  const divRevenueFromAlloc: Record<string, number> = {};
  let unallocatedExpense = 0;

  filteredTx.forEach(t => {
    const allocs = allocByTx[t.id];
    if (t.tx_type === 'revenue') {
      // 売上は入金ページでdivision設定済みなのでtransactions.divisionを使用
      const div = t.division || 'general';
      divRevenueFromAlloc[div] = (divRevenueFromAlloc[div] || 0) + t.amount;
    } else if (t.tx_type === 'expense') {
      if (allocs && allocs.length > 0) {
        // 按分データあり → 各事業に配分
        allocs.forEach(a => {
          divExpenseFromAlloc[a.division_id] = (divExpenseFromAlloc[a.division_id] || 0) + a.amount;
        });
      } else {
        // 按分データなし → 未分類共通経費
        unallocatedExpense += t.amount;
      }
    }
  });

  const divisionPL = activeDivisions.map(([id, v]) => {
    const rev = divRevenueFromAlloc[id] || 0;
    const directExp = divExpenseFromAlloc[id] || 0;
    const directProfit = rev - directExp;
    return { id, name: v.name, label: v.label, color: v.color, revenue: rev, expense: directExp, directProfit };
  });

  // 未分類共通経費を売上比率で配賦
  const totalDivRevenue = divisionPL.reduce((s, d) => s + d.revenue, 0);
  const divisionPLFull = divisionPL.map(d => {
    const allocRate = totalDivRevenue > 0 ? d.revenue / totalDivRevenue : 1 / activeDivisions.length;
    const allocExp = Math.round(unallocatedExpense * allocRate);
    return { ...d, allocRate, allocExpense: allocExp, allocProfit: d.directProfit - allocExp };
  });

  // PJ別損益（allocationsベース）
  const pjPLMap: Record<string, { revenue: number; expense: number }> = {};
  filteredTx.forEach(t => {
    const allocs = allocByTx[t.id];
    if (t.tx_type === 'revenue' && t.project_id) {
      if (!pjPLMap[t.project_id]) pjPLMap[t.project_id] = { revenue: 0, expense: 0 };
      pjPLMap[t.project_id].revenue += t.amount;
    } else if (t.tx_type === 'expense' && allocs) {
      allocs.forEach(a => {
        if (a.project_id) {
          if (!pjPLMap[a.project_id]) pjPLMap[a.project_id] = { revenue: 0, expense: 0 };
          pjPLMap[a.project_id].expense += a.amount;
        }
      });
    }
  });

  const projectPLList = projects
    .map(pj => {
      const pl = pjPLMap[pj.id] || { revenue: 0, expense: 0 };
      return { id: pj.id, name: pj.name, division: pj.division, revenue: pl.revenue, expense: pl.expense, profit: pl.revenue - pl.expense };
    })
    .filter(p => p.revenue > 0 || p.expense > 0)
    .sort((a, b) => b.profit - a.profit);

  // PJ一覧
  const filteredProjects = divFilter === 'all' ? projects : projects.filter(p => p.division === divFilter);

  // 同期
  const handleSync = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const result = await res.json();
      if (result.success) { setSyncResult({ success: true, message: `同期完了（${result.count}/${result.total}件）` }); fetchData(); }
      else { setSyncResult({ success: false, message: result.error || '同期に失敗しました' }); }
    } catch { setSyncResult({ success: false, message: '同期に失敗しました' }); }
    finally { setSyncing(false); }
  };

  // ========== 按分編集UI（共通） ==========

  const renderAllocEditor = (tx: Transaction) => {
    if (editingTxId !== tx.id) return null;
    return (
      <div className="px-5 py-3 bg-[#FAFAF8] border-t border-gray-100">
        <div className="space-y-2">
          {editRows.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={row.division_id}
                onChange={e => updateAllocRow(idx, 'division_id', e.target.value)}
                className="px-2 py-1.5 bg-white rounded text-[11px] border border-gray-200 outline-none w-28"
              >
                <option value="">事業</option>
                {ASSIGN_DIVISIONS.map(d => <option key={d.id} value={d.id}>{d.label} — {d.name}</option>)}
              </select>
              <select
                value={row.project_id}
                onChange={e => updateAllocRow(idx, 'project_id', e.target.value)}
                className="px-2 py-1.5 bg-white rounded text-[11px] border border-gray-200 outline-none flex-1 truncate"
              >
                <option value="">PJ（任意）</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={row.percent}
                  onChange={e => updateAllocRow(idx, 'percent', parseInt(e.target.value, 10) || 0)}
                  className="w-14 px-2 py-1.5 bg-white rounded text-[11px] border border-gray-200 outline-none text-right font-['Saira_Condensed'] tabular-nums"
                  min={0} max={100}
                />
                <span className="text-[10px] text-[#999]">%</span>
              </div>
              <span className="text-[10px] font-['Saira_Condensed'] tabular-nums text-[#999] w-20 text-right">
                {yen(Math.round(tx.amount * row.percent / 100))}
              </span>
              {editRows.length > 1 && (
                <button onClick={() => removeAllocRow(idx)} className="text-[#C23728] hover:bg-[#C23728]/10 rounded p-1">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button onClick={addAllocRow} className="flex items-center gap-1 text-[10px] text-[#D4A03A] hover:underline">
              <Plus className="w-3 h-3" />行を追加
            </button>
            <span className={`text-[10px] font-['Saira_Condensed'] tabular-nums ${totalPercent === 100 ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>
              合計 {totalPercent}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cancelEdit} className="px-3 py-1 text-[10px] text-[#999] hover:bg-gray-100 rounded">キャンセル</button>
            <button
              onClick={saveAllocations}
              disabled={savingAlloc || totalPercent !== 100}
              className="flex items-center gap-1 px-3 py-1 bg-[#1a1a1a] text-white rounded text-[10px] disabled:opacity-30"
            >
              <Save className="w-3 h-3" />{savingAlloc ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 経費行の表示（共通）
  const renderExpenseRow = (tx: Transaction, showAlloc: boolean) => {
    const allocs = allocByTx[tx.id];
    const isEditing = editingTxId === tx.id;
    return (
      <div key={tx.id}>
        <div
          className={`px-5 py-2.5 flex items-center gap-3 border-b border-gray-50 hover:bg-[#F5F5F3]/30 transition-colors cursor-pointer ${isEditing ? 'bg-[#F5F5F3]/50' : ''}`}
          onClick={() => { if (!isEditing) startEdit(tx.id); }}
        >
          <span className="w-20 text-[11px] font-['Saira_Condensed'] tabular-nums text-[#999]">{tx.date.slice(5)}</span>
          <span className="flex-1 text-[11px] text-[#1a1a1a] truncate">{tx.store || tx.description || '—'}</span>
          <span className="w-24 text-[10px] text-[#999]">{kamokuName(tx.kamoku)}</span>
          <span className="w-24 text-right font-['Saira_Condensed'] text-[11px] tabular-nums text-[#C23728]">{yen(tx.amount)}</span>
          {showAlloc && allocs ? (
            <div className="w-40 flex flex-wrap gap-1">
              {allocs.map((a, i) => {
                const d = DIVISIONS[a.division_id as keyof typeof DIVISIONS];
                return (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${d?.color || '#C4B49A'}15`, color: d?.color || '#999' }}>
                    {d?.label || a.division_id} {a.percent}%
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="w-40 text-[10px] text-[#ccc]">クリックして割り当て</span>
          )}
        </div>
        {renderAllocEditor(tx)}
      </div>
    );
  };

  // ========== UI ==========

  if (loading) {
    return (
      <div className="bg-[#F5F5F3] min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── ヘッダー + 月セレクター ── */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">経営</h1>
            <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">MANAGEMENT</p>
          </div>
          <select
            value={viewMonth}
            onChange={e => setViewMonth(e.target.value)}
            className="px-3 py-1.5 bg-white rounded-lg text-xs border-0 outline-none"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* ===== KPIサマリー ===== */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: '売上', value: totalRevenue, color: '#D4A03A' },
            { label: '経費', value: totalExpense, color: '#C23728' },
            { label: '利益', value: totalProfit, color: totalProfit >= 0 ? '#1B4D3E' : '#C23728' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-2xl px-5 py-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
              <p className="text-[10px] tracking-wider text-[#999] mb-2">{kpi.label}</p>
              <p className="font-['Saira_Condensed'] text-2xl tabular-nums" style={{ color: kpi.color }}>{yen(kpi.value)}</p>
            </div>
          ))}
        </div>

        {/* 利益率バー */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-8" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] tracking-wider text-[#999]">利益率</p>
            <p className="font-['Saira_Condensed'] text-sm tabular-nums" style={{ color: profitRate >= 0 ? '#1B4D3E' : '#C23728' }}>
              {profitRate.toFixed(1)}%
            </p>
          </div>
          <div className="w-full h-2 bg-[#F5F5F3] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(Math.max(profitRate, 0), 100)}%`, background: profitRate >= 0 ? '#1B4D3E' : '#C23728' }} />
          </div>
        </div>

        {/* ===== 未分類経費 ===== */}
        <div className="bg-white rounded-2xl mb-6 overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <button onClick={() => setUnassignedOpen(!unassignedOpen)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F5F5F3]/30 transition-colors">
            <div className="flex items-center gap-3">
              <p className="text-[10px] tracking-wider text-[#999]">未分類の経費</p>
              {unassignedExpenses.length > 0 && (
                <span className="text-[10px] font-['Saira_Condensed'] tabular-nums px-2 py-0.5 rounded-full bg-[#C23728]/10 text-[#C23728]">{unassignedExpenses.length}件</span>
              )}
            </div>
            {unassignedOpen ? <ChevronUp className="w-4 h-4 text-[#999]" /> : <ChevronDown className="w-4 h-4 text-[#999]" />}
          </button>
          {unassignedOpen && (
            <div className="border-t border-gray-50">
              {unassignedExpenses.length === 0 ? (
                <p className="px-5 py-8 text-xs text-[#ccc] text-center">未分類の経費はありません</p>
              ) : (
                <>
                  <div className="px-5 py-2 flex items-center gap-3 text-[9px] text-[#999] border-b border-gray-50 bg-[#FAFAF8]">
                    <span className="w-20">日付</span>
                    <span className="flex-1">取引先</span>
                    <span className="w-24">科目</span>
                    <span className="w-24 text-right">金額</span>
                    <span className="w-40">割り当て</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {unassignedExpenses.map(tx => renderExpenseRow(tx, false))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ===== 分類済み経費 ===== */}
        {assignedExpenses.length > 0 && (
          <div className="bg-white rounded-2xl mb-8 overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <button onClick={() => setAssignedOpen(!assignedOpen)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F5F5F3]/30 transition-colors">
              <div className="flex items-center gap-3">
                <p className="text-[10px] tracking-wider text-[#999]">分類済みの経費</p>
                <span className="text-[10px] font-['Saira_Condensed'] tabular-nums px-2 py-0.5 rounded-full bg-[#1B4D3E]/10 text-[#1B4D3E]">{assignedExpenses.length}件</span>
              </div>
              {assignedOpen ? <ChevronUp className="w-4 h-4 text-[#999]" /> : <ChevronDown className="w-4 h-4 text-[#999]" />}
            </button>
            {assignedOpen && (
              <div className="border-t border-gray-50">
                <div className="px-5 py-2 flex items-center gap-3 text-[9px] text-[#999] border-b border-gray-50 bg-[#FAFAF8]">
                  <span className="w-20">日付</span>
                  <span className="flex-1">取引先</span>
                  <span className="w-24">科目</span>
                  <span className="w-24 text-right">金額</span>
                  <span className="w-40">割り当て</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {assignedExpenses.map(tx => renderExpenseRow(tx, true))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== 月別チャート ===== */}
        <div className="bg-white rounded-2xl px-5 py-5 mb-8" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <p className="text-[10px] tracking-wider text-[#999] mb-5">{year}年 月別推移（年間）</p>
          <div className="flex items-end gap-1" style={{ height: 160 }}>
            {monthlyData.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer" onClick={() => setViewMonth(viewMonth === String(m.month) ? '0' : String(m.month))}>
                <div className="flex gap-0.5 items-end w-full justify-center" style={{ flex: 1 }}>
                  <div className="rounded-t transition-all duration-300" style={{ width: '40%', height: `${Math.max((m.revenue / maxMonthVal) * 100, m.revenue > 0 ? 3 : 0)}%`, background: '#D4A03A', opacity: 0.8 }} />
                  <div className="rounded-t transition-all duration-300" style={{ width: '40%', height: `${Math.max((m.expense / maxMonthVal) * 100, m.expense > 0 ? 3 : 0)}%`, background: '#C23728', opacity: 0.65 }} />
                </div>
                <p className={`text-[9px] mt-2 font-['Saira_Condensed'] tabular-nums ${viewMonth === String(m.month) ? 'text-[#1a1a1a] font-bold' : 'text-[#999]'}`}>{m.month}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-5 mt-4">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#D4A03A', opacity: 0.8 }} /><span className="text-[10px] text-[#999]">売上</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#C23728', opacity: 0.65 }} /><span className="text-[10px] text-[#999]">経費</span></div>
          </div>
        </div>

        {/* ===== 部門別損益 ===== */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] tracking-wider text-[#999]">部門別損益</p>
            {unallocatedExpense > 0 && (
              <p className="text-[10px] text-[#999]">
                未分類共通経費 <span className="font-['Saira_Condensed'] tabular-nums text-[#C23728]">{yen(unallocatedExpense)}</span>
                <span className="ml-1 text-[9px]">（売上比率で配賦）</span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {divisionPLFull.map(d => {
              const maxBar = Math.max(d.revenue, d.expense, 1);
              return (
                <div key={d.id} className="bg-white rounded-2xl px-4 py-4" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-xs font-medium text-[#1a1a1a]">{d.name}</span>
                    <span className="text-[9px] text-[#999]">{d.label}</span>
                  </div>
                  <div className="mb-1.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-[#999]">売上</span>
                      <span className="font-['Saira_Condensed'] text-xs tabular-nums text-[#D4A03A]">{yen(d.revenue)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#F5F5F3] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(d.revenue / maxBar) * 100}%`, background: '#D4A03A', opacity: 0.8 }} />
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-[#999]">直接経費</span>
                      <span className="font-['Saira_Condensed'] text-xs tabular-nums text-[#C23728]">{yen(d.expense)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#F5F5F3] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(d.expense / maxBar) * 100}%`, background: '#C23728', opacity: 0.65 }} />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                    <span className="text-[9px] text-[#999]">直接利益</span>
                    <span className="font-['Saira_Condensed'] text-sm tabular-nums" style={{ color: d.directProfit >= 0 ? '#1B4D3E' : '#C23728' }}>{yen(d.directProfit)}</span>
                  </div>
                  {unallocatedExpense > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-dashed border-gray-100">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] text-[#999]">共通配賦</span>
                        <span className="font-['Saira_Condensed'] text-[10px] tabular-nums text-[#C23728]">
                          −{yen(d.allocExpense)}<span className="text-[8px] text-[#ccc] ml-1">({(d.allocRate * 100).toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-[#999] font-medium">配賦後利益</span>
                        <span className="font-['Saira_Condensed'] text-sm font-medium tabular-nums" style={{ color: d.allocProfit >= 0 ? '#1B4D3E' : '#C23728' }}>{yen(d.allocProfit)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== PJ別損益 ===== */}
        <div className="bg-white rounded-2xl px-5 py-5 mb-8" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] tracking-wider text-[#999]">プロジェクト別損益</p>
            {projectPLList.length > 5 && (
              <button onClick={() => setShowAllPJ(!showAllPJ)} className="text-[10px] text-[#D4A03A] hover:underline">
                {showAllPJ ? '上位5件に戻す' : `全${projectPLList.length}件を見る →`}
              </button>
            )}
          </div>
          {projectPLList.length === 0 ? (
            <p className="text-xs text-[#ccc] py-4 text-center">PJに紐づく取引がありません</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-3 py-1 text-[9px] text-[#999]">
                <span className="w-5" /><span className="flex-1">プロジェクト</span>
                <span className="w-24 text-right">売上</span><span className="w-24 text-right">経費</span><span className="w-24 text-right">利益</span>
              </div>
              {(showAllPJ ? projectPLList : projectPLList.slice(0, 5)).map(p => {
                const div = DIVISIONS[p.division as keyof typeof DIVISIONS];
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: div?.color || '#C4B49A' }} />
                    <span className="text-xs text-[#1a1a1a] flex-1 truncate">{p.name}</span>
                    <span className="w-24 text-right font-['Saira_Condensed'] text-xs tabular-nums text-[#D4A03A]">{yen(p.revenue)}</span>
                    <span className="w-24 text-right font-['Saira_Condensed'] text-xs tabular-nums text-[#C23728]">{yen(p.expense)}</span>
                    <span className="w-24 text-right font-['Saira_Condensed'] text-xs tabular-nums font-medium" style={{ color: p.profit >= 0 ? '#1B4D3E' : '#C23728' }}>{yen(p.profit)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== PJ一覧 ===== */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs text-[#999]">プロジェクト（{filteredProjects.length}件）</h2>
              <select value={divFilter} onChange={e => setDivFilter(e.target.value)} className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none">
                {ALL_DIV_FILTER.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[10px] font-medium hover:bg-[#333] disabled:opacity-40 transition-colors">
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />{syncing ? '同期中...' : 'PJ同期'}
            </button>
          </div>
          {syncResult && (
            <div className={`flex items-center gap-2 px-5 py-3 ${syncResult.success ? 'bg-[#1B4D3E]/5' : 'bg-[#C23728]/5'}`}>
              {syncResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-[#1B4D3E]" /> : <AlertCircle className="w-3.5 h-3.5 text-[#C23728]" />}
              <span className={`text-[10px] ${syncResult.success ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>{syncResult.message}</span>
            </div>
          )}
          {filteredProjects.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#ccc]">プロジェクトがありません</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredProjects.map(pj => {
                const div = DIVISIONS[pj.division as keyof typeof DIVISIONS];
                const pjId = formatProjectId(pj);
                const pl = pjPLMap[pj.id];
                const pjProfit = pl ? pl.revenue - pl.expense : 0;
                return (
                  <div key={pj.id} className="px-5 py-3 hover:bg-[#F5F5F3]/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0 mt-1" style={{ background: div?.color || '#C4B49A' }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {pjId && <span className="text-[10px] font-['Saira_Condensed'] text-[#999] tabular-nums shrink-0">{pjId}</span>}
                            <span className="text-sm text-[#1a1a1a] truncate">{pj.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-medium" style={{ color: div?.color || '#999' }}>{div?.label || pj.division}</span>
                            {pj.category && <span className="text-[10px] text-[#999] bg-[#F5F5F3] px-1.5 py-0.5 rounded">{pj.category}</span>}
                            {pj.location && <span className="text-[10px] text-[#999]">{pj.location}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {pl && <span className="font-['Saira_Condensed'] text-xs tabular-nums" style={{ color: pjProfit >= 0 ? '#1B4D3E' : '#C23728' }}>{yen(pjProfit)}</span>}
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${pj.status === 'completed' ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' : pj.status === 'active' ? 'bg-[#D4A03A]/10 text-[#D4A03A]' : 'bg-gray-100 text-[#999]'}`}>
                          {pj.status === 'completed' ? '完了' : pj.status === 'active' ? '進行中' : pj.status === 'ordered' ? '受注' : pj.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
