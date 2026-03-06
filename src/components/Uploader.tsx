'use client';

import { useState, useCallback } from 'react';
import { Upload, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import TransportFields, { EMPTY_TRANSPORT } from '@/components/TransportFields';
import type { TransportData } from '@/components/TransportFields';
import { saveTransportDetails } from '@/lib/transportUtils';

interface UploaderProps {
  onUploadComplete?: () => void;
}

type UploadState = 'idle' | 'uploading' | 'reading' | 'review' | 'saving' | 'success' | 'error';

export function Uploader({ onUploadComplete }: UploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    store: '',
    kamoku: 'misc',
    owner: 'tomo',
    description: '',
  });
  const [transportData, setTransportData] = useState<TransportData>({ ...EMPTY_TRANSPORT });

  const handleFile = useCallback(async (file: File) => {
    // バリデーション
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('画像またはPDFファイルを選択してください');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('ファイルサイズは10MB以下にしてください');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
      return;
    }

    setError(null);
    setState('reading');

    try {
      // Base64変換
      const base64 = await fileToBase64(file);
      setFileName(file.name);

      // ===== 1. AI読み取り（利用日を取得するため先に実行） =====
      let extractedDate = new Date().toISOString().split('T')[0];
      let extracted: any = {};

      const aiResponse = await fetch('/api/receipts/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          fileUrl: '',
          mimeType: file.type,
          fileName: file.name,
        }),
      });

      if (aiResponse.ok) {
        const aiResult = await aiResponse.json();
        extracted = aiResult.aiExtracted || {};
        if (extracted.date) {
          extractedDate = extracted.date;
        }
      }

      // ===== 2. Google Driveに保存（利用日ベースのフォルダ） =====
      setState('uploading');

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          filename: file.name,
          date: extractedDate,
          mimeType: file.type,
        }),
      });

      const uploadResult = await uploadResponse.json();
      if (uploadResult.success) {
        setDriveUrl(uploadResult.url || null);
      }

      // フォームに初期値をセット
      setFormData({
        date: extracted.date || new Date().toISOString().split('T')[0],
        amount: extracted.amount?.toString() || '',
        store: extracted.vendor || '',
        kamoku: guessKamokuId(extracted.vendor),
        owner: 'tomo',
        description: '',
        });
      setState('review');

      // 触覚フィードバック
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }, []);

  // 取引として保存
  const handleSave = async () => {
    if (!formData.amount || !formData.date) {
      setError('日付と金額は必須です');
      return;
    }
    if (formData.kamoku === 'travel' && (!transportData.from_location || !transportData.to_location || !transportData.carrier)) {
      setError('交通費の出発地・到着地・利用会社は必須です');
      return;
    }

    setState('saving');

    try {
      const { data: inserted, error: dbError } = await supabase
        .from('transactions')
        .insert({
          tx_type: 'expense',
          date: formData.date,
          amount: parseInt(formData.amount) || 0,
          kamoku: formData.kamoku,
          division: 'general',
          owner: formData.owner,
          store: formData.store || null,
          description: formData.description || null,
          memo: driveUrl || null,
          source: 'receipt_ai',
          confirmed: true,
        } as any)
        .select('id')
        .single();

      if (dbError) throw dbError;

      // 旅費交通費の場合
      if (formData.kamoku === 'travel' && inserted) {
        await saveTransportDetails((inserted as any).id, transportData);
      }

      setState('success');

      if ('vibrate' in navigator) {
        navigator.vibrate([50, 50, 50]);
      }

      onUploadComplete?.();

      setTimeout(() => {
        resetForm();
      }, 2000);

    } catch (err) {
      console.error('Save error:', err);
      setError('保存に失敗しました');
      setState('error');
      setTimeout(() => setState('review'), 3000);
    }
  };

  const resetForm = () => {
    setState('idle');
    setError(null);
    setDriveUrl(null);
    setFileName(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      store: '',
      kamoku: 'misc',
      owner: 'tomo',
      description: '',
    });
    setTransportData({ ...EMPTY_TRANSPORT });
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  // 勘定科目のオプション（経費のみ）
  const kamokuOptions = Object.entries(KAMOKU)
    .filter(([, v]) => v.type === 'expense')
    .map(([id, v]) => ({ id, name: v.name }));

  // ===== 確認・編集画面 =====
  if (state === 'review' || state === 'saving') {
    return (
      <div className="w-full bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[#1a1a1a]">読み取り結果を確認</h3>
          <button onClick={resetForm} className="p-1 hover:bg-black/5 rounded-full">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {driveUrl && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-[#1B4D3E]/5 rounded-lg">
            <Check className="w-4 h-4 text-[#1B4D3E]" />
            <span className="text-xs text-[#1B4D3E]">Google Driveに保存済み</span>
          </div>
        )}
        {!driveUrl && fileName && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-yellow-50 rounded-lg">
            <AlertCircle className="w-4 h-4 text-yellow-600" />
            <span className="text-xs text-yellow-700">Drive保存スキップ（読み取りは完了）</span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#999] block mb-1">日付</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">金額（税込）</label>
            <input
              type="text"
              inputMode="numeric"
              value={formData.amount ? Number(formData.amount).toLocaleString() : ''}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, '');
                if (/^\d*$/.test(value)) {
                  setFormData({ ...formData, amount: value });
                }
              }}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="15,300"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">取引先</label>
            <input
              type="text"
              value={formData.store}
              onChange={(e) => setFormData({ ...formData, store: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="日本航空"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">勘定科目</label>
            <select
              value={formData.kamoku}
              onChange={(e) => setFormData({ ...formData, kamoku: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              {kamokuOptions.map(k => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          </div>

          {formData.kamoku === 'travel' && (
            <TransportFields data={transportData} onChange={setTransportData} />
          )}

          <div>
            <label className="text-xs text-[#999] block mb-1">担当者</label>
            <select
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">メモ</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="任意"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={state === 'saving' || !formData.amount || !formData.date}
          className="w-full mt-4 py-3 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium
            hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200 flex items-center justify-center gap-2"
        >
          {state === 'saving' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              保存中...
            </>
          ) : (
            '登録する'
          )}
        </button>
      </div>
    );
  }

  // ===== アップロード画面 =====
  return (
    <div className="w-full">
      <label
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center
          w-full py-12 rounded-2xl cursor-pointer
          transition-all duration-300 ease-out
          ${dragActive
            ? 'bg-[#D4A03A]/10 border-2 border-[#D4A03A] scale-[1.01]'
            : 'bg-white border-2 border-dashed border-black/10 hover:border-[#D4A03A]/40 hover:bg-[#D4A03A]/5'
          }
          ${state === 'success' ? 'bg-[#1B4D3E]/5 border-[#1B4D3E]' : ''}
          ${state === 'error' ? 'bg-[#C23728]/5 border-[#C23728]' : ''}
        `}
        style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}
      >
        <input
          type="file"
          className="hidden"
          accept="image/*,application/pdf"
          onChange={handleChange}
          disabled={state !== 'idle'}
        />

        {state === 'idle' && (
          <>
            <div className="w-12 h-12 rounded-full bg-[#D4A03A]/10 flex items-center justify-center mb-3">
              <Upload className="w-5 h-5 text-[#D4A03A]" />
            </div>
            <p className="text-sm text-[#1a1a1a]">
              領収書をドロップ
            </p>
            <p className="text-xs text-[#999] mt-1">
              PDF · JPG · PNG · HEIC
            </p>
          </>
        )}

        {state === 'uploading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[#D4A03A] animate-spin mb-2" />
            <p className="text-sm text-[#6b6b6b]">Google Driveに保存中...</p>
          </div>
        )}

        {state === 'reading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-[#D4A03A] animate-spin mb-2" />
            <p className="text-sm text-[#6b6b6b]">AI読み取り中...</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#1B4D3E] flex items-center justify-center mb-2">
              <Check className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm text-[#1B4D3E] font-medium">登録完了</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center">
            <AlertCircle className="w-8 h-8 text-[#C23728] mb-2" />
            <p className="text-sm text-[#C23728]">{error}</p>
          </div>
        )}
      </label>
    </div>
  );
}

// ===== ユーティリティ =====

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

function guessKamokuId(vendor?: string): string {
  if (!vendor) return 'misc';
  const v = vendor.toLowerCase();
  if (v.includes('航空') || v.includes('鉄道') || v.includes('jr') || v.includes('タクシー') || v.includes('バス')) return 'travel';
  if (v.includes('ホテル') || v.includes('旅館') || v.includes('inn') || v.includes('hotel')) return 'travel';
  if (v.includes('amazon') || v.includes('ヨドバシ') || v.includes('ビック')) return 'equipment';
  if (v.includes('ntt') || v.includes('docomo') || v.includes('au') || v.includes('softbank')) return 'communication';
  if (v.includes('スタバ') || v.includes('starbucks') || v.includes('ドトール') || v.includes('タリーズ')) return 'entertainment';
  return 'misc';
}
