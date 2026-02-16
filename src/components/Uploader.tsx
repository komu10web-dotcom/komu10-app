'use client';

import { useState, useCallback } from 'react';
import { Upload, Camera, Check, AlertCircle, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface UploaderProps {
  onUploadComplete?: () => void;
}

interface ExtractedData {
  vendor?: string;
  date?: string;
  amount?: number;
  tax?: number;
  payment_method?: string;
}

type UploadState = 'idle' | 'uploading' | 'processing' | 'review' | 'saving' | 'success' | 'error';

export function Uploader({ onUploadComplete }: UploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  // フォーム編集用
  const [formData, setFormData] = useState({
    date: '',
    amount: '',
    store: '',
    kamoku: '旅費交通費',
    division: 'general',
    owner: 'tomo',
    description: '',
  });

  const handleFile = useCallback(async (file: File) => {
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
    setState('uploading');

    try {
      // Base64変換
      const base64 = await fileToBase64(file);
      
      setState('processing');

      // 1. AI読み取り（先に実行）
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

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json();
        throw new Error(errorData.details || 'AI読み取りに失敗しました');
      }

      const result = await aiResponse.json();
      
      // 2. Google Drive保存（AI結果を使ってファイル名生成）
      const gasUrl = process.env.NEXT_PUBLIC_GAS_URL;
      let driveUrl = '';
      
      console.log('GAS URL:', gasUrl);
      
      if (gasUrl) {
        try {
          console.log('Sending to GAS:', {
            action: 'uploadReceipt',
            filename: file.name,
            date: result.aiExtracted?.date,
            store: result.aiExtracted?.vendor,
            amount: result.aiExtracted?.amount,
          });
          
          const response = await fetch(gasUrl, {
            method: 'POST',
            body: JSON.stringify({
              action: 'uploadReceipt',
              image: base64,
              filename: file.name,
              date: result.aiExtracted?.date || new Date().toISOString().split('T')[0],
              store: result.aiExtracted?.vendor || '',
              amount: result.aiExtracted?.amount || 0,
            }),
          });

          console.log('GAS response status:', response.status);
          const gasResult = await response.json();
          console.log('GAS result:', gasResult);
          
          if (gasResult.success && gasResult.url) {
            driveUrl = gasResult.url;
          }
        } catch (gasError) {
          console.error('GAS upload failed:', gasError);
          // GAS失敗してもAI読み取り結果は使える
        }
      } else {
        console.warn('GAS URL not configured');
      }
      
      // 読み取り結果をセット
      setExtracted(result.aiExtracted);
      setReceiptId(result.receiptId);
      setFileUrl(driveUrl);
      
      // フォームに初期値をセット
      setFormData({
        date: result.aiExtracted?.date || new Date().toISOString().split('T')[0],
        amount: result.aiExtracted?.amount?.toString() || '',
        store: result.aiExtracted?.vendor || '',
        kamoku: guessKamoku(result.aiExtracted?.vendor),
        division: 'general',
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
    setState('saving');
    
    try {
      const { error } = await (supabase.from('transactions') as any).insert({
        tx_type: 'expense',
        date: formData.date,
        amount: parseInt(formData.amount) || 0,
        kamoku: formData.kamoku,
        division: formData.division,
        owner: formData.owner,
        store: formData.store,
        description: formData.description,
        source: 'uploader',
        confirmed: true,
      });

      if (error) throw error;

      setState('success');
      
      // 触覚フィードバック
      if ('vibrate' in navigator) {
        navigator.vibrate([50, 50, 50]);
      }

      onUploadComplete?.();

      // 2秒後にリセット
      setTimeout(() => {
        setState('idle');
        setExtracted(null);
        setFormData({
          date: '',
          amount: '',
          store: '',
          kamoku: '旅費交通費',
          division: 'general',
          owner: 'tomo',
          description: '',
        });
      }, 2000);

    } catch (err) {
      console.error('Save error:', err);
      setError('保存に失敗しました');
      setState('error');
      setTimeout(() => setState('review'), 3000);
    }
  };

  // キャンセル
  const handleCancel = () => {
    setState('idle');
    setExtracted(null);
    setError(null);
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

  // レビュー画面
  if (state === 'review' || state === 'saving') {
    return (
      <div className="w-full bg-white rounded-2xl p-5 border border-black/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-black/80">読み取り結果を確認</h3>
          <button onClick={handleCancel} className="p-1 hover:bg-black/5 rounded-full">
            <X className="w-4 h-4 text-black/40" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-black/40 block mb-1">日付</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 bg-surface rounded-lg text-sm border-0 focus:ring-2 focus:ring-gold/50"
            />
          </div>

          <div>
            <label className="text-xs text-black/40 block mb-1">金額（円）※税込</label>
            <input
              type="text"
              value={formData.amount ? Number(formData.amount).toLocaleString() : ''}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, '');
                if (/^\d*$/.test(value)) {
                  setFormData({ ...formData, amount: value });
                }
              }}
              className="w-full px-3 py-2 bg-surface rounded-lg text-sm border-0 focus:ring-2 focus:ring-gold/50"
              placeholder="15,300"
            />
          </div>

          <div>
            <label className="text-xs text-black/40 block mb-1">取引先</label>
            <input
              type="text"
              value={formData.store}
              onChange={(e) => setFormData({ ...formData, store: e.target.value })}
              className="w-full px-3 py-2 bg-surface rounded-lg text-sm border-0 focus:ring-2 focus:ring-gold/50"
              placeholder="日本航空"
            />
          </div>

          <div>
            <label className="text-xs text-black/40 block mb-1">勘定科目</label>
            <select
              value={formData.kamoku}
              onChange={(e) => setFormData({ ...formData, kamoku: e.target.value })}
              className="w-full px-3 py-2 bg-surface rounded-lg text-sm border-0 focus:ring-2 focus:ring-gold/50"
            >
              <option value="旅費交通費">旅費交通費</option>
              <option value="消耗品費">消耗品費</option>
              <option value="通信費">通信費</option>
              <option value="接待交際費">接待交際費</option>
              <option value="会議費">会議費</option>
              <option value="広告宣伝費">広告宣伝費</option>
              <option value="外注費">外注費</option>
              <option value="地代家賃">地代家賃</option>
              <option value="水道光熱費">水道光熱費</option>
              <option value="雑費">雑費</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-black/40 block mb-1">担当者</label>
            <select
              value={formData.owner}
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
              className="w-full px-3 py-2 bg-surface rounded-lg text-sm border-0 focus:ring-2 focus:ring-gold/50"
            >
              <option value="tomo">tomo</option>
              <option value="toshiki">toshiki</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={state === 'saving' || !formData.amount}
          className="w-full mt-4 py-3 bg-gold text-white rounded-xl font-medium
            hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed
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

  return (
    <div className="w-full">
      <label
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center
          w-full h-40 rounded-2xl cursor-pointer
          transition-all duration-300 ease-out
          ${dragActive 
            ? 'bg-gold/10 border-2 border-gold scale-[1.02]' 
            : 'bg-white border-2 border-dashed border-black/10 hover:border-gold/50 hover:bg-gold/5'
          }
          ${state === 'success' ? 'bg-forest/10 border-forest' : ''}
          ${state === 'error' ? 'bg-crimson/10 border-crimson' : ''}
        `}
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
            <div className="flex items-center gap-4 mb-3">
              <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-gold" />
              </div>
              <div className="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center">
                <Camera className="w-5 h-5 text-gold" />
              </div>
            </div>
            <p className="text-sm text-black/60">
              領収書をドロップ、または
              <span className="text-gold font-medium">選択</span>
            </p>
          </>
        )}

        {state === 'uploading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-gold animate-spin mb-2" />
            <p className="text-sm text-black/60">保存中...</p>
          </div>
        )}

        {state === 'processing' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 text-gold animate-spin mb-2" />
            <p className="text-sm text-black/60">AI読み取り中...</p>
          </div>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-forest flex items-center justify-center mb-2">
              <Check className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm text-forest font-medium">登録完了</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center">
            <AlertCircle className="w-8 h-8 text-crimson mb-2" />
            <p className="text-sm text-crimson">{error}</p>
          </div>
        )}
      </label>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// 店舗名から勘定科目を推測
function guessKamoku(vendor?: string): string {
  if (!vendor) return '雑費';
  const v = vendor.toLowerCase();
  if (v.includes('航空') || v.includes('鉄道') || v.includes('jr') || v.includes('タクシー')) return '旅費交通費';
  if (v.includes('ホテル') || v.includes('旅館') || v.includes('inn')) return '旅費交通費';
  if (v.includes('amazon') || v.includes('ヨドバシ') || v.includes('ビック')) return '消耗品費';
  if (v.includes('ntt') || v.includes('docomo') || v.includes('au') || v.includes('softbank')) return '通信費';
  return '雑費';
}
