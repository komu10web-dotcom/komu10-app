'use client';

import { useState, useRef } from 'react';
import { DIVISIONS, KAMOKU, REVENUE_TYPES, COLORS, getDivision } from '@/lib/constants';
import { Transaction, Project } from '@/lib/supabase';

// GAS URL
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxOOHKgA5fQSFF6HE4gk1CGAJNNzWoSTC9GgXedb-VEYWJmjs3M_HSQrfybkob6Urz9/exec';

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
    receipt_url: transaction?.receipt_url || '',
  });

  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<{ base64: string; filename: string } | null>(null);

  const isEdit = !!transaction;
  const isRevenue = formData.tx_type === 'revenue';

  const filteredKamoku = KAMOKU.filter(k => 
    isRevenue ? k.type === 'revenue' : k.type === 'expense'
  );

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setAiFields(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  // 領収書AI読み取り（APIルート経由）
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
        reader.readAsDataURL(file);
      });

      setReceiptFile({ base64, filename: file.name });

      const mediaType = file.type || 'image/jpeg';
      const contentBlock = mediaType.includes('pdf')
        ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

      const kamokuList = KAMOKU.filter(k => k.type === 'expense').map(k => k.id).join('|');
      const divisionList = DIVISIONS.map(d => d.id).join('|');

      // APIルート経由で呼び出し（CORS回避）
      const response = await fetch('/api/anthropic', {
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
                text: `あなたは日本の経理担当者です。この領収書/レシート画像を注意深く読み取り、正確に情報を抽出してください。

【重要な注意事項】
- 日本語の地名・駅名・空港名は正確に読み取ること（例：小松、羽田、成田、新千歳など）
- 航空券の場合：出発地→到着地を正確に記載（便名も含める）
- 金額は税込総額を数値のみで記載
- 読み取れない文字は推測せず「不明」と記載
- 日付はYYYY-MM-DD形式

【出力形式】以下のJSONのみを返してください：
{
  "date": "YYYY-MM-DD形式の日付",
  "store": "店名・会社名",
  "amount": 税込合計金額（数値のみ、カンマなし）,
  "kamoku": "${kamokuList}" から最も適切なものを1つ選択,
  "division": "${divisionList}" から最も適切なものを1つ選択,
  "description": "具体的な内容（航空券なら便名と区間、商品なら品目）"
}

JSONのみ出力。説明文は不要。`
              }
            ]
          }]
        }),
      });

      const data = await response.json();
      console.log('API response:', JSON.stringify(data, null, 2));
      
      if (data.error) {
        console.error('API error:', data.error);
        alert('APIエラー: ' + (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)));
        return;
      }
      
      const text = data.content?.[0]?.text || '';
      console.log('Extracted text:', text);
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const newAiFields = new Set<string>();
        
        if (parsed.date) { handleChange('date', parsed.date); newAiFields.add('date'); }
        if (parsed.store) { handleChange('store', parsed.store); newAiFields.add('store'); }
        if (parsed.amount) { handleChange('amount', parsed.amount); newAiFields.add('amount'); }
        if (parsed.kamoku) { handleChange('kamoku', parsed.kamoku); newAiFields.add('kamoku'); }
        if (parsed.division) { handleChange('division', parsed.division); newAiFields.add('division'); }
        if (parsed.description) { handleChange('description', parsed.description); newAiFields.add('description'); }
        
        setAiFields(newAiFields);
      }
    } catch (error) {
      console.error('領収書読み取りエラー:', error);
      alert('領収書の読み取りに失敗しました');
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const uploadReceiptToDrive = async (): Promise<string | null> => {
    if (!receiptFile) return null;

    setUploading(true);
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'uploadReceipt',
          image: receiptFile.base64,
          filename: receiptFile.filename,
          date: formData.date,
          store: formData.store,
          amount: formData.amount,
        }),
      });

      const result = await response.json();
      if (result.success && result.url) {
        return result.url;
      }
      return null;
    } catch (error) {
      console.error('Drive upload error:', error);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalData = { ...formData };

    if (receiptFile && !formData.receipt_url) {
      const driveUrl = await uploadReceiptToDrive();
      if (driveUrl) {
        finalData.receipt_url = driveUrl;
      }
    }

    onSubmit(finalData);
  };

  const getFieldStyle = (field: string) => {
    if (aiFields.has(field)) {
      return { 
        borderColor: COLORS.gold, 
        boxShadow: `0 0 0 2px ${COLORS.gold}30`,
        background: `${COLORS.gold}08`
      };
    }
    return {};
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isEdit && (
        <div 
          className="p-4 rounded-lg border-2 border-dashed text-center" 
          style={{ 
            borderColor: receiptFile ? COLORS.green : COLORS.border,
            background: receiptFile ? `${COLORS.green}08` : 'transparent'
          }}
        >
          <input type="file" accept="image/*,.pdf" ref={fileInputRef} onChange={handleReceiptUpload} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting || uploading}
            className="text-sm font-medium"
            style={{ color: extracting ? COLORS.textMuted : COLORS.green }}
          >
            {extracting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                AI解析中...
              </span>
            ) : receiptFile ? (
              <span>✓ 領収書読み取り完了（別の画像を選択）</span>
            ) : (
              <span>📷 領収書をアップロード（AI自動入力）</span>
            )}
          </button>
          <p className="text-xs mt-2" style={{ color: COLORS.textMuted }}>PDF/画像 → Claude AIが自動抽出 → Google Driveに保存</p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: !isRevenue ? COLORS.crimson : 'transparent', border: `1px solid ${!isRevenue ? COLORS.crimson : COLORS.border}`, color: !isRevenue ? 'white' : COLORS.textSecondary }}
          onClick={() => handleChange('tx_type', 'expense')}>経費</button>
        <button type="button" className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: isRevenue ? COLORS.gold : 'transparent', border: `1px solid ${isRevenue ? COLORS.gold : COLORS.border}`, color: isRevenue ? 'white' : COLORS.textSecondary }}
          onClick={() => handleChange('tx_type', 'revenue')}>売上</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>日付</label>
          <input type="date" className="input" style={getFieldStyle('date')} value={formData.date} onChange={e => handleChange('date', e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>金額（税込）</label>
          <input type="number" className="input font-number" style={getFieldStyle('amount')} value={formData.amount || ''} onChange={e => handleChange('amount', parseInt(e.target.value) || 0)} placeholder="0" required />
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>勘定科目</label>
        <select className="input select" style={getFieldStyle('kamoku')} value={formData.kamoku} onChange={e => handleChange('kamoku', e.target.value)} required>
          <option value="">選択してください</option>
          {filteredKamoku.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </div>

      {isRevenue && (
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>収益タイプ</label>
          <select className="input select" value={formData.revenue_type} onChange={e => handleChange('revenue_type', e.target.value)}>
            <option value="">選択してください</option>
            {REVENUE_TYPES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>部門</label>
        <select className="input select" style={getFieldStyle('division')} value={formData.division} onChange={e => handleChange('division', e.target.value)} required>
          <option value="">選択してください</option>
          {DIVISIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>取引先</label>
          <input type="text" className="input" style={getFieldStyle('store')} value={formData.store} onChange={e => handleChange('store', e.target.value)} placeholder="店名・会社名" />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>内容</label>
          <input type="text" className="input" style={getFieldStyle('description')} value={formData.description} onChange={e => handleChange('description', e.target.value)} placeholder="取引内容" />
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>プロジェクト</label>
        <select className="input select" value={formData.project_id} onChange={e => handleChange('project_id', e.target.value)}>
          <option value="">なし</option>
          {projects.map(p => {
            const div = getDivision(p.division);
            const seqNo = p.seq_no ? `PJ-${String(p.seq_no).padStart(3, '0')}` : '';
            const divNo = p.external_id && div?.prefix ? `${div.prefix}-${String(p.external_id).padStart(3, '0')}` : '';
            return <option key={p.id} value={p.id}>{seqNo ? `[${seqNo}]` : ''}{divNo ? `[${divNo}]` : ''}{p.category ? `【${p.category}】` : ''}{p.name}</option>;
          })}
        </select>
      </div>

      <div>
        <label className="block text-xs mb-1" style={{ color: COLORS.textMuted }}>メモ</label>
        <textarea className="input" rows={2} value={formData.memo} onChange={e => handleChange('memo', e.target.value)} placeholder="備考" />
      </div>

      {formData.receipt_url && (
        <div className="p-3 rounded-lg" style={{ background: `${COLORS.green}10` }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: COLORS.green }}>
            <span>📎</span>
            <a href={formData.receipt_url} target="_blank" rel="noopener noreferrer" className="underline">領収書を表示</a>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={uploading}>{uploading ? 'アップロード中...' : isEdit ? '更新' : '追加'}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
      </div>
    </form>
  );
}
