'use client';

import { useState, useEffect } from 'react';
import { DIVISIONS, KAMOKU, REVENUE_TYPES, COLORS } from '@/lib/constants';
import { Transaction, Project } from '@/lib/supabase';

interface TransactionFormProps {
  transaction?: Transaction;
  projects: Project[];
  currentUser: string;
  onSubmit: (data: Partial<Transaction>) => void;
  onCancel: () => void;
}

export default function TransactionForm({ 
  transaction, 
  projects, 
  currentUser,
  onSubmit, 
  onCancel 
}: TransactionFormProps) {
  const [formData, setFormData] = useState<Partial<Transaction>>({
    tx_type: transaction?.tx_type || 'expense',
    date: transaction?.date || new Date().toISOString().split('T')[0],
    amount: transaction?.amount || 0,
    kamoku: transaction?.kamoku || '',
    division: transaction?.division || '',
    owner: transaction?.owner || currentUser,
    store: transaction?.store || '',
    description: transaction?.description || '',
    memo: transaction?.memo || '',
    project_id: transaction?.project_id || '',
    revenue_type: transaction?.revenue_type || '',
  });

  const isEdit = !!transaction;
  const isRevenue = formData.tx_type === 'revenue';

  // 科目フィルター（売上 or 経費）
  const filteredKamoku = KAMOKU.filter(k => 
    isRevenue ? k.type === 'revenue' : k.type === 'expense'
  );

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 種別 */}
      <div className="flex gap-2">
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            !isRevenue ? 'text-white' : ''
          }`}
          style={{
            background: !isRevenue ? COLORS.crimson : 'transparent',
            border: `1px solid ${!isRevenue ? COLORS.crimson : COLORS.border}`,
            color: !isRevenue ? 'white' : COLORS.textSecondary,
          }}
          onClick={() => handleChange('tx_type', 'expense')}
        >
          経費
        </button>
        <button
          type="button"
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all`}
          style={{
            background: isRevenue ? COLORS.gold : 'transparent',
            border: `1px solid ${isRevenue ? COLORS.gold : COLORS.border}`,
            color: isRevenue ? 'white' : COLORS.textSecondary,
          }}
          onClick={() => handleChange('tx_type', 'revenue')}
        >
          売上
        </button>
      </div>

      {/* 日付・金額 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>日付</label>
          <input
            type="date"
            className="input"
            value={formData.date}
            onChange={e => handleChange('date', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>金額（税込）</label>
          <input
            type="number"
            className="input font-number"
            value={formData.amount || ''}
            onChange={e => handleChange('amount', parseInt(e.target.value) || 0)}
            placeholder="0"
            required
          />
        </div>
      </div>

      {/* 科目 */}
      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>勘定科目</label>
        <select
          className="input select"
          value={formData.kamoku}
          onChange={e => handleChange('kamoku', e.target.value)}
          required
        >
          <option value="">選択してください</option>
          {filteredKamoku.map(k => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
      </div>

      {/* 収益タイプ（売上時のみ） */}
      {isRevenue && (
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>収益タイプ</label>
          <select
            className="input select"
            value={formData.revenue_type}
            onChange={e => handleChange('revenue_type', e.target.value)}
          >
            <option value="">選択してください</option>
            {REVENUE_TYPES.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* 部門 */}
      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>部門</label>
        <select
          className="input select"
          value={formData.division}
          onChange={e => handleChange('division', e.target.value)}
          required
        >
          <option value="">選択してください</option>
          {DIVISIONS.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* 取引先・内容 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>取引先</label>
          <input
            type="text"
            className="input"
            value={formData.store}
            onChange={e => handleChange('store', e.target.value)}
            placeholder="店名・会社名"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>内容</label>
          <input
            type="text"
            className="input"
            value={formData.description}
            onChange={e => handleChange('description', e.target.value)}
            placeholder="取引内容"
          />
        </div>
      </div>

      {/* プロジェクト */}
      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>プロジェクト</label>
        <select
          className="input select"
          value={formData.project_id}
          onChange={e => handleChange('project_id', e.target.value)}
        >
          <option value="">なし</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* メモ */}
      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>メモ</label>
        <textarea
          className="input"
          rows={2}
          value={formData.memo}
          onChange={e => handleChange('memo', e.target.value)}
          placeholder="備考"
        />
      </div>

      {/* ボタン */}
      <div className="flex gap-2 pt-2">
        <button type="submit" className="btn btn-primary flex-1">
          {isEdit ? '更新' : '追加'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
