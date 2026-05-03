'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, Loader2, X, Camera, Plus, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { generateReceiptFilename } from '@/lib/receiptFilename';

// ═══════════════════════════════════════════════════════════════
// ReceiptUploadSection（v0.11.0 全面リニューアル）
// - 1経費に最大10枚
// - アップロード時は「ステージング」状態（Drive保存しない）
// - 登録ボタン押下時に commitReceiptsToDrive() を親から呼ぶ
// - 編集時は initialItems で既存を受け取る
// - 合計金額チェック＋経費金額セットボタン（1円以内=緑）
// ═══════════════════════════════════════════════════════════════

export interface ReceiptExtractedData {
  date?: string;
  amount?: number;
  vendor?: string;
  kamoku_hint?: string | null;
  // v0.15.4: 制作費・取材費と推定された時の内訳タグヒント
  // 値は sub_categories.key (例: 'prod_transport', 'tori_lodging', 'prod_performance' 等)
  sub_category_hint?: string | null;
  item_name?: string;
  items?: Array<{ name: string; quantity?: number; price?: number }>;
  payment_method?: string;
  tax?: number;
  from_station?: string | null;
  to_station?: string | null;
  round_trip?: 'one_way' | 'round_trip' | null;
  carrier?: string | null;
  // v0.30.2: 交通費の追加フィールド(passenger_count・座席クラス・便名)
  passenger_count?: number | string | null;
  transport_class_hint?: string | null;
  flight_train_no_hint?: string | null;
  // v0.39.0: 複数区間の構造化抽出
  trip_legs?: Array<{
    leg_index?: number;
    date?: string | null;
    from?: string | null;
    to?: string | null;
    method?: string | null;
    carrier?: string | null;
    flight_or_train_no?: string | null;
    class_hint?: string | null;
    amount_for_this_leg?: number | null;
  }> | null;
  fare_input_mode_hint?: 'round_trip_total' | 'per_leg' | 'one_way' | null;
  total_amount_includes_all_legs?: boolean | null;
  round_trip_relationship?: 'same_carrier_round_trip' | 'same_carrier_open_jaw' | 'different_carriers' | null;
  // v0.41.0: 追加課金(アップグレード・座席指定・荷物等)
  addon_charges?: Array<{
    charge_index?: number;
    date?: string | null;
    charge_type?: 'upgrade' | 'seat_fee' | 'baggage' | 'lounge' | 'meal' | 'wifi' | 'other' | null;
    amount?: number;
    upgrade_from_class?: string | null;
    upgrade_to_class?: string | null;
    related_leg_from?: string | null;
    related_leg_to?: string | null;
    related_flight_no?: string | null;
    description?: string | null;
  }> | null;
  guest_count?: number | string | null;
  restaurant_type?: string | null;
  model_number?: string | null;
  serial_number?: string | null;
  billing_period_from?: string | null;
  billing_period_to?: string | null;
  next_billing_date?: string | null;
}

export interface ReceiptItem {
  clientId: string;
  staged: boolean;
  fileName: string;
  mimeType: string;
  base64?: string;
  previewUrl?: string;
  dbId?: string;
  driveFileId?: string;
  driveUrl?: string;
  generatedFilename?: string;
  label: string;
  aiExtractedAmount?: number | null;
}

export interface ReceiptFormContext {
  date: string;
  kamokuLabel: string;
  store: string | null;
  owner: string;
  description: string | null;
  totalAmount: number;
}

interface ReceiptUploadSectionProps {
  defaultOwner: string;
  formContext: ReceiptFormContext;
  initialItems?: ReceiptItem[];
  onItemsChange: (items: ReceiptItem[]) => void;
  onExtractedForForm: (data: ReceiptExtractedData) => void;
  onError?: (message: string) => void;
  onSetAmountFromReceipts?: (amount: number) => void;
  maxReceipts?: number; // v0.15.0: 勘定科目による上限制御（travel=10, それ以外=1）
}

