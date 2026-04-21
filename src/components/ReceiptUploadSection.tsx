'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, Loader2, X, Camera } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// ReceiptUploadSection
// 領収書アップロード（AI抽出 + Google Drive保存）を担うセクション
// TransactionModal 内に配置して利用する
// v0.9.0 で Uploader.tsx の機能を統合
// ═══════════════════════════════════════════════════════════════

export interface ReceiptExtractedData {
  date?: string;
  amount?: number;
  vendor?: string;
  kamoku_hint?: string | null;
  item_name?: string;
  items?: Array<{ name: string; quantity?: number; price?: number }>;
  payment_method?: string;
  tax?: number;
}

interface ReceiptUploadSectionProps {
  defaultOwner: string;
  onExtracted: (data: ReceiptExtractedData) => void;
  onDriveUrlSet: (url: string | null) => void;
  onError?: (message: string) => void;
}

type UploadState = 'idle' | 'reading' | 'uploading' | 'done' | 'error';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

export default function ReceiptUploadSection({
  defaultOwner,
  onExtracted,
  onDriveUrlSet,
  onError,
}: ReceiptUploadSectionProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // プレビューURLのクリーンアップ
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const processFile = useCallback(async (file: File) => {
    // バリデーション
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      const msg = '画像またはPDFファイルを選択してください';
      setErrorMsg(msg);
      setState('error');
      onError?.(msg);
      setTimeout(() => { setState('idle'); setErrorMsg(null); }, 3000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const msg = 'ファイルサイズは10MB以下にしてください';
      setErrorMsg(msg);
      setState('error');
      onError?.(msg);
      setTimeout(() => { setState('idle'); setErrorMsg(null); }, 3000);
      return;
    }

    setErrorMsg(null);
    setState('reading');
    setFileName(file.name);

    // プレビュー用URL
    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    }

    try {
      const base64 = await fileToBase64(file);

      // 1. AI抽出（利用日を先に取得）
      let extracted: ReceiptExtractedData = {};
      let extractedDate = new Date().toISOString().split('T')[0];

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
        if (extracted.date) extractedDate = extracted.date;
      }

      // 2. Google Drive アップロード（利用日ベースのフォルダ）
      setState('uploading');
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          filename: file.name,
          date: extractedDate,
          mimeType: file.type,
          owner: defaultOwner,
        }),
      });

      const uploadResult = await uploadResponse.json();
      const url = uploadResult.success ? (uploadResult.url || null) : null;
      setDriveUrl(url);

      // 呼び出し元に結果を返す
      onExtracted(extracted);
      onDriveUrlSet(url);

      setState('done');

      // 触覚フィードバック
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'アップロードに失敗しました';
      setErrorMsg(msg);
      setState('error');
      onError?.(msg);
      setTimeout(() => { setState('idle'); setErrorMsg(null); }, 3000);
    }
  }, [defaultOwner, onExtracted, onDriveUrlSet, onError]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleReset = () => {
    setState('idle');
    setFileName(null);
    setDriveUrl(null);
    setErrorMsg(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    onDriveUrlSet(null);
  };

  // 添付済み状態
  if (state === 'done' && fileName) {
    return (
      <div className="bg-[#1B4D3E]/5 border border-[#1B4D3E]/20 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Check className="w-4 h-4 text-[#1B4D3E] shrink-0" />
            <span className="text-[11px] font-medium text-[#1B4D3E] truncate">{fileName}</span>
            <span className="text-[10px] text-[#1B4D3E]/70 shrink-0">AI抽出済み</span>
          </div>
          <button onClick={handleReset} type="button" className="p-1 hover:bg-black/5 rounded">
            <X className="w-3.5 h-3.5 text-[#666]" />
          </button>
        </div>
        {previewUrl && (
          <div className="flex justify-center">
            <img src={previewUrl} alt="領収書" className="max-h-32 rounded border border-gray-200" />
          </div>
        )}
        {driveUrl && (
          <a href={driveUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-[#D4A03A] hover:underline block">
            Google Driveで開く
          </a>
        )}
      </div>
    );
  }

  // 処理中
  if (state === 'reading' || state === 'uploading') {
    return (
      <div className="bg-[#FAFAF8] border border-gray-200 rounded-lg p-4 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#D4A03A]" />
        <span className="text-[11px] text-[#666]">
          {state === 'reading' ? 'AI読み取り中...' : 'Driveにアップロード中...'}
        </span>
      </div>
    );
  }

  // エラー
  if (state === 'error' && errorMsg) {
    return (
      <div className="bg-[#C23728]/5 border border-[#C23728]/20 rounded-lg p-3">
        <span className="text-[11px] text-[#C23728]">{errorMsg}</span>
      </div>
    );
  }

  // 初期状態：アップロードボタン
  return (
    <div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="w-full bg-[#FAFAF8] border border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center gap-1.5 hover:border-[#D4A03A] hover:bg-[#FFFBEB] transition-colors"
      >
        <Camera className="w-5 h-5 text-[#999]" />
        <span className="text-[11px] text-[#666] font-medium">領収書を添付（任意）</span>
        <span className="text-[10px] text-[#999]">AIが金額・日付・店名を自動入力します</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
