'use client';

import { useState, useRef } from 'react';
import { DIVISIONS, KAMOKU, REVENUE_TYPES, COLORS, getDivision } from '@/lib/constants';
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

  const [extracting, setExtracting] = useState(false);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEdit = !!transaction;
  const isRevenue = formData.tx_type === 'revenue';

  // 科目フィルター（売上 or 経費）
  const filteredKamoku = KAMOKU.filter(k => 
    isRevenue ? k.type === 'revenue' : k.type === 'expense'
  );

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // 手動変更した場合はAIハイライトを解除
    setAiFields(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  // 領収書AI読み取り
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtracting(true);
    try {
      // ファイルをbase64に変換
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
        reader.readAsDataURL(file);
      });

      const mediaType = file.type || 'image/jpeg';
      const contentBlock = mediaType.includes('pdf')
        ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

      const kamokuList = KAMOKU.filter(k => k.type === 'expense').map(k => k.id).join('|');
      const divisionList = DIVISIONS.map(d => d.id).join('|');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              contentBlock,
              {
                type: 'text',
                text: `この領収書/レシートから情報を抽出してJSON形式で返してください。
{
  "date": "YYYY-MM-DD",
  "store": "店名",
  "amount": 税込合計金額（数値のみ）,
  "kamoku": "${kamokuList}" から最適なものを1つ,
  "division": "${divisionList}" から推定して1つ,
  "description": "品目や内容の要約",
  "confidence": 0.0-1.0
}
JSONのみ返してください。`
              }
            ]
          }]
        }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      
      // JSONを抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const newAiFields = new Set<string>();
        
        if (parsed.date) {
          setFormData(prev => ({ ...prev, date: parsed.date }));
          newAiFields.add('date');
        }
        if (parsed.store) {
          setFormData(prev => ({ ...prev, store: parsed.store }));
          newAiFields.add('store');
        }
        if (parsed.amount) {
          setFormData(prev => ({ ...prev, amount: parsed.amount }));
          newAiFields.add('amount');
        }
        if (parsed.kamoku) {
          setFormData(prev => ({ ...prev, kamoku: parsed.kamoku }));
          newAiFields.add('kamoku');
        }
        if (parsed.division) {
          setFormData(prev => ({ ...prev, division: parsed.division }));
          newAiFields.add('division');
        }
        if (parsed.description) {
          setFormData(prev => ({ ...prev, description: parsed.description }));
          newAiFields.add('description');
        }
        
        setAiFields(newAiFields);
      }
    } catch (error) {
      console.error('領収書読み取りエラー:', error);
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // AIハイライトスタイル
  const getFieldStyle = (field: string) => {
    if (aiFields.has(field)) {
      return { borderColor: COLORS.gold, boxShadow: `0 0 0 2px ${COLORS.gold}30` };
    }
    return {};
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 領収書アップロード（新規追加時のみ） */}
      {!isEdit && (
        <div className="p-3 rounded-lg border-2 border-dashed text-center" style={{ borderColor: COLORS.border }}>
          <input
            type="file"
            accept="image/*,.pdf"
            ref={fileInputRef}
            onChange={handleReceiptUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting}
            className="text-sm"
            style={{ color: extracting ? COLORS.textMuted : COLORS.green }}
          >
            {extracting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                AI読み取り中...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                領収書をアップロード（AI自動入力）
              </span>
            )}
          </button>
          {aiFields.size > 0 && (
            <div className="text-xs mt-2" style={{ color: COLORS.gold }}>
              ✨ AIが{aiFields.size}項目を入力しました。確認してください。
            </div>
          )}
        </div>
      )}

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
            style={getFieldStyle('date')}
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
            style={getFieldStyle('amount')}
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
          style={getFieldStyle('kamoku')}
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
          style={getFieldStyle('division')}
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
            style={getFieldStyle('store')}
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
            style={getFieldStyle('description')}
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
          {projects.map(p => {
            const div = getDivision(p.division);
            const seqNo = p.seq_no ? `PJ-${String(p.seq_no).padStart(3, '0')}` : '';
            const divNo = p.external_id && div?.prefix ? `${div.prefix}-${String(p.external_id).padStart(3, '0')}` : '';
            return (
              <option key={p.id} value={p.id}>
                {seqNo ? `[${seqNo}]` : ''}{divNo ? `[${divNo}]` : ''}{p.category ? `【${p.category}】` : ''}{p.name}
              </option>
            );
          })}
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