const MAX_RECEIPTS_DEFAULT = 10;
const AMOUNT_DIFF_THRESHOLD = 1;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function generateClientId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export default function ReceiptUploadSection({
  defaultOwner,
  formContext,
  initialItems,
  onItemsChange,
  onExtractedForForm,
  onError,
  onSetAmountFromReceipts,
  maxReceipts,
}: ReceiptUploadSectionProps) {
  const MAX_RECEIPTS = maxReceipts ?? MAX_RECEIPTS_DEFAULT;
  const [items, setItems] = useState<ReceiptItem[]>(initialItems || []);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showFilenamePreview, setShowFilenamePreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialItems) setItems(initialItems);
  }, [initialItems]);

  const emitChange = useCallback((next: ReceiptItem[]) => {
    setItems(next);
    onItemsChange(next);
  }, [onItemsChange]);

  useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (items.length >= MAX_RECEIPTS) {
      const msg = MAX_RECEIPTS === 1
        ? 'この勘定科目では領収書は1枚のみ添付できます'
        : `領収書は最大${MAX_RECEIPTS}枚までです`;
      setErrorMsg(msg); onError?.(msg);
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      const msg = '画像またはPDFファイルを選択してください';
      setErrorMsg(msg); onError?.(msg);
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      const msg = 'ファイルサイズは10MB以下にしてください';
      setErrorMsg(msg); onError?.(msg);
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    setErrorMsg(null);
    setProcessingFile(file.name);

    try {
      const base64 = await fileToBase64(file);

      let extracted: ReceiptExtractedData = {};
      try {
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
        }
      } catch {
        // AI失敗は致命的ではない
      }

      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

      const newItem: ReceiptItem = {
        clientId: generateClientId(),
        staged: true,
        fileName: file.name,
        mimeType: file.type,
        base64,
        previewUrl,
        label: '',
        aiExtractedAmount: typeof extracted.amount === 'number' ? extracted.amount : null,
      };

      const next = [...items, newItem];
      emitChange(next);

      if (items.length === 0) {
        onExtractedForForm(extracted);
      }

      setProcessingFile(null);
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '処理に失敗しました';
      setErrorMsg(msg); onError?.(msg);
      setProcessingFile(null);
      setTimeout(() => setErrorMsg(null), 3000);
    }
  }, [items, emitChange, onExtractedForForm, onError]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processFile]);

  const handleLabelChange = useCallback((clientId: string, label: string) => {
    const next = items.map((it) => it.clientId === clientId ? { ...it, label } : it);
    emitChange(next);
  }, [items, emitChange]);

  const handleRemove = useCallback((clientId: string) => {
    const target = items.find((it) => it.clientId === clientId);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    const next = items.filter((it) => it.clientId !== clientId);
    emitChange(next);
  }, [items, emitChange]);

  const receiptSum = items.reduce((sum, it) => sum + (typeof it.aiExtractedAmount === 'number' ? it.aiExtractedAmount : 0), 0);
  const hasAnyAiAmount = items.some((it) => typeof it.aiExtractedAmount === 'number' && it.aiExtractedAmount > 0);
  const diff = formContext.totalAmount - receiptSum;
  const diffAbs = Math.abs(diff);
  const inRange = diffAbs <= AMOUNT_DIFF_THRESHOLD;

  const filenamePreviews = items.map((it, idx) => {
    if (!it.staged) return it.generatedFilename || it.fileName;
    return generateReceiptFilename({
      date: formContext.date,
      kamoku_label: formContext.kamokuLabel,
      store: formContext.store,
      owner: formContext.owner,
      description: formContext.description,
      seq_no: idx + 1,
      label: it.label,
      original_filename: it.fileName,
    });
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-app-text-sub">
          📎 領収書{MAX_RECEIPTS === 1 ? '' : `（${items.length} / ${MAX_RECEIPTS}）`}
        </span>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.clientId} className="bg-app-surface border border-app-line-medium rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="shrink-0">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={`領収書${idx + 1}`} className="w-14 h-14 object-cover rounded border border-app-line-medium" />
                  ) : item.driveUrl ? (
                    <a href={item.driveUrl} target="_blank" rel="noopener noreferrer"
                       className="w-14 h-14 rounded border border-app-line-medium flex items-center justify-center bg-white hover:bg-app-surface">
                      <ExternalLink className="w-5 h-5 text-app-text-sub" />
                    </a>
                  ) : (
                    <div className="w-14 h-14 rounded border border-app-line-medium flex items-center justify-center bg-white">
                      <Check className="w-5 h-5 text-app-green" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-medium text-app-text-strong truncate">{item.fileName}</span>
                    {item.staged ? (
                      <span className="text-[9px] bg-app-warn-strong/20 text-app-warn-deep px-1.5 py-0.5 rounded-full shrink-0 font-medium">未保存</span>
                    ) : (
                      <span className="text-[9px] bg-app-green/10 text-app-green px-1.5 py-0.5 rounded-full shrink-0 font-medium">保存済</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-app-text-mute shrink-0">ラベル:</label>
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => handleLabelChange(item.clientId, e.target.value)}
                      placeholder="例: トモ分（任意）"
                      className="flex-1 text-[11px] px-2 py-1 border border-app-line-medium rounded bg-white focus:outline-none focus:border-app-gold"
                    />
                  </div>

                  {typeof item.aiExtractedAmount === 'number' && item.aiExtractedAmount > 0 && (
                    <div className="text-[10px] text-app-text-sub">AI抽出: ¥{item.aiExtractedAmount.toLocaleString()}</div>
                  )}
                </div>

                <button type="button" onClick={() => handleRemove(item.clientId)}
                        className="p-1 hover:bg-black/5 rounded shrink-0" aria-label="削除">
                  <X className="w-4 h-4 text-app-text-mute" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {processingFile && (
        <div className="bg-app-surface border border-app-line-medium rounded-lg p-3 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-app-gold" />
          <span className="text-[11px] text-app-text-sub">AI読み取り中: {processingFile}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-app-red/5 border border-app-red/20 rounded-lg p-3">
          <span className="text-[11px] text-app-red">{errorMsg}</span>
        </div>
      )}

      {items.length < MAX_RECEIPTS && !processingFile && (
        <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full bg-app-surface border border-dashed border-app-line-strong rounded-lg p-3 flex items-center justify-center gap-1.5 hover:border-app-gold hover:bg-state-warn-bg transition-colors">
          {items.length === 0 ? (
            <>
              <Camera className="w-4 h-4 text-app-text-mute" />
              <span className="text-[11px] text-app-text-sub font-medium">領収書を添付（任意）</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 text-app-text-sub" />
              <span className="text-[11px] text-app-text-sub font-medium">領収書を追加</span>
            </>
          )}
        </button>
      )}

      <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
             onChange={handleFileChange} className="hidden" />

      {items.length >= 2 && hasAnyAiAmount && (
        <div className="bg-white border border-app-line-medium rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-app-text-sub">領収書合計（AI抽出）</span>
            <span className="font-medium text-app-text-strong">¥{receiptSum.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-app-text-sub">経費金額</span>
            <span className="font-medium text-app-text-strong">¥{formContext.totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[11px] pt-1.5 border-t border-app-line">
            <span className="text-app-text-sub">差分</span>
            <span className={`font-medium ${inRange ? 'text-app-green' : 'text-app-gold'}`}>
              {inRange ? '🟢' : '🟡'} ¥{diffAbs.toLocaleString()}{inRange ? '（許容範囲内）' : '（要確認）'}
            </span>
          </div>
          {!inRange && onSetAmountFromReceipts && receiptSum > 0 && (
            <button type="button" onClick={() => onSetAmountFromReceipts(receiptSum)}
                    className="w-full mt-1 text-[11px] bg-app-gold text-white py-1.5 rounded hover:bg-app-gold-hover transition-colors font-medium">
              領収書合計を経費金額にする（¥{receiptSum.toLocaleString()}）
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="border border-app-line-medium rounded-lg overflow-hidden">
          <button type="button" onClick={() => setShowFilenamePreview((v) => !v)}
                  className="w-full px-3 py-2 flex items-center justify-between bg-app-surface hover:bg-app-surface-alt text-[10px] text-app-text-sub transition-colors">
            <span>ファイル名プレビュー</span>
            {showFilenamePreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showFilenamePreview && (
            <div className="p-3 bg-white space-y-1">
              {filenamePreviews.map((name, idx) => (
                <div key={idx} className="text-[10px] text-app-text-sub font-mono break-all">{idx + 1}. {name}</div>
              ))}
              <div className="text-[9px] text-app-text-mute pt-1 border-t border-app-line mt-2">
                ※ 登録ボタン押下時にこの名前でGoogle Driveに保存されます
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 公開ユーティリティ
// ═══════════════════════════════════════════════════════════════

export interface CommitResult {
  ok: boolean;
  savedReceipts: Array<{
    clientId: string;
    dbId?: string;
    driveFileId: string;
    driveUrl: string;
    driveFolderPath: string;
    generatedFilename: string;
    originalFilename: string;
    mimeType: string;
    label: string | null;
    aiExtractedAmount: number | null;
    seqNo: number;
    staged: boolean;
  }>;
  failed: Array<{ clientId: string; fileName: string; error: string }>;
}

export async function commitReceiptsToDrive(
  items: ReceiptItem[],
  formContext: ReceiptFormContext
): Promise<CommitResult> {
  const savedReceipts: CommitResult['savedReceipts'] = [];
  const failed: CommitResult['failed'] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const seqNo = i + 1;

    if (!item.staged) {
      savedReceipts.push({
        clientId: item.clientId,
        dbId: item.dbId,
        driveFileId: item.driveFileId || '',
        driveUrl: item.driveUrl || '',
        driveFolderPath: '',
        generatedFilename: item.generatedFilename || item.fileName,
        originalFilename: item.fileName,
        mimeType: item.mimeType,
        label: item.label || null,
        aiExtractedAmount: item.aiExtractedAmount ?? null,
        seqNo,
        staged: false,
      });
      continue;
    }

    if (!item.base64) {
      failed.push({ clientId: item.clientId, fileName: item.fileName, error: 'ファイルデータが見つかりません' });
      continue;
    }

    const generatedFilename = generateReceiptFilename({
      date: formContext.date,
      kamoku_label: formContext.kamokuLabel,
      store: formContext.store,
      owner: formContext.owner,
      description: formContext.description,
      seq_no: seqNo,
      label: item.label,
      original_filename: item.fileName,
    });

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: item.base64,
          filename: item.fileName,
          date: formContext.date,
          mimeType: item.mimeType,
          owner: formContext.owner,
          generatedFilename,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        failed.push({ clientId: item.clientId, fileName: item.fileName, error: data.error || 'アップロード失敗' });
        continue;
      }

      savedReceipts.push({
        clientId: item.clientId,
        driveFileId: data.fileId,
        driveUrl: data.url,
        driveFolderPath: data.folderPath || data.folder || '',
        generatedFilename: data.fileName || generatedFilename,
        originalFilename: item.fileName,
        mimeType: item.mimeType,
        label: item.label || null,
        aiExtractedAmount: item.aiExtractedAmount ?? null,
        seqNo,
        staged: true,
      });
    } catch (err) {
      failed.push({ clientId: item.clientId, fileName: item.fileName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { ok: failed.length === 0, savedReceipts, failed };
}

export async function trashReceiptsInDrive(driveFileIds: string[]): Promise<void> {
  if (driveFileIds.length === 0) return;
  try {
    await fetch('/api/upload/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: driveFileIds }),
    });
  } catch {
    // ベストエフォート
  }
}
