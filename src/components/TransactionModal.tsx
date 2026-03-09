'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS } from '@/types/database';
import type { Transaction, Project } from '@/types/database';
import TransportFields, { EMPTY_TRANSPORT } from '@/components/TransportFields';
import type { TransportData } from '@/components/TransportFields';
import { saveTransportDetails, updateTransportDetails, loadTransportDetails } from '@/lib/transportUtils';
import EntertainmentFields, { EMPTY_ENTERTAINMENT } from '@/components/EntertainmentFields';
import type { EntertainmentData } from '@/components/EntertainmentFields';
import { entertainmentToDescription } from '@/lib/entertainmentUtils';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: Transaction | null;
  defaultOwner?: string;
  projects?: Project[];
}

interface AllocRow {
  division_id: string;
  project_id: string;
  percent: number;
}

const EXPENSE_KAMOKU = Object.entries(KAMOKU)
  .filter(([, v]) => v.type === 'expense')
  .map(([id, v]) => ({ id, name: v.name }));

const DIV_OPTIONS = Object.entries(DIVISIONS)
  .filter(([id]) => id !== 'general')
  .map(([id, v]) => ({ id, name: v.name, label: v.label }));

export default function TransactionModal({
  isOpen,
  onClose,
  onSaved,
  editData,
  defaultOwner = 'tomo',
  projects = [],
}: TransactionModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transportData, setTransportData] = useState<TransportData>({ ...EMPTY_TRANSPORT });
  const [entertainmentData, setEntertainmentData] = useState<EntertainmentData>({ ...EMPTY_ENTERTAINMENT });
  const [allocRows, setAllocRows] = useState<AllocRow[]>([]);

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    store: '',
    kamoku: 'misc',
    owner: defaultOwner === 'all' ? 'tomo' : defaultOwner,
    description: '',
  });

  useEffect(() => {
    if (editData) {
      setForm({
        date: editData.date,
        amount: editData.amount.toString(),
        store: editData.store || '',
        kamoku: editData.kamoku,
        owner: editData.owner,
        description: editData.description || '',
      });
      if (editData.kamoku === 'travel') {
        loadTransportDetails(editData.id).then((td) => {
          setTransportData(td || { ...EMPTY_TRANSPORT });
        });
      } else {
        setTransportData({ ...EMPTY_TRANSPORT });
      }
      setEntertainmentData({ ...EMPTY_ENTERTAINMENT });
      // 既存allocation読み込み
      if (supabase) {
        supabase.from('transaction_allocations').select('*').eq('transaction_id', editData.id).then(({ data }: { data: any }) => {
          if (data && data.length > 0) {
            setAllocRows(data.map((a: any) => ({
              division_id: a.division_id || '',
              project_id: a.project_id || '',
              percent: a.percent || 0,
            })));
          } else {
            setAllocRows([]);
          }
        });
      }
    } else {
      setForm({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        store: '',
        kamoku: 'misc',
        owner: defaultOwner === 'all' ? 'tomo' : defaultOwner,
        description: '',
      });
      setTransportData({ ...EMPTY_TRANSPORT });
      setEntertainmentData({ ...EMPTY_ENTERTAINMENT });
      setAllocRows([]);
    }
    setError(null);
  }, [editData, isOpen, defaultOwner]);

  // 按分行操作
  const addAllocRow = () => {
    setAllocRows(prev => [...prev, { division_id: '', project_id: '', percent: 0 }]);
  };
  const removeAllocRow = (idx: number) => {
    setAllocRows(prev => prev.filter((_, i) => i !== idx));
  };
  const updateAllocRow = (idx: number, field: keyof AllocRow, value: string | number) => {
    setAllocRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      // 事業変更時にPJリセット（紐づかないPJを選択したままにしない）
      if (field === 'division_id') updated.project_id = '';
      return updated;
    }));
  };

  const totalPercent = allocRows.reduce((s, r) => s + r.percent, 0);
  const hasAllocRows = allocRows.length > 0;

  const handleSave = async () => {
    if (!form.amount || !form.date) {
      setError('日付と金額は必須です');
      return;
    }
    if (form.kamoku === 'travel' && (!transportData.from_location || !transportData.to_location || !transportData.carrier)) {
      setError('交通費の出発地・到着地・利用会社は必須です');
      return;
    }
    if (form.kamoku === 'entertainment' && !entertainmentData.guest_name) {
      setError('接待交際費の相手先名は必須です');
      return;
    }
    // 按分バリデーション
    if (hasAllocRows) {
      if (totalPercent !== 100) {
        setError('事業割り当ての合計が100%になるようにしてください');
        return;
      }
      if (allocRows.some(r => !r.division_id)) {
        setError('事業を選択してください');
        return;
      }
    }
    if (!supabase) return;

    setSaving(true);
    setError(null);

    let finalDescription = form.description || null;
    if (form.kamoku === 'entertainment') {
      finalDescription = entertainmentToDescription(entertainmentData, form.description);
    }

    const txAmount = parseInt(form.amount.replace(/,/g, '')) || 0;
    const payload = {
      tx_type: 'expense' as const,
      date: form.date,
      amount: txAmount,
      store: form.store || null,
      kamoku: form.kamoku,
      division: 'general',
      owner: form.owner,
      description: finalDescription,
      source: 'manual' as const,
      confirmed: true,
    };

    try {
      let txId: string;

      if (editData) {
        txId = editData.id;
        const { error: dbErr } = await supabase
          .from('transactions')
          .update(payload as any)
          .eq('id', editData.id);
        if (dbErr) throw dbErr;

        if (form.kamoku === 'travel') {
          await updateTransportDetails(editData.id, transportData);
        }
      } else {
        const { data: inserted, error: dbErr } = await supabase
          .from('transactions')
          .insert(payload as any)
          .select('id')
          .single();
        if (dbErr) throw dbErr;
        txId = (inserted as any).id;

        if (form.kamoku === 'travel' && inserted) {
          await saveTransportDetails((inserted as any).id, transportData);
        }
      }

      // allocation保存
      // 既存alloc削除
      await supabase.from('transaction_allocations').delete().eq('transaction_id', txId);
      // 新規挿入
      if (hasAllocRows) {
        const inserts = allocRows.map(r => ({
          transaction_id: txId,
          division_id: r.division_id,
          project_id: r.project_id || null,
          percent: r.percent,
          amount: Math.round(txAmount * r.percent / 100),
        }));
        const { error: allocErr } = await supabase.from('transaction_allocations').insert(inserts);
        if (allocErr) throw allocErr;
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const txAmount = parseInt(form.amount.replace(/,/g, '')) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative bg-white rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="sticky top-0 bg-white rounded-t-2xl px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h3 className="text-sm font-medium text-[#1a1a1a]">
            {editData ? '経費を編集' : '経費を手入力'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-full">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-[#999] block mb-1">日付</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>
          <div>
            <label className="text-xs text-[#999] block mb-1">金額（税込）</label>
            <input type="text" inputMode="numeric"
              value={form.amount ? Number(form.amount.replace(/,/g, '')).toLocaleString() : ''}
              onChange={(e) => { const v = e.target.value.replace(/,/g, ''); if (/^\d*$/.test(v)) setForm({ ...form, amount: v }); }}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" placeholder="15,300" />
          </div>
          <div>
            <label className="text-xs text-[#999] block mb-1">取引先</label>
            <input type="text" value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" placeholder="日本航空" />
          </div>
          <div>
            <label className="text-xs text-[#999] block mb-1">勘定科目</label>
            <select value={form.kamoku} onChange={(e) => setForm({ ...form, kamoku: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              {EXPENSE_KAMOKU.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>

          {form.kamoku === 'travel' && <TransportFields data={transportData} onChange={setTransportData} />}
          {form.kamoku === 'entertainment' && <EntertainmentFields data={entertainmentData} onChange={setEntertainmentData} />}

          <div>
            <label className="text-xs text-[#999] block mb-1">担当者</label>
            <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#999] block mb-1">内容・摘要</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" placeholder="任意" />
          </div>

          {/* ===== 事業・PJ割り当て（複数行按分） ===== */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#999]">事業・PJ割り当て（任意）</label>
              {!hasAllocRows && (
                <button onClick={addAllocRow} className="flex items-center gap-1 text-[10px] text-[#D4A03A] hover:underline">
                  <Plus className="w-3 h-3" />追加
                </button>
              )}
            </div>

            {hasAllocRows ? (
              <div className="space-y-2">
                {allocRows.map((row, idx) => {
                  const filteredPJ = row.division_id
                    ? projects.filter(p => p.division === row.division_id)
                    : [];
                  return (
                    <div key={idx} className="flex items-center gap-1.5">
                      <select value={row.division_id} onChange={e => updateAllocRow(idx, 'division_id', e.target.value)}
                        className="px-2 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none w-32 shrink-0">
                        <option value="">事業</option>
                        {DIV_OPTIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <select value={row.project_id} onChange={e => updateAllocRow(idx, 'project_id', e.target.value)}
                        className="px-2 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none flex-1 truncate">
                        <option value="">PJ（任意）</option>
                        {filteredPJ.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <input type="number" value={row.percent}
                          onChange={e => updateAllocRow(idx, 'percent', parseInt(e.target.value, 10) || 0)}
                          className="w-12 px-1.5 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none text-right font-['Saira_Condensed'] tabular-nums"
                          min={0} max={100} />
                        <span className="text-[10px] text-[#999]">%</span>
                      </div>
                      {txAmount > 0 && (
                        <span className="text-[9px] font-['Saira_Condensed'] tabular-nums text-[#999] w-16 text-right shrink-0">
                          ¥{Math.round(txAmount * row.percent / 100).toLocaleString()}
                        </span>
                      )}
                      <button onClick={() => removeAllocRow(idx)} className="text-[#C23728]/60 hover:text-[#C23728] p-0.5 shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-1">
                  <button onClick={addAllocRow} className="flex items-center gap-1 text-[10px] text-[#D4A03A] hover:underline">
                    <Plus className="w-3 h-3" />行を追加
                  </button>
                  <span className={`text-[10px] font-['Saira_Condensed'] tabular-nums ${totalPercent === 100 ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>
                    合計 {totalPercent}%
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-[#999]">後から経営ページでも割り当て・変更できます</p>
            )}
          </div>

          {error && <p className="text-xs text-[#C23728]">{error}</p>}
        </div>

        <div className="px-5 pb-5">
          <button onClick={handleSave} disabled={saving || !form.amount || !form.date}
            className="w-full py-3 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2">
            {saving ? (<><Loader2 className="w-4 h-4 animate-spin" />保存中...</>) : editData ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
