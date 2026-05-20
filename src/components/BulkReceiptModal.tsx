'use client';

// ═══════════════════════════════════════════════════════════════
// BulkReceiptModal（v0.19.0 - Z案）
// 複数領収書をAIで個別解析→行リストで部門・PJ確認→一括登録
// 1領収書 = 1取引を堅持。Y案(v0.11.0)と棲み分け。
// ═══════════════════════════════════════════════════════════════

import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, Loader2, Check, AlertCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS, KAMOKU_INPUT_GUIDE, UNASSIGNED_PROJECT_VALUE, UNASSIGNED_PROJECT_LABEL } from '@/types/database';
import type { Project } from '@/types/database';
import { commitReceiptsToDrive, type ReceiptItem } from './ReceiptUploadSection';
import { useTestMode } from '@/lib/useTestMode';

const MAX_FILES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface BulkReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultOwner: string;
  projects: Project[];
}

interface BulkRow {
  clientId: string;
  fileName: string;
  mimeType: string;
  base64: string;
  // AI解析状態
  status: 'analyzing' | 'ready' | 'saving' | 'saved' | 'failed';
  errorMessage?: string;
  // 編集可能フィールド
  date: string;
  store: string;
  amount: number;
  kamoku: string;
  description: string;
  owner: string;
  division: string;
  projectId: string; // '' or projectId or UNASSIGNED_PROJECT_VALUE
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('ファイル読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}

function generateClientId(): string {
  return `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// AI推定科目を内部キーへマッピング（既存ReceiptUploadSectionの慣習踏襲）
function mapKamokuHint(hint: string | null | undefined): string {
  if (!hint) return 'misc';
  const valid = Object.keys(KAMOKU);
  if (valid.includes(hint)) return hint;
  return 'misc';
}

export default function BulkReceiptModal({
  isOpen,
  onClose,
  onSaved,
  defaultOwner,
  projects,
}: BulkReceiptModalProps) {
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // v0.52.0: テストモード(経費INSERTにis_test付与)
  const { isTestMode } = useTestMode();

  // ── ファイル投入 → AI並列解析 ──
  const processFiles = useCallback(async (files: File[]) => {
    if (rows.length + files.length > MAX_FILES) {
      setGlobalError(`一度に取り込めるのは ${MAX_FILES} 枚までです`);
      return;
    }

    // 1. バリデーション + 行追加(analyzing状態)
    const newRows: BulkRow[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        setGlobalError(`${file.name} は画像またはPDFではありません`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setGlobalError(`${file.name} はサイズが大きすぎます(10MB以下)`);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        newRows.push({
          clientId: generateClientId(),
          fileName: file.name,
          mimeType: file.type,
          base64,
          status: 'analyzing',
          date: new Date().toISOString().split('T')[0],
          store: '',
          amount: 0,
          kamoku: 'misc',
          description: '',
          owner: defaultOwner,
          division: 'general',
          projectId: '',
        });
      } catch {
        setGlobalError(`${file.name} の読み込みに失敗しました`);
      }
    }

    if (newRows.length === 0) return;

    setRows(prev => [...prev, ...newRows]);
    setGlobalError(null);

    // 2. 並列AI解析(各行を独立)
    await Promise.all(
      newRows.map(async (row) => {
        try {
          const res = await fetch('/api/receipts/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: row.base64,
              fileUrl: '',
              mimeType: row.mimeType,
              fileName: row.fileName,
            }),
          });

          if (!res.ok) throw new Error('AI解析失敗');
          const data = await res.json();
          const ext = data.aiExtracted || {};

          setRows(prev => prev.map(r => r.clientId === row.clientId ? {
            ...r,
            status: 'ready' as const,
            date: ext.date || r.date,
            store: ext.vendor || '',
            amount: typeof ext.amount === 'number' ? ext.amount : 0,
            kamoku: mapKamokuHint(ext.kamoku_hint),
            description: ext.item_name || '',
          } : r));
        } catch (err) {
          setRows(prev => prev.map(r => r.clientId === row.clientId ? {
            ...r,
            status: 'failed' as const,
            errorMessage: err instanceof Error ? err.message : 'AI解析に失敗しました',
          } : r));
        }
      })
    );
  }, [rows.length, defaultOwner]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [processFiles]);

  const updateRow = useCallback((clientId: string, patch: Partial<BulkRow>) => {
    setRows(prev => prev.map(r => r.clientId === clientId ? { ...r, ...patch } : r));
  }, []);

  const removeRow = useCallback((clientId: string) => {
    setRows(prev => prev.filter(r => r.clientId !== clientId));
  }, []);

  // ── バリデーション ──
  function validateRow(row: BulkRow): string | null {
    if (row.status !== 'ready') return null; // 未解析・失敗・保存済はスキップ
    if (!row.date) return '日付が未入力です';
    if (!row.amount || row.amount <= 0) return '金額が未入力です';
    if (!row.kamoku) return '科目が未選択です';
    if (!row.division) return '部門が未選択です';
    const guide = KAMOKU_INPUT_GUIDE[row.kamoku];
    if (guide?.requireProject && !row.projectId) return '案件(PJ)が未選択です';
    if (guide?.requireDescription && !row.description.trim()) return '内容が未入力です';
    return null;
  }

  // ── 一括登録 ──
  const handleBulkSave = useCallback(async () => {
    if (!supabase) return;
    setBulkSaving(true);
    setGlobalError(null);

    const targetRows = rows.filter(r => r.status === 'ready');
    if (targetRows.length === 0) {
      setGlobalError('登録できる行がありません');
      setBulkSaving(false);
      return;
    }

    // 1. バリデーション
    const errors: string[] = [];
    for (const row of targetRows) {
      const err = validateRow(row);
      if (err) errors.push(`${row.fileName}: ${err}`);
    }
    if (errors.length > 0) {
      setGlobalError(`未入力項目があります(${errors.length}件)。各行を確認してください`);
      setBulkSaving(false);
      return;
    }

    // 2. 各行を順次保存(transactions → Drive → expense_receipts)
    for (const row of targetRows) {
      try {
        updateRow(row.clientId, { status: 'saving' });

        // project_id の解決(UNASSIGNED → null)
        const projectIdToSave = row.projectId === UNASSIGNED_PROJECT_VALUE || !row.projectId
          ? null
          : row.projectId;

        // 2-1. transactions INSERT
        const txInsert = {
          tx_type: 'expense' as const,
          date: row.date,
          amount: row.amount,
          kamoku: row.kamoku,
          division: row.division,
          owner: row.owner,
          store: row.store || null,
          description: row.description || null,
          memo: null,
          item_description: null,
          project_id: projectIdToSave,
          tags: null,
          revenue_type: null,
          contract_type_id: null,
          business_domain: null,
          source: 'receipt_ai',
          ai_confidence: null,
          confirmed: true,
          external_id: null,
          status: 'settled',
          accrual_date: null,
          expected_payment_date: null,
          actual_payment_date: row.date,
          client_id: null,
          payment_method: null,
          bank_account_id: null,
          invoice_id: null,
          sub_category: null,
          is_test: isTestMode, // v0.52.0: テストモードフラグ
        };

        const { data: inserted, error: txErr } = await supabase
          .from('transactions')
          .insert(txInsert as any)
          .select('id')
          .single();

        if (txErr || !inserted) throw new Error(`取引登録失敗: ${txErr?.message || '不明'}`);
        const txId = (inserted as any).id as string;

        // 2-2. Drive保存(commitReceiptsToDriveを単一アイテムで流用)
        const receiptItem: ReceiptItem = {
          clientId: row.clientId,
          staged: true,
          fileName: row.fileName,
          mimeType: row.mimeType,
          base64: row.base64,
          label: '',
          aiExtractedAmount: row.amount,
        };

        const commitResult = await commitReceiptsToDrive([receiptItem], {
          date: row.date,
          kamokuLabel: KAMOKU[row.kamoku as keyof typeof KAMOKU]?.name || row.kamoku,
          store: row.store || null,
          owner: row.owner,
          description: row.description || null,
          totalAmount: row.amount,
        });

        // 2-3. expense_receipts INSERT
        if (commitResult.savedReceipts.length > 0) {
          const r = commitResult.savedReceipts[0];
          await supabase.from('expense_receipts' as any).insert({
            transaction_id: txId,
            seq_no: 1,
            label: null,
            drive_file_id: r.driveFileId,
            drive_url: r.driveUrl,
            drive_folder_path: r.driveFolderPath || null,
            generated_filename: r.generatedFilename,
            original_filename: r.originalFilename,
            mime_type: r.mimeType,
            ai_extracted_amount: r.aiExtractedAmount,
          });
        }

        if (commitResult.failed.length > 0) {
          // Drive保存失敗はwarning扱い(取引は登録済)
          console.warn('Drive upload failed for', row.fileName, commitResult.failed);
        }

        updateRow(row.clientId, { status: 'saved' });
      } catch (err) {
        updateRow(row.clientId, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : '保存に失敗しました',
        });
      }
    }

    setBulkSaving(false);
    onSaved();
  }, [rows, updateRow, onSaved]);

  const handleClose = useCallback(() => {
    if (bulkSaving) return; // 保存中は閉じない
    setRows([]);
    setGlobalError(null);
    onClose();
  }, [bulkSaving, onClose]);

  if (!isOpen) return null;

  const readyCount = rows.filter(r => r.status === 'ready').length;
  const analyzingCount = rows.filter(r => r.status === 'analyzing').length;
  const savedCount = rows.filter(r => r.status === 'saved').length;
  const failedCount = rows.filter(r => r.status === 'failed').length;
  const allDone = rows.length > 0 && rows.every(r => r.status === 'saved' || r.status === 'failed');

  // 経費科目のみ(売上は除外)
  const expenseKamokus = Object.entries(KAMOKU).filter(
    ([, v]) => (v as any).type === 'expense' && !(v as any).internal
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* ── ヘッダー ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-line shrink-0">
          <div>
            <h2 className="text-base font-medium text-app-text">領収書をまとめて取り込み</h2>
            <p className="text-[11px] text-app-text-mute mt-0.5">複数の領収書をAIで一気に読み取り・登録します</p>
          </div>
          <button
            onClick={handleClose}
            disabled={bulkSaving}
            className="p-2 hover:bg-app-surface-alt rounded-lg transition-colors disabled:opacity-30"
          >
            <X className="w-4 h-4 text-app-text-sub" />
          </button>
        </div>

        {/* ── 4ステップフロー(現在地呼吸・s90 ハンドオフ・v0.45.0 復元) ── */}
        <BulkStepFlow
          rowsCount={rows.length}
          analyzingCount={analyzingCount}
          readyCount={readyCount}
          savingCount={rows.filter(r => r.status === 'saving').length}
          savedCount={savedCount}
          allDone={allDone}
        />

        {/* ── コンテンツ ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* アップロードエリア */}
          {!allDone && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                isDragging ? 'border-app-gold bg-state-gold-soft' : 'border-app-line-medium bg-app-surface'
              }`}
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-app-text-mute" />
              <p className="text-xs text-app-text-sub mb-2">
                領収書をドラッグ&ドロップ、または
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={bulkSaving || rows.length >= MAX_FILES}
                className="text-xs text-app-text underline hover:no-underline disabled:opacity-30"
              >
                ファイルを選択
              </button>
              <p className="text-[10px] text-app-text-fade mt-2">
                画像/PDF・最大{MAX_FILES}枚・1枚10MB以下
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* グローバルエラー */}
          {globalError && (
            <div className="bg-state-error-bg border border-state-error-line rounded-lg px-3 py-2">
              <p className="text-xs text-app-red">{globalError}</p>
            </div>
          )}

