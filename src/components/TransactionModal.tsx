'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import type { Transaction } from '@/types/database';
import TransportFields, { EMPTY_TRANSPORT } from '@/components/TransportFields';
import type { TransportData } from '@/components/TransportFields';
import { saveTransportDetails, updateTransportDetails, loadTransportDetails } from '@/lib/transportUtils';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: Transaction | null;
  defaultOwner?: string;
}

const EXPENSE_KAMOKU = Object.entries(KAMOKU)
  .filter(([, v]) => v.type === 'expense')
  .map(([id, v]) => ({ id, name: v.name }));

export default function TransactionModal({
  isOpen,
  onClose,
  onSaved,
  editData,
  defaultOwner = 'tomo',
}: TransactionModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transportData, setTransportData] = useState<TransportData>({ ...EMPTY_TRANSPORT });

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
      // 編集時、旅費交通費なら既存transport_detailsを読み込む
      if (editData.kamoku === 'travel') {
        loadTransportDetails(editData.id).then((td) => {
          setTransportData(td || { ...EMPTY_TRANSPORT });
        });
      } else {
        setTransportData({ ...EMPTY_TRANSPORT });
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
    }
    setError(null);
  }, [editData, isOpen, defaultOwner]);

  const handleSave = async () => {
    if (!form.amount || !form.date) {
      setError('日付と金額は必須です');
      return;
    }
    if (form.kamoku === 'travel' && (!transportData.from_location || !transportData.to_location || !transportData.carrier)) {
      setError('交通費の出発地・到着地・利用会社は必須です');
      return;
    }
    if (!supabase) return;

    setSaving(true);
    setError(null);

    const payload = {
      tx_type: 'expense' as const,
      date: form.date,
      amount: parseInt(form.amount.replace(/,/g, '')) || 0,
      store: form.store || null,
      kamoku: form.kamoku,
      division: 'general',
      owner: form.owner,
      description: form.description || null,
      source: 'manual' as const,
      confirmed: true,
    };

    try {
      if (editData) {
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

        if (form.kamoku === 'travel' && inserted) {
          await saveTransportDetails((inserted as any).id, transportData);
        }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="sticky top-0 bg-white rounded-t-2xl px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
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
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">金額（税込）</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.amount ? Number(form.amount.replace(/,/g, '')).toLocaleString() : ''}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, '');
                if (/^\d*$/.test(value)) setForm({ ...form, amount: value });
              }}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="15,300"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">取引先</label>
            <input
              type="text"
              value={form.store}
              onChange={(e) => setForm({ ...form, store: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="日本航空"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">勘定科目</label>
            <select
              value={form.kamoku}
              onChange={(e) => setForm({ ...form, kamoku: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              {EXPENSE_KAMOKU.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          </div>

          {form.kamoku === 'travel' && (
            <TransportFields data={transportData} onChange={setTransportData} />
          )}

          <div>
            <label className="text-xs text-[#999] block mb-1">担当者</label>
            <select
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">内容・摘要</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="任意"
            />
          </div>

          {error && <p className="text-xs text-[#C23728]">{error}</p>}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={handleSave}
            disabled={saving || !form.amount || !form.date}
            className="w-full py-3 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium
              hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : editData ? (
              '更新する'
            ) : (
              '登録する'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
