'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/constants';

interface ExtractedData {
  date?: string;
  amount?: number;
  store?: string;
  kamoku?: string;
  division?: string;
}

export default function ReceiptUploader() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('画像またはPDFファイルをアップロードしてください');
      return;
    }

    await processFile(file);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    await processFile(files[0]);
  }, []);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      // ファイルをBase64に変換
      const base64 = await fileToBase64(file);

      // Claude APIで読み取り
      const response = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: file.type.startsWith('image/') ? file.type : 'image/png',
                  data: base64.split(',')[1],
                },
              },
              {
                type: 'text',
                text: `この領収書/レシートを読み取って、以下の形式でJSONのみを返してください：
{
  "date": "YYYY-MM-DD形式の日付",
  "amount": 税込金額（数値のみ）,
  "store": "店名・会社名（地名は除く。例：日本航空、JR東日本、セブンイレブン）",
  "kamoku": "勘定科目（旅費交通費/消耗品費/通信費/接待交際費/外注費/広告宣伝費/地代家賃/事務用品費/新聞図書費/雑費のいずれか）",
  "division": "推定される事業部門（data/business/editorial/thisplace/youtube/generalのいずれか）"
}
JSON以外の説明は不要です。`,
              },
            ],
          }],
        }),
      });

      if (!response.ok) {
        throw new Error('AI読み取りに失敗しました');
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      // JSONを抽出
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('読み取り結果を解析できませんでした');
      }

      const extracted: ExtractedData = JSON.parse(jsonMatch[0]);

      // Google Driveに保存（GAS経由）
      const gasUrl = localStorage.getItem('gasUrl');
      if (gasUrl) {
        try {
          await fetch(gasUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
              action: 'uploadReceipt',
              fileName: `${extracted.date || new Date().toISOString().slice(0, 10)}_${extracted.store || 'unknown'}_${extracted.amount || 0}円.${file.name.split('.').pop()}`,
              fileData: base64.split(',')[1],
              mimeType: file.type,
            }),
          });
        } catch (e) {
          console.error('Drive保存エラー:', e);
        }
      }

      // 取引追加ページに遷移（パラメータで読み取り結果を渡す）
      const params = new URLSearchParams();
      if (extracted.date) params.set('date', extracted.date);
      if (extracted.amount) params.set('amount', String(extracted.amount));
      if (extracted.store) params.set('store', extracted.store);
      if (extracted.kamoku) params.set('kamoku', extracted.kamoku);
      if (extracted.division) params.set('division', extracted.division);
      params.set('source', 'uploader');

      router.push(`/transactions?${params.toString()}`);
    } catch (err) {
      console.error('処理エラー:', err);
      setError(err instanceof Error ? err.message : '処理中にエラーが発生しました');
    } finally {
      setIsProcessing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
        isDragging ? 'scale-[1.02]' : ''
      }`}
      style={{
        borderColor: isDragging ? COLORS.green : COLORS.border,
        background: isDragging ? 'rgba(27,77,62,0.05)' : 'white',
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById('receipt-input')?.click()}
    >
      <input
        id="receipt-input"
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      {isProcessing ? (
        <div className="py-4">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: COLORS.green, borderTopColor: 'transparent' }} />
          <div className="text-sm" style={{ color: COLORS.textSecondary }}>AI読み取り中...</div>
        </div>
      ) : (
        <>
          <div className="text-4xl mb-3">📄</div>
          <div className="text-sm font-medium" style={{ color: COLORS.textPrimary }}>
            領収書をドラッグ＆ドロップ
          </div>
          <div className="text-xs mt-1" style={{ color: COLORS.textSecondary }}>
            またはクリックしてファイルを選択
          </div>
          <div className="text-xs mt-2" style={{ color: COLORS.textSecondary }}>
            AI が日付・金額・店名・科目を自動入力
          </div>
        </>
      )}

      {error && (
        <div className="mt-3 text-sm" style={{ color: COLORS.crimson }}>
          {error}
        </div>
      )}
    </div>
  );
}
