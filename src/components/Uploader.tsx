'use client';

import { useState, useCallback } from 'react';
import { Upload, Camera, Check, AlertCircle, Loader2 } from 'lucide-react';

interface UploaderProps {
  onUploadComplete?: (result: UploadResult) => void;
}

interface UploadResult {
  receiptId: string;
  fileUrl: string;
  aiExtracted?: {
    vendor?: string;
    date?: string;
    amount?: number;
  };
  confidence?: number;
}

type UploadState = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export function Uploader({ onUploadComplete }: UploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('画像またはPDFファイルを選択してください');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('ファイルサイズは10MB以下にしてください');
      return;
    }

    setError(null);
    setState('uploading');

    try {
      // 1. Google Drive保存
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', file.name);

      const gasUrl = process.env.NEXT_PUBLIC_GAS_URL;
      if (!gasUrl) {
        throw new Error('GAS URLが設定されていません');
      }

      // Base64変換
      const base64 = await fileToBase64(file);
      
      const gasResponse = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({
          action: 'upload',
          fileName: file.name,
          mimeType: file.type,
          data: base64,
        }),
      });

      if (!gasResponse.ok) {
        throw new Error('ファイルの保存に失敗しました');
      }

      const gasResult = await gasResponse.json();
      setState('processing');

      // 2. AI読み取り
      const aiResponse = await fetch('/api/receipts/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          fileUrl: gasResult.url,
        }),
      });

      if (!aiResponse.ok) {
        throw new Error('AI読み取りに失敗しました');
      }

      const result = await aiResponse.json();
      setState('success');

      // 触覚フィードバック
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      onUploadComplete?.(result);

      // 2秒後にリセット
      setTimeout(() => setState('idle'), 2000);

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }, [onUploadComplete]);

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
            <p className="text-sm text-forest font-medium">完了</p>
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
      // data:image/jpeg;base64, の部分を除去
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}
