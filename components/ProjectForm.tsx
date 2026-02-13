'use client';

import { useState } from 'react';
import { DIVISIONS, PROJECT_STATUS, COLORS } from '@/lib/constants';
import { Project } from '@/lib/supabase';

interface ProjectFormProps {
  project?: Project;
  currentUser: string;
  onSubmit: (data: Partial<Project>) => void;
  onCancel: () => void;
}

export default function ProjectForm({ 
  project, 
  currentUser,
  onSubmit, 
  onCancel 
}: ProjectFormProps) {
  const [formData, setFormData] = useState<Partial<Project>>({
    name: project?.name || '',
    division: project?.division || '',
    owner: project?.owner || currentUser,
    status: project?.status || 'active',
    client: project?.client || '',
    youtube_id: project?.youtube_id || '',
    category: project?.category || '',
    location: project?.location || '',
    shoot_date: project?.shoot_date || '',
    publish_date: project?.publish_date || '',
    budget: project?.budget || undefined,
    target_revenue: project?.target_revenue || undefined,
    note: project?.note || '',
  });

  const isEdit = !!project;

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* プロジェクト名 */}
      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>プロジェクト名</label>
        <input
          type="text"
          className="input"
          value={formData.name}
          onChange={e => handleChange('name', e.target.value)}
          placeholder="プロジェクト名"
          required
        />
      </div>

      {/* 部門・ステータス */}
      <div className="grid grid-cols-2 gap-3">
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
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>ステータス</label>
          <select
            className="input select"
            value={formData.status}
            onChange={e => handleChange('status', e.target.value)}
            required
          >
            {PROJECT_STATUS.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* クライアント・YouTube管理ID */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>クライアント</label>
          <input
            type="text"
            className="input"
            value={formData.client}
            onChange={e => handleChange('client', e.target.value)}
            placeholder="クライアント名"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>YouTube管理ID</label>
          <input
            type="text"
            className="input"
            value={formData.youtube_id}
            onChange={e => handleChange('youtube_id', e.target.value)}
            placeholder="例: YT-2024-001"
          />
        </div>
      </div>

      {/* カテゴリ・場所 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>カテゴリ</label>
          <input
            type="text"
            className="input"
            value={formData.category}
            onChange={e => handleChange('category', e.target.value)}
            placeholder="例: city, vlog, DS"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>場所</label>
          <input
            type="text"
            className="input"
            value={formData.location}
            onChange={e => handleChange('location', e.target.value)}
            placeholder="撮影地など"
          />
        </div>
      </div>

      {/* 日付 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>撮影日</label>
          <input
            type="date"
            className="input"
            value={formData.shoot_date || ''}
            onChange={e => handleChange('shoot_date', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>公開日</label>
          <input
            type="date"
            className="input"
            value={formData.publish_date || ''}
            onChange={e => handleChange('publish_date', e.target.value)}
          />
        </div>
      </div>

      {/* 予算・目標 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>予算</label>
          <input
            type="number"
            className="input font-number"
            value={formData.budget || ''}
            onChange={e => handleChange('budget', parseInt(e.target.value) || undefined)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>目標売上</label>
          <input
            type="number"
            className="input font-number"
            value={formData.target_revenue || ''}
            onChange={e => handleChange('target_revenue', parseInt(e.target.value) || undefined)}
            placeholder="0"
          />
        </div>
      </div>

      {/* メモ */}
      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>備考</label>
        <textarea
          className="input"
          rows={3}
          value={formData.note}
          onChange={e => handleChange('note', e.target.value)}
          placeholder="メモ"
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