          {/* 行リスト */}
          {rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.clientId}
                  className={`rounded-xl p-3 ${
                    row.status === 'failed' ? 'bg-state-error-bg' :
                    row.status === 'saved' ? 'bg-state-success-bg' :
                    'bg-app-surface'
                  }`}
                >
                  {/* 行ヘッダー(ステータス + ファイル名) */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {row.status === 'analyzing' && <Loader2 className="w-3 h-3 animate-spin text-app-text-mute shrink-0" />}
                      {row.status === 'ready' && <div className="w-2 h-2 rounded-full bg-app-gold shrink-0" />}
                      {row.status === 'saving' && <Loader2 className="w-3 h-3 animate-spin text-app-green shrink-0" />}
                      {row.status === 'saved' && <Check className="w-3 h-3 text-app-green shrink-0" />}
                      {row.status === 'failed' && <AlertCircle className="w-3 h-3 text-app-red shrink-0" />}
                      <span className="text-[11px] text-app-text-sub truncate">{row.fileName}</span>
                    </div>
                    {(row.status === 'ready' || row.status === 'failed' || row.status === 'analyzing') && !bulkSaving && (
                      <button
                        onClick={() => removeRow(row.clientId)}
                        className="p-1 hover:bg-black/5 rounded"
                      >
                        <Trash2 className="w-3 h-3 text-app-text-mute" />
                      </button>
                    )}
                  </div>

                  {/* 解析中・保存中 */}
                  {(row.status === 'analyzing' || row.status === 'saving') && (
                    <p className="text-[11px] text-app-text-mute">
                      {row.status === 'analyzing' ? 'AI解析中...' : '保存中...'}
                    </p>
                  )}

                  {/* 失敗 */}
                  {row.status === 'failed' && (
                    <p className="text-[11px] text-app-red">{row.errorMessage || 'エラーが発生しました'}</p>
                  )}

                  {/* 保存済 */}
                  {row.status === 'saved' && (
                    <p className="text-[11px] text-app-green">登録しました ¥{row.amount.toLocaleString()}</p>
                  )}

                  {/* 編集可能フィールド */}
                  {row.status === 'ready' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-app-text-mute block mb-0.5">日付</label>
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) => updateRow(row.clientId, { date: e.target.value })}
                            className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-app-text-mute block mb-0.5">金額</label>
                          <input
                            type="number"
                            value={row.amount || ''}
                            onChange={(e) => updateRow(row.clientId, { amount: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white tabular-nums"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-app-text-mute block mb-0.5">取引先</label>
                        <input
                          type="text"
                          value={row.store}
                          onChange={(e) => updateRow(row.clientId, { store: e.target.value })}
                          className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white"
                          placeholder="店名・会社名"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-app-text-mute block mb-0.5">科目</label>
                          <select
                            value={row.kamoku}
                            onChange={(e) => updateRow(row.clientId, { kamoku: e.target.value })}
                            className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white"
                          >
                            {expenseKamokus.map(([key, def]) => (
                              <option key={key} value={key}>{(def as any).name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-app-text-mute block mb-0.5">担当者</label>
                          <select
                            value={row.owner}
                            onChange={(e) => updateRow(row.clientId, { owner: e.target.value })}
                            className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white"
                          >
                            <option value="tomo">tomo</option>
                            <option value="toshiki">toshiki</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-app-text-mute block mb-0.5">部門</label>
                          <select
                            value={row.division}
                            onChange={(e) => updateRow(row.clientId, { division: e.target.value })}
                            className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white"
                          >
                            {Object.entries(DIVISIONS).map(([key, def]) => (
                              <option key={key} value={key}>{def.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-app-text-mute block mb-0.5">
                            案件{KAMOKU_INPUT_GUIDE[row.kamoku]?.requireProject ? ' *' : ''}
                          </label>
                          <select
                            value={row.projectId}
                            onChange={(e) => updateRow(row.clientId, { projectId: e.target.value })}
                            className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white"
                          >
                            <option value="">—</option>
                            {KAMOKU_INPUT_GUIDE[row.kamoku]?.requireProject && (
                              <option value={UNASSIGNED_PROJECT_VALUE}>{UNASSIGNED_PROJECT_LABEL}</option>
                            )}
                            {projects.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {KAMOKU_INPUT_GUIDE[row.kamoku]?.requireDescription && (
                        <div>
                          <label className="text-[10px] text-app-text-mute block mb-0.5">内容 *</label>
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => updateRow(row.clientId, { description: e.target.value })}
                            className="w-full text-xs px-2 py-1.5 border border-app-line-medium rounded bg-white"
                            placeholder={KAMOKU_INPUT_GUIDE[row.kamoku]?.example || ''}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── フッター ── */}
        <div className="px-5 py-3 border-t border-app-line shrink-0 bg-white">
          {rows.length > 0 && (
            <div className="flex items-center justify-between mb-2 text-[11px] text-app-text-sub">
              <div className="flex items-center gap-3">
                {analyzingCount > 0 && <span>解析中 {analyzingCount}</span>}
                {readyCount > 0 && <span className="text-app-gold">登録待ち {readyCount}</span>}
                {savedCount > 0 && <span className="text-app-green">登録済 {savedCount}</span>}
                {failedCount > 0 && <span className="text-app-red">失敗 {failedCount}</span>}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={bulkSaving}
              className="flex-1 py-2.5 text-xs text-app-text-sub bg-app-surface-alt rounded-lg hover:bg-app-surface-hover transition-colors disabled:opacity-30"
            >
              {allDone ? '閉じる' : 'キャンセル'}
            </button>
            <button
              onClick={handleBulkSave}
              disabled={bulkSaving || readyCount === 0}
              className="flex-1 py-2.5 text-xs text-white bg-app-button rounded-lg hover:bg-app-button-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {bulkSaving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  登録中...
                </>
              ) : (
                <>すべて登録 {readyCount > 0 && `(${readyCount})`}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// BulkStepFlow — 4ステップフロー(現在地呼吸・Step Glyph 4.2 作例3 系譜)
// canon-brand 第2部 Step Glyph 別冊 §3.4(進行状態は明度・透明度で示す)
// 現在地のみ stroke 14・他は stroke 6 (作例3 規定)
// ============================================================

interface BulkStepFlowProps {
  rowsCount: number;
  analyzingCount: number;
  readyCount: number;
  savingCount: number;
  savedCount: number;
  allDone: boolean;
}

type FlowStep = 'upload' | 'analyze' | 'review' | 'done';

function BulkStepFlow({
  rowsCount,
  analyzingCount,
  readyCount,
  savingCount,
  savedCount,
  allDone,
}: BulkStepFlowProps) {
  // 現在地判定
  let currentStep: FlowStep = 'upload';
  if (allDone) currentStep = 'done';
  else if (savingCount > 0 || (readyCount > 0 && savedCount > 0)) currentStep = 'review';
  else if (rowsCount > 0 && analyzingCount > 0) currentStep = 'analyze';
  else if (rowsCount > 0 && readyCount > 0) currentStep = 'review';
  else if (rowsCount > 0) currentStep = 'analyze';

  const steps: { key: FlowStep; label: string }[] = [
    { key: 'upload',  label: 'アップロード' },
    { key: 'analyze', label: 'AI 解析' },
    { key: 'review',  label: '確認' },
    { key: 'done',    label: '登録完了' },
  ];

  const stepOrder: Record<FlowStep, number> = { upload: 0, analyze: 1, review: 2, done: 3 };
  const currentIdx = stepOrder[currentStep];

  return (
    <div className="px-5 py-3 border-b border-app-line bg-app-surface-alt/40 shrink-0">
      <div className="flex items-center justify-between gap-2">
        {steps.map((step, idx) => {
          const isComplete = idx < currentIdx;
          const isCurrent  = idx === currentIdx;
          const stroke     = isCurrent ? 14 : 6;
          // 色: 完了=Black 100%・現在=Gold・未来=Black 25%
          const color =
            isCurrent  ? '#B8893A' :
            isComplete ? '#0A0A0B' :
                         'rgba(10,10,11,0.25)';
          const labelColor =
            isCurrent  ? 'text-app-gold font-medium' :
            isComplete ? 'text-app-text' :
                         'text-app-text-mute';
          return (
            <React.Fragment key={step.key}>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={isCurrent ? 'animate-bulk-step-pulse' : ''}
                  style={{ display: 'inline-flex', flexShrink: 0 }}
                  aria-hidden="true"
                >
                  <svg width={20} height={20} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                    <g stroke={color} strokeWidth={stroke} strokeLinecap="butt" fill="none">
                      <line x1="50" y1="50" x2="92" y2="92" />
                      <line x1="150" y1="50" x2="108" y2="92" />
                      <line x1="50" y1="150" x2="92" y2="108" />
                      <line x1="150" y1="150" x2="108" y2="108" />
                    </g>
                  </svg>
                </span>
                <span className={`text-[11px] tracking-wide truncate ${labelColor}`}>
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <span
                  className="flex-1 h-px"
                  style={{ background: idx < currentIdx ? '#0A0A0B' : 'rgba(10,10,11,0.15)' }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes bulk-step-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.92); }
        }
        .animate-bulk-step-pulse {
          animation: bulk-step-pulse 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-bulk-step-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
