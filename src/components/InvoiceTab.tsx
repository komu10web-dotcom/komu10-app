'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { INVOICE_STATUS } from '@/types/database';
import type {
  Invoice, InvoiceItem, Client, BankAccount, InvoiceStatusKey,
  WithholdingBasis, HeaderAmountType, FeeBurden,
} from '@/types/database';
import {
  calculateInvoiceAmounts, calculateDueDate, isOverdue,
  feeBurdenLabel, formatYen,
} from '@/lib/invoiceCalc';
import { Plus, Pencil, Eye, Trash2, Loader2, X, ChevronLeft, Copy, Download } from 'lucide-react';

// ============================================================
// 型定義
// ============================================================
interface InvoiceTabProps {
  owner: string; // 'tomo' | 'toshiki' | 'all'
  clients: Client[];
  initialTransactionId?: string | null;
}

interface InvoiceRow extends Invoice {
  client_name?: string;
  client_number?: string;
  item_count?: number;
}

interface ItemForm {
  id?: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
}

// ============================================================
// ステータスバッジスタイル
// ============================================================
const INV_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft:   { bg: 'bg-app-surface-alt',    text: 'text-app-text-mute' },
  issued:  { bg: 'bg-app-gold/10', text: 'text-app-gold' },
  sent:    { bg: 'bg-app-green/10', text: 'text-app-green' },
  paid:    { bg: 'bg-app-green/20', text: 'text-app-green' },
  overdue: { bg: 'bg-app-red/10', text: 'text-app-red' },
};

// ============================================================
// メインコンポーネント
// ============================================================
export default function InvoiceTab({ owner, clients, initialTransactionId }: InvoiceTabProps) {
  // 画面モード: list / edit / preview
  const [view, setView] = useState<'list' | 'edit' | 'preview'>('list');

  // 一覧
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 編集対象
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  // 売上モーダルからの起動用（transaction_idをpreloadに渡す）
  const [preloadFromTxId, setPreloadFromTxId] = useState<string | null>(null);
  const [handledInitialTxId, setHandledInitialTxId] = useState<string | null>(null);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // 銀行口座（振込先）
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const effectiveOwner = owner === 'all' ? 'tomo' : owner;

  // initialTransactionId があれば起動時に新規エディタ + 売上転記モードに遷移
  useEffect(() => {
    if (initialTransactionId && initialTransactionId !== handledInitialTxId) {
      setHandledInitialTxId(initialTransactionId);
      setPreloadFromTxId(initialTransactionId);
      setEditInvoiceId(null);
      setView('edit');
    }
  }, [initialTransactionId, handledInitialTxId]);

  // ── データ取得 ──
  const fetchInvoices = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase.from('invoices').select('*, clients(name, client_number)');
      if (owner !== 'all') {
        query = query.eq('owner', owner);
      }
      query = query.order('issue_date', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      const rows: InvoiceRow[] = (data || []).map((inv: any) => ({
        ...inv,
        client_name: inv.clients?.name || '—',
        client_number: inv.clients?.client_number || '',
      }));
      setInvoices(rows);
    } catch (err) {
      console.error('請求書取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [owner]);

  const fetchBankAccounts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('bank_accounts').select('*').order('name');
    setBankAccounts(data || []);
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchBankAccounts();
  }, [fetchInvoices, fetchBankAccounts]);

  // ── 削除 ──
  const handleDelete = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase.from('invoices').delete().eq('id', id);
      setDeleteTarget(null);
      fetchInvoices();
    } catch (err) {
      console.error('請求書削除エラー:', err);
    }
  };

  // v0.8: 既存請求書をテンプレとして保存
  const [saveAsTemplateTarget, setSaveAsTemplateTarget] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);

  const handleSaveAsTemplate = async () => {
    if (!supabase || !saveAsTemplateTarget || !templateName.trim()) return;
    setTemplateSaving(true);
    try {
      const { data: inv } = await supabase
        .from('invoices').select('*').eq('id', saveAsTemplateTarget).single();
      if (!inv) throw new Error('請求書が見つかりません');
      const { data: invItems } = await supabase
        .from('invoice_items').select('*').eq('invoice_id', saveAsTemplateTarget).order('sort_order');

      const { data: newTpl } = await supabase
        .from('invoice_templates')
        .insert({
          owner: inv.owner,
          name: templateName.trim(),
          subject: inv.subject,
          payment_terms: inv.payment_terms,
          notes: inv.notes,
          bank_account_id: inv.bank_account_id,
          withholding_tax: inv.withholding_tax,
          withholding_basis: inv.withholding_basis,
          header_amount_type: inv.header_amount_type,
          fee_burden: inv.fee_burden,
        })
        .select('id')
        .single();

      if (newTpl?.id && invItems && invItems.length > 0) {
        const itemsToInsert = invItems.map((it: any, idx: number) => ({
          template_id: newTpl.id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          tax_rate: 0.10,
          amount: it.amount,
          sort_order: idx,
        }));
        await supabase.from('invoice_template_items').insert(itemsToInsert);
      }
      setTemplateSaveSuccess(true);
      setTimeout(() => {
        setSaveAsTemplateTarget(null);
        setTemplateName('');
        setTemplateSaveSuccess(false);
      }, 1200);
    } catch (err) {
      console.error('テンプレ保存エラー:', err);
    } finally {
      setTemplateSaving(false);
    }
  };

  // ── フィルター ──
  const filtered = statusFilter === 'all'
    ? invoices
    : invoices.filter((inv) => inv.status === statusFilter);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;
  const formatDate = (d: string) => {
    const parts = d.split('-');
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  };

  // ── 編集画面に遷移 ──
  const openEdit = (invoiceId: string | null) => {
    setEditInvoiceId(invoiceId);
    setPreloadFromTxId(null); // 通常の新規/編集ではpreloadを使わない
    setView('edit');
  };

  // ── プレビュー画面に遷移 ──
  const openPreview = (invoiceId: string) => {
    setPreviewInvoiceId(invoiceId);
    setView('preview');
  };

  // ============================================================
  // 一覧ビュー
  // ============================================================
  if (view === 'list') {
    return (
      <>
        {/* アクションバー */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => openEdit(null)}
            className="flex items-center gap-1.5 px-4 py-2 bg-app-button text-white rounded-lg text-xs font-medium hover:bg-app-button-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            請求書作成
          </button>
          <div className="flex items-center gap-1 ml-auto bg-app-surface-alt rounded-lg p-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                statusFilter === 'all' ? 'bg-white text-app-text shadow-sm' : 'text-app-text-mute'
              }`}
            >
              すべて
            </button>
            {(Object.keys(INVOICE_STATUS) as InvoiceStatusKey[]).map((key) => (
              <button key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                  statusFilter === key ? 'bg-white text-app-text shadow-sm' : 'text-app-text-mute'
                }`}
              >
                {INVOICE_STATUS[key]}
              </button>
            ))}
          </div>
        </div>

        {/* テーブル */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-app-gold animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-app-text-fade">
              請求書がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app-line">
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">請求書番号</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">発行日</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">ステータス</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">取引先</th>
                    <th className="text-right px-4 py-3 text-xs text-app-text-mute font-normal">合計</th>
                    <th className="text-right px-4 py-3 text-xs text-app-text-mute font-normal w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const statusStyle = INV_STATUS_STYLES[inv.status] || INV_STATUS_STYLES.draft;
                    return (
                      <tr key={inv.id} className="border-b border-app-line hover:bg-app-surface-alt/50 transition-colors">
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs tabular-nums text-app-text">
                          {inv.invoice_number}
                        </td>
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs text-app-text-mute tabular-nums">
                          {formatDate(inv.issue_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {INVOICE_STATUS[inv.status as InvoiceStatusKey] || inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-app-text">{inv.client_name}</div>
                          {inv.client_number && (
                            <div className="text-[10px] font-['Saira_Condensed'] text-app-text-mute">{inv.client_number}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-['Saira_Condensed'] tabular-nums text-app-green">
                          {formatAmount(inv.total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openPreview(inv.id)}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors" title="プレビュー">
                              <Eye className="w-3.5 h-3.5 text-app-text-mute" />
                            </button>
                            <button onClick={() => openEdit(inv.id)}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors" title="編集">
                              <Pencil className="w-3.5 h-3.5 text-app-text-mute" />
                            </button>
                            <button onClick={() => { setSaveAsTemplateTarget(inv.id); setTemplateName(inv.subject || ''); }}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors" title="テンプレとして保存">
                              <Copy className="w-3.5 h-3.5 text-app-text-mute" />
                            </button>
                            <button onClick={() => setDeleteTarget(inv.id)}
                              className="p-1.5 hover:bg-app-red/10 rounded-md transition-colors" title="削除">
                              <Trash2 className="w-3.5 h-3.5 text-app-text-mute" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* フッター集計 */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center justify-end gap-4 px-4 py-3 border-t border-app-line bg-app-surface-alt/50">
              {(['draft', 'issued', 'paid'] as const).map((s) => {
                const sum = filtered.filter(i => i.status === s).reduce((a, i) => a + i.total, 0);
                if (sum === 0) return null;
                const style = INV_STATUS_STYLES[s];
                return (
                  <div key={s} className="text-xs">
                    <span className="text-app-text-mute">{INVOICE_STATUS[s]}: </span>
                    <span className={`font-['Saira_Condensed'] tabular-nums ${style.text}`}>{formatAmount(sum)}</span>
                  </div>
                );
              })}
              <div className="text-xs">
                <span className="text-app-text-mute">合計: </span>
                <span className="font-['Saira_Condensed'] text-app-green tabular-nums font-medium">
                  {formatAmount(filtered.reduce((a, i) => a + i.total, 0))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 削除確認 */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteTarget(null)} />
            <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
              <p className="text-sm text-app-text mb-4">この請求書を削除しますか？</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 text-xs text-app-text-mute bg-app-surface-alt rounded-lg hover:bg-app-surface-hover transition-colors">
                  キャンセル
                </button>
                <button onClick={() => handleDelete(deleteTarget)}
                  className="flex-1 py-2 text-xs text-white bg-app-red rounded-lg hover:bg-app-red-hover transition-colors">
                  削除する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* v0.8: テンプレとして保存モーダル */}
        {saveAsTemplateTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => { if (!templateSaving) { setSaveAsTemplateTarget(null); setTemplateName(''); } }} />
            <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
              {templateSaveSuccess ? (
                <p className="text-sm text-app-green text-center py-3">✓ テンプレとして保存しました</p>
              ) : (
                <>
                  <p className="text-sm text-app-text mb-1">テンプレとして保存</p>
                  <p className="text-[10px] text-app-text-mute mb-3">この請求書の内容（明細・備考・支払条件・源泉設定）を汎用テンプレに登録します</p>
                  <label className="block text-[10px] font-medium tracking-wider text-app-text-mute mb-1.5">テンプレ名</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="例: 月額顧問 / 撮影スポット"
                    className="w-full px-3 py-2 text-xs bg-app-surface-alt rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-app-button/10 mb-4"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => { setSaveAsTemplateTarget(null); setTemplateName(''); }}
                      disabled={templateSaving}
                      className="flex-1 py-2 text-xs text-app-text-mute bg-app-surface-alt rounded-lg hover:bg-app-surface-hover transition-colors disabled:opacity-50">
                      キャンセル
                    </button>
                    <button onClick={handleSaveAsTemplate}
                      disabled={templateSaving || !templateName.trim()}
                      className="flex-1 py-2 text-xs text-white bg-app-button rounded-lg hover:bg-app-button-hover transition-colors disabled:opacity-50">
                      {templateSaving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // ============================================================
  // 編集/新規作成ビュー
  // ============================================================
  if (view === 'edit') {
    return (
      <InvoiceEditor
        invoiceId={editInvoiceId}
        preloadFromTxId={preloadFromTxId}
        owner={effectiveOwner}
        clients={clients.filter(c => c.owner === effectiveOwner && c.is_active)}
        bankAccounts={bankAccounts.filter(b => b.owner === effectiveOwner)}
        onBack={() => {
          setView('list');
          setEditInvoiceId(null);
          setPreloadFromTxId(null);
          fetchInvoices();
        }}
        onPreview={(id) => { setPreviewInvoiceId(id); setView('preview'); }}
      />
    );
  }

  // ============================================================
  // プレビュービュー
  // ============================================================
  if (view === 'preview' && previewInvoiceId) {
    return (
      <InvoicePreview
        invoiceId={previewInvoiceId}
        onBack={() => { setView('list'); setPreviewInvoiceId(null); }}
        onEdit={(id) => { setEditInvoiceId(id); setView('edit'); }}
      />
    );
  }

  return null;
}


// ============================================================
// 請求書エディタ
// ============================================================
function InvoiceEditor({
  invoiceId,
  preloadFromTxId,
  owner,
  clients,
  bankAccounts,
  onBack,
  onPreview,
}: {
  invoiceId: string | null;
  preloadFromTxId: string | null;
  owner: string;
  clients: Client[];
  bankAccounts: BankAccount[];
  onBack: () => void;
  onPreview: (id: string) => void;
}) {
  const isNew = !invoiceId;

  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(!isNew);

  // フォーム
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [subject, setSubject] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('契約書記載の支払条件に準ずる');
  const [bankAccountId, setBankAccountId] = useState('');
  const DEFAULT_NOTES = ''; // v0.5.7: テンプレに固定2行を書き込むため、コード側のデフォルトは空文字に
  const [notes, setNotes] = useState(isNew ? DEFAULT_NOTES : '');
  const [status, setStatus] = useState<string>('draft');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [existingTransactionId, setExistingTransactionId] = useState<string | null>(null);

  // v0.6.0 請求書管理v2 — クライアント設定のオーバーライド値（null = クライアント設定を使う）
  const [overrideWithholdingTax,   setOverrideWithholdingTax]   = useState<boolean | null>(null);
  const [overrideWithholdingBasis, setOverrideWithholdingBasis] = useState<WithholdingBasis | null>(null);
  const [overrideHeaderAmountType, setOverrideHeaderAmountType] = useState<HeaderAmountType | null>(null);
  const [overrideFeeBurden,        setOverrideFeeBurden]        = useState<FeeBurden | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 明細行
  const [items, setItems] = useState<ItemForm[]>([
    { description: '', quantity: '1', unit: '式', unit_price: '' },
  ]);

  // v0.8: 請求書汎用テンプレ
  const [invoiceTemplates, setInvoiceTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // 既存データ読み込み
  useEffect(() => {
    if (!invoiceId || !supabase) return;
    (async () => {
      setLoadingData(true);
      try {
        const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
        if (inv) {
          setClientId(inv.client_id || '');
          setIssueDate(inv.issue_date);
          setDueDate(inv.due_date || '');
          setSubject(inv.subject || '');
          setPaymentTerms(inv.payment_terms || '契約書記載の支払条件に準ずる');
          setBankAccountId(inv.bank_account_id || '');
          setNotes(inv.notes || '');
          setStatus(inv.status);
          setInvoiceNumber(inv.invoice_number);
          setExistingTransactionId(inv.transaction_id || null);
          // v0.6.0: 既存レコードのv2カラムをオーバーライドstateにセット（DBの値が正）
          if (typeof inv.withholding_tax === 'boolean') {
            setOverrideWithholdingTax(inv.withholding_tax);
          }
          if (inv.withholding_basis) {
            setOverrideWithholdingBasis(inv.withholding_basis as WithholdingBasis);
          }
          if (inv.header_amount_type) {
            setOverrideHeaderAmountType(inv.header_amount_type as HeaderAmountType);
          }
          if (inv.fee_burden) {
            setOverrideFeeBurden(inv.fee_burden as FeeBurden);
          }
        }
        const { data: itemData } = await supabase
          .from('invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order');
        if (itemData && itemData.length > 0) {
          setItems(itemData.map((it: any) => ({
            id: it.id,
            description: it.description,
            quantity: it.quantity.toString(),
            unit: it.unit || '式',
            unit_price: it.unit_price.toString(),
          })));
        }
      } catch (err) {
        console.error('請求書読込エラー:', err);
      } finally {
        setLoadingData(false);
      }
    })();
  }, [invoiceId]);

  // 売上モーダルからの転記（新規作成＋preloadFromTxIdあり時のみ）
  useEffect(() => {
    if (!preloadFromTxId || invoiceId || !supabase) return;
    (async () => {
      try {
        const { data: tx } = await supabase
          .from('transactions')
          .select('*, projects(name, invoice_display_name)')
          .eq('id', preloadFromTxId)
          .single();
        if (!tx) return;

        const proj = (tx as any).projects;
        // 件名：請求書の件名（対外的表記） → 案件名 → description の順でフォールバック（v0.5.4）
        const invoiceSubject: string = proj?.invoice_display_name || proj?.name || tx.description || '';
        // 明細行の品名：item_description → 案件名（旧運用の互換） の順でフォールバック（v0.5.4）
        const itemDesc: string = (tx as any).item_description || proj?.name || tx.description || '';

        setClientId(tx.client_id || '');
        setSubject(invoiceSubject);
        setExistingTransactionId(tx.id);
        setItems([{
          description: itemDesc,
          quantity: '1',
          unit: '式',
          unit_price: tx.amount.toString(),
        }]);
        // 売上の発生日がある場合は請求書発行日の候補にする（ユーザーが最終確定）
        if (tx.accrual_date) setIssueDate(tx.accrual_date);
      } catch (err) {
        console.error('売上転記エラー:', err);
      }
    })();
  }, [preloadFromTxId, invoiceId]);

  // 前回の請求書から自動入力
  useEffect(() => {
    if (!isNew || !clientId || !supabase) return;
    (async () => {
      const { data } = await supabase
        .from('invoices').select('*, invoice_items(*)')
        .eq('client_id', clientId).eq('owner', owner)
        .order('issue_date', { ascending: false }).limit(1);
      if (data && data.length > 0) {
        const prev = data[0];
        // 振込先・支払条件・備考は常に前回を引き継ぐ
        if (prev.bank_account_id) setBankAccountId(prev.bank_account_id);
        if (prev.payment_terms) setPaymentTerms(prev.payment_terms);
        if (prev.notes) setNotes(prev.notes);
        // 件名・明細は売上転記モードでは上書きしない（売上側の値を優先）
        if (!preloadFromTxId) {
          if (prev.subject) setSubject(prev.subject);
          if (prev.invoice_items && prev.invoice_items.length > 0) {
            const sorted = [...prev.invoice_items].sort((a: any, b: any) => a.sort_order - b.sort_order);
            setItems(sorted.map((it: any) => ({
              description: it.description,
              quantity: it.quantity.toString(),
              unit: it.unit || '式',
              unit_price: it.unit_price.toString(),
            })));
          }
        }
      }
    })();
  }, [isNew, clientId, owner, preloadFromTxId]);

  // 合計計算
  const calcItemAmount = (item: ItemForm) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return Math.round(qty * price);
  };

  // v0.8: 請求書汎用テンプレ一覧取得（新規作成時のみ）
  useEffect(() => {
    if (!isNew || !supabase) return;
    (async () => {
      const { data } = await supabase
        .from('invoice_templates')
        .select('*')
        .eq('owner', owner)
        .order('use_count', { ascending: false });
      setInvoiceTemplates(data || []);
    })();
  }, [isNew, owner]);

  // v0.8: テンプレ適用
  const applyInvoiceTemplate = async (templateId: string) => {
    if (!supabase || !templateId) return;
    try {
      const { data: tpl } = await supabase
        .from('invoice_templates').select('*').eq('id', templateId).single();
      if (!tpl) return;
      const { data: tplItems } = await supabase
        .from('invoice_template_items').select('*').eq('template_id', templateId).order('sort_order');

      if (tpl.subject) setSubject(tpl.subject);
      if (tpl.payment_terms) setPaymentTerms(tpl.payment_terms);
      if (tpl.notes) setNotes(tpl.notes);
      if (tpl.bank_account_id) setBankAccountId(tpl.bank_account_id);
      setOverrideWithholdingTax(!!tpl.withholding_tax);
      setOverrideWithholdingBasis(tpl.withholding_basis as WithholdingBasis);
      setOverrideHeaderAmountType(tpl.header_amount_type as HeaderAmountType);
      setOverrideFeeBurden(tpl.fee_burden as FeeBurden);
      if (tplItems && tplItems.length > 0) {
        setItems(tplItems.map((it: any) => ({
          description: it.description || '',
          quantity: String(it.quantity || 1),
          unit: '式',
          unit_price: String(it.unit_price || 0),
        })));
      }
      // use_count をインクリメント
      await supabase
        .from('invoice_templates')
        .update({ use_count: (tpl.use_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', templateId);
    } catch (err) {
      console.error('テンプレ適用エラー:', err);
    }
  };

  // v0.6.0: 新規作成時のみ、選択されたクライアントのデフォルト値をoverride stateに投入
  useEffect(() => {
    if (!isNew || !clientId) return;
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    setOverrideWithholdingTax((c as any).withholding_tax ?? false);
    setOverrideWithholdingBasis(((c as any).withholding_basis as WithholdingBasis) ?? 'tax_included');
    setOverrideHeaderAmountType(((c as any).header_amount_type as HeaderAmountType) ?? 'total');
    setOverrideFeeBurden(((c as any).fee_burden as FeeBurden) ?? 'client');
  }, [clientId, clients, isNew]);

  // v0.6.0: 実効値（override が null なら client 値、それも無ければデフォルト）
  const effectiveClient = useMemo(
    () => clients.find(c => c.id === clientId),
    [clientId, clients],
  );
  const effWithholdingTax: boolean =
    overrideWithholdingTax ?? (effectiveClient as any)?.withholding_tax ?? false;
  const effWithholdingBasis: WithholdingBasis =
    (overrideWithholdingBasis ?? ((effectiveClient as any)?.withholding_basis as WithholdingBasis) ?? 'tax_included') as WithholdingBasis;
  const effHeaderAmountType: HeaderAmountType =
    (overrideHeaderAmountType ?? ((effectiveClient as any)?.header_amount_type as HeaderAmountType) ?? 'total') as HeaderAmountType;
  const effFeeBurden: FeeBurden =
    (overrideFeeBurden ?? ((effectiveClient as any)?.fee_burden as FeeBurden) ?? 'client') as FeeBurden;

  // v0.6.0: 全金額を単一ソース（invoiceCalc.ts）で一括算出
  const calc = useMemo(() => {
    const subtotalLocal = items.reduce(
      (s, it) => s + calcItemAmount(it),
      0,
    );
    return calculateInvoiceAmounts({
      subtotal: subtotalLocal,
      taxAmount: 0, // 免税事業者
      withholdingTax: effWithholdingTax,
      withholdingBasis: effWithholdingBasis,
      headerAmountType: effHeaderAmountType,
    });
  }, [items, effWithholdingTax, effWithholdingBasis, effHeaderAmountType]);

  const subtotal = calc.subtotal;
  const taxAmount = calc.taxAmount;
  const total = calc.total;

  // 明細行操作
  const addItem = () => setItems([...items, { description: '', quantity: '1', unit: '式', unit_price: '' }]);
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof ItemForm, value: string) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  // 保存
  const handleSave = async () => {
    if (!supabase || !clientId || items.length === 0 || !bankAccountId) return;
    setSaving(true);
    try {
      const invoiceData: any = {
        owner,
        client_id: clientId,
        issue_date: issueDate,
        due_date: dueDate || null,
        subject: subject || null,
        payment_terms: paymentTerms || null,
        subtotal,
        tax_amount: taxAmount,
        total,
        status,
        bank_account_id: bankAccountId || null,
        notes: notes || null,
        // v0.6.0 請求書管理v2
        withholding_tax: effWithholdingTax,
        withholding_basis: effWithholdingBasis,
        withholding_amount: calc.withholdingAmount,
        net_payment: calc.netPayment,
        header_amount_type: effHeaderAmountType,
        fee_burden: effFeeBurden,
      };

      // v0.6.0: 発行時、支払期限が未設定ならクライアント設定から自動算出
      if (status === 'issued' && !invoiceData.due_date) {
        const termsType = (effectiveClient as any)?.payment_terms_type || 'month_end_next_month_end';
        const auto = calculateDueDate(issueDate, termsType);
        if (auto) invoiceData.due_date = auto;
      }

      let savedId = invoiceId;

      if (isNew) {
        // 採番: INV-{年度}-{4桁連番}
        const year = new Date(issueDate).getFullYear();
        const { data: last } = await supabase
          .from('invoices').select('invoice_number')
          .like('invoice_number', `INV-${year}-%`)
          .order('invoice_number', { ascending: false }).limit(1);
        const lastNum = last?.[0]
          ? parseInt(last[0].invoice_number.split('-')[2])
          : 0;
        const newNumber = `INV-${year}-${String(lastNum + 1).padStart(4, '0')}`;
        invoiceData.invoice_number = newNumber;

        const { data: inserted, error } = await supabase
          .from('invoices').insert(invoiceData).select('id').single();
        if (error) throw error;
        savedId = inserted.id;
      } else {
        const { error } = await supabase
          .from('invoices').update(invoiceData).eq('id', invoiceId);
        if (error) throw error;
        // 既存明細を全削除して再作成
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
      }

      // 明細行挿入
      const itemRecords = items
        .filter((it) => it.description.trim())
        .map((it, idx) => ({
          invoice_id: savedId!,
          sort_order: idx + 1,
          description: it.description.trim(),
          quantity: parseFloat(it.quantity) || 0,
          unit: it.unit || '式',
          unit_price: parseFloat(it.unit_price) || 0,
          amount: calcItemAmount(it),
        }));

      if (itemRecords.length > 0) {
        const { error: itemErr } = await supabase.from('invoice_items').insert(itemRecords);
        if (itemErr) throw itemErr;
      }

      // 発行時にissued_atを記録 + 売上仕訳自動作成
      if (status === 'issued') {
        const updates: any = {};
        if (isNew) updates.issued_at = new Date().toISOString();

        if (existingTransactionId) {
          // 経路A: 売上モーダル経由 or 既存紐付き
          // → 既存仕訳を発行済に更新（他カラム [division/business_domain/contract_type_id/project_id 等] は温存）
          await supabase.from('transactions').update({
            status: 'billed',
            accrual_date: issueDate,
            amount: total,
          }).eq('id', existingTransactionId);
        } else {
          // 経路B: 請求書タブから独立起動（売上紐付きなし）
          // → 証跡不足の警告を出したうえで新規INSERT
          const proceed = confirm(
            '⚠️ この請求書は売上登録から紐づいていません。\n\n' +
            '発行すると新しい売上が作成されますが、以下の経営分析項目が空のまま記録されます:\n' +
            '  ・契約形態\n' +
            '  ・事業領域\n' +
            '  ・案件名\n\n' +
            '売上タブの「売上入力」から登録し、請求書発行トグルON経由で作成することを推奨します。\n\n' +
            'このまま発行しますか？'
          );
          if (!proceed) {
            setSaving(false);
            return;
          }

          const selectedClient = clients.find(c => c.id === clientId);
          const txData = {
            tx_type: 'revenue' as const,
            date: issueDate,
            amount: total,
            kamoku: 'sales',
            division: 'general', // 経路B: 分類未定のため general（後で編集可）
            owner,
            store: selectedClient?.name || null,
            description: `請求書 ${isNew ? invoiceData.invoice_number : invoiceNumber}`,
            source: 'manual',
            confirmed: true,
            status: 'billed',
            accrual_date: issueDate,
            client_id: clientId,
          };
          const { data: txInserted } = await supabase
            .from('transactions').insert(txData).select('id').single();
          if (txInserted) {
            updates.transaction_id = txInserted.id;
            setExistingTransactionId(txInserted.id);
          }
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from('invoices').update(updates).eq('id', savedId);
        }
      }

      // v0.6.0: 送付済時にsent_atを記録
      if (status === 'sent') {
        const sentUpdates: any = {};
        // 既存レコードでsent_atが未セットの場合のみ記録（トグル時の上書き防止）
        const { data: cur } = await supabase
          .from('invoices').select('sent_at').eq('id', savedId).single();
        if (!cur?.sent_at) {
          sentUpdates.sent_at = new Date().toISOString();
        }
        if (Object.keys(sentUpdates).length > 0) {
          await supabase.from('invoices').update(sentUpdates).eq('id', savedId);
        }
      }

      // 入金済み時にpaid_atを記録 + 仕訳ステータス更新
      if (status === 'paid') {
        const paidUpdates: any = { paid_at: new Date().toISOString() };
        await supabase.from('invoices').update(paidUpdates).eq('id', savedId);

        // 紐付き仕訳があればsettledに更新
        const txId = existingTransactionId;
        if (txId) {
          await supabase.from('transactions').update({
            status: 'settled',
            actual_payment_date: new Date().toISOString().split('T')[0],
          }).eq('id', txId);

          // v0.6.0: 源泉徴収ありの場合、仮払源泉税の別仕訳を追加
          // 借方: 仮払源泉税 / 貸方: 売掛金
          // 元仕訳の amount は total のままにし、source='withholding' で区別
          if (effWithholdingTax && calc.withholdingAmount > 0) {
            // 既存の源泉税仕訳が無い場合のみ作成（再入金時の重複防止）
            const { data: existingWh } = await supabase
              .from('transactions')
              .select('id')
              .eq('invoice_id', savedId)
              .eq('kamoku', 'prepaid_withholding')
              .limit(1);
            if (!existingWh || existingWh.length === 0) {
              const selectedClient = clients.find(c => c.id === clientId);
              await supabase.from('transactions').insert({
                tx_type: 'expense' as const, // 資産計上だが既存のtx_type制約に合わせる
                date: new Date().toISOString().split('T')[0],
                amount: calc.withholdingAmount,
                kamoku: 'prepaid_withholding',
                division: 'general',
                owner,
                store: selectedClient?.name || null,
                description: `源泉徴収税（${invoiceNumber || invoiceData.invoice_number}）`,
                source: 'manual',
                confirmed: true,
                status: 'settled',
                actual_payment_date: new Date().toISOString().split('T')[0],
                client_id: clientId,
                invoice_id: savedId,
              });
            }
          }
        }
      }

      onBack();
    } catch (err) {
      console.error('請求書保存エラー:', err);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // v0.6.8: 振込先口座を必須化(空欄請求書の発行防止)
  const canSave = clientId && items.some(it => it.description.trim()) && !!bankAccountId;

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-app-gold animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1 hover:bg-black/5 rounded-md transition-colors">
          <ChevronLeft className="w-5 h-5 text-app-text-mute" />
        </button>
        <h2 className="text-sm font-medium text-app-text">
          {isNew ? '請求書を作成' : `請求書を編集（${invoiceNumber}）`}
        </h2>
      </div>

      <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
        {/* v0.8: テンプレから作成（新規時のみ・テンプレあるときのみ） */}
        {isNew && invoiceTemplates.length > 0 && (
          <div className="mb-6 pb-4 border-b border-app-line">
            <label className="block text-[10px] font-medium tracking-wider text-app-text-mute mb-1.5">テンプレから作成</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedTemplateId(id);
                if (id) applyInvoiceTemplate(id);
              }}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            >
              <option value="">（使わない）</option>
              {invoiceTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.use_count > 0 ? ` (${t.use_count}回使用)` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 基本情報 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* 取引先 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">取引先 <span className="text-app-red">*</span></label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50">
              <option value="">選択してください</option>
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.client_number} — {cl.name}</option>
              ))}
            </select>
          </div>

          {/* 発行日 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">発行日</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 font-['Saira_Condensed']" />
          </div>

          {/* 支払期限 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">お支払期限</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 font-['Saira_Condensed']" />
          </div>

          {/* 件名 */}
          <div className="col-span-2">
            <label className="block text-xs text-app-text-mute mb-1">件名</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="例: 法人営業／企画提案業務"
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50" />
          </div>

          {/* 振込先 — v0.6.8: 必須化 + 0件時は設定画面へ誘導 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">
              振込先口座 <span className="text-app-red">*</span>
            </label>
            {bankAccounts.length === 0 ? (
              <div className="bg-state-warn-bg border border-app-gold/30 rounded-lg px-3 py-3 text-xs text-app-text-sub space-y-2">
                <p>この所有者({owner})の振込先口座が未登録です。</p>
                <a href={`/settings?owner=${owner}`} className="inline-block px-3 py-1.5 text-[11px] bg-app-button text-white rounded-lg hover:bg-app-button-hover transition-colors">
                  設定画面で口座を登録する
                </a>
              </div>
            ) : (
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
                className={`w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 ${!bankAccountId ? 'ring-1 ring-app-red/30' : ''}`}>
                <option value="">選択してください</option>
                {bankAccounts.map((ba) => (
                  <option key={ba.id} value={ba.id}>{ba.bank_name} {ba.branch_name || ''} ({ba.name})</option>
                ))}
              </select>
            )}
          </div>

          {/* ステータス */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">ステータス</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(INVOICE_STATUS) as InvoiceStatusKey[]).map((key) => (
                <button key={key} type="button"
                  onClick={() => setStatus(key)}
                  className={`px-2.5 py-1.5 text-[11px] rounded-lg transition-colors ${
                    status === key ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub hover:bg-app-button-disabled'
                  }`}>
                  {INVOICE_STATUS[key]}
                </button>
              ))}
            </div>
            {/* issued 状態で送付済にする補助ボタン（v0.6.0） */}
            {status === 'issued' && !isNew && (
              <button type="button"
                onClick={() => setStatus('sent')}
                className="mt-2 text-[11px] text-app-green hover:underline">
                → 送付済にする
              </button>
            )}
          </div>
        </div>

        {/* v0.6.0: 請求書設定パネル（折りたたみ・デフォルト閉じ） */}
        <div className="mb-6 border border-app-line rounded-xl overflow-hidden">
          <button type="button"
            onClick={() => setSettingsOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left bg-app-surface hover:bg-app-surface-alt transition-colors">
            <span className="text-xs text-app-text-sub">
              請求書設定
              {effectiveClient && (
                <span className="text-app-text-fade ml-2">
                  （{effectiveClient.name}のデフォルト{(
                    overrideWithholdingTax !== null ||
                    overrideWithholdingBasis !== null ||
                    overrideHeaderAmountType !== null ||
                    overrideFeeBurden !== null
                  ) ? '＋オーバーライド' : 'を使用中'}）
                </span>
              )}
            </span>
            <span className="text-app-text-mute text-xs">{settingsOpen ? '閉じる' : '開く'}</span>
          </button>
          {settingsOpen && (
            <div className="p-4 space-y-4 bg-white">
              {/* 源泉徴収 */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-app-text-sub w-28 shrink-0">源泉徴収</label>
                <div className="flex gap-1.5">
                  <button type="button"
                    onClick={() => setOverrideWithholdingTax(true)}
                    className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                      effWithholdingTax ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                    }`}>あり</button>
                  <button type="button"
                    onClick={() => setOverrideWithholdingTax(false)}
                    className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                      !effWithholdingTax ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                    }`}>なし</button>
                </div>
              </div>

              {/* 源泉計算基準（源泉ありのみ） */}
              {effWithholdingTax && (
                <div className="flex items-center gap-3">
                  <label className="text-xs text-app-text-sub w-28 shrink-0">源泉計算基準</label>
                  <div className="flex gap-1.5">
                    <button type="button"
                      onClick={() => setOverrideWithholdingBasis('tax_included')}
                      className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                        effWithholdingBasis === 'tax_included' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                      }`}>税込</button>
                    <button type="button"
                      onClick={() => setOverrideWithholdingBasis('tax_excluded')}
                      className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                        effWithholdingBasis === 'tax_excluded' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                      }`}>税抜</button>
                  </div>
                </div>
              )}

              {/* 冒頭金額表示 */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-app-text-sub w-28 shrink-0">冒頭金額表示</label>
                <div className="flex gap-1.5">
                  <button type="button"
                    onClick={() => setOverrideHeaderAmountType('total')}
                    className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                      effHeaderAmountType === 'total' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                    }`}>請求総額</button>
                  <button type="button"
                    onClick={() => setOverrideHeaderAmountType('net_payment')}
                    className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                      effHeaderAmountType === 'net_payment' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                    }`}>差引振込額</button>
                </div>
              </div>

              {/* 振込手数料 */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-app-text-sub w-28 shrink-0">振込手数料</label>
                <div className="flex gap-1.5">
                  <button type="button"
                    onClick={() => setOverrideFeeBurden('client')}
                    className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                      effFeeBurden === 'client' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                    }`}>先方負担</button>
                  <button type="button"
                    onClick={() => setOverrideFeeBurden('self')}
                    className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                      effFeeBurden === 'self' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-sub'
                    }`}>自社負担</button>
                </div>
              </div>

              {/* オーバーライドを全てクリア */}
              <button type="button"
                onClick={() => {
                  setOverrideWithholdingTax(null);
                  setOverrideWithholdingBasis(null);
                  setOverrideHeaderAmountType(null);
                  setOverrideFeeBurden(null);
                }}
                className="text-[11px] text-app-text-mute hover:text-app-text underline">
                クライアント設定に戻す
              </button>
            </div>
          )}
        </div>

        {/* 明細行 */}
        <div className="mb-6">
          <div className="text-xs text-app-text-mute mb-2">明細</div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <input type="text" value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    placeholder="品名・内容"
                    className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50" />
                </div>
                <div className="w-16">
                  <input type="text" inputMode="numeric" value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="数量"
                    className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 text-center font-['Saira_Condensed'] tabular-nums" />
                </div>
                <div className="w-16">
                  <input type="text" value={item.unit}
                    onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                    placeholder="単位"
                    className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 text-center" />
                </div>
                <div className="w-28">
                  <input type="text" inputMode="numeric"
                    value={item.unit_price ? Number(item.unit_price).toLocaleString('ja-JP') : ''}
                    onChange={(e) => updateItem(idx, 'unit_price', e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="単価"
                    className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 text-right font-['Saira_Condensed'] tabular-nums" />
                </div>
                <div className="w-28 flex items-center justify-end">
                  <span className="text-sm font-['Saira_Condensed'] tabular-nums text-app-text">
                    {calcItemAmount(item) > 0 ? `¥${calcItemAmount(item).toLocaleString()}` : '—'}
                  </span>
                </div>
                <button onClick={() => removeItem(idx)}
                  className={`p-2 rounded-md transition-colors ${items.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-app-red/10'}`}
                  disabled={items.length <= 1}>
                  <X className="w-3.5 h-3.5 text-app-text-mute" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-app-gold hover:text-app-gold-hover mt-3 transition-colors">
            <Plus className="w-3.5 h-3.5" />行を追加
          </button>
        </div>

        {/* 合計（v0.6.0 サマリー） */}
        <div className="border-t border-app-line pt-4 mb-6">
          <div className="flex justify-end gap-8">
            <div className="text-right space-y-1">
              <div className="text-xs text-app-text-mute">小計</div>
              <div className="text-xs text-app-text-mute">消費税</div>
              <div className="text-sm font-medium text-app-text">合計</div>
              {effWithholdingTax && (
                <>
                  <div className="text-xs text-app-text-mute">源泉徴収額</div>
                  <div className="text-sm font-medium text-app-text">差引振込額</div>
                </>
              )}
              <div className="text-[11px] text-app-text-fade pt-1">冒頭表示額</div>
            </div>
            <div className="text-right space-y-1 font-['Saira_Condensed'] tabular-nums">
              <div className="text-sm text-app-text">{formatYen(calc.subtotal)}</div>
              <div className="text-sm text-app-text-mute">—</div>
              <div className="text-lg font-medium text-app-green">{formatYen(calc.total)}</div>
              {effWithholdingTax && (
                <>
                  <div className="text-sm text-app-red">- {formatYen(calc.withholdingAmount)}</div>
                  <div className="text-lg font-medium text-app-green">{formatYen(calc.netPayment)}</div>
                </>
              )}
              <div className="text-[11px] text-app-text-fade pt-1">{formatYen(calc.headerAmount)}</div>
            </div>
          </div>
        </div>

        {/* 支払条件 */}
        <div className="mb-6">
          <label className="block text-xs text-app-text-mute mb-1">お支払条件</label>
          <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="契約書記載の支払条件に準ずる"
            className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50" />
        </div>

        {/* 備考 */}
        <div className="mb-6">
          <label className="block text-xs text-app-text-mute mb-1">備考（任意・案件固有のメモ）</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="例: 本請求書は、業務委託契約に基づく月額固定報酬の請求です。"
            rows={3}
            className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 resize-none" />
          <p className="text-[10px] text-app-text-fade mt-1">
            ※「インボイス制度...免税事業者」「振込手数料ご負担」の2行は自動で追記されます
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack}
            className="px-6 py-2.5 text-xs text-app-text-mute bg-app-surface-alt rounded-lg hover:bg-app-surface-hover transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!canSave || saving}
            className="flex-1 py-2.5 text-xs text-white bg-app-button rounded-lg hover:bg-app-button-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {isNew ? '作成する' : '更新する'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// 請求書プレビュー
// ============================================================
function InvoicePreview({
  invoiceId,
  onBack,
  onEdit,
}: {
  invoiceId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [issuer, setIssuer] = useState<{ business_name?: string; postal_code?: string; address?: string; phone?: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ spreadsheetUrl?: string; pdfUrl?: string } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoading(true);
      try {
        const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
        if (!inv) return;
        setInvoice(inv);

        const [itemRes, clientRes, bankRes, profileRes] = await Promise.all([
          supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
          supabase.from('clients').select('*').eq('id', inv.client_id).single(),
          inv.bank_account_id
            ? supabase.from('bank_accounts').select('*').eq('id', inv.bank_account_id).single()
            : Promise.resolve({ data: null }),
          supabase.from('profiles').select('business_name, postal_code, address, phone, email').eq('user_key', inv.owner).single(),
        ]);
        setItems(itemRes.data || []);
        if (clientRes.data) setClient(clientRes.data);
        if (bankRes.data) setBankAccount(bankRes.data);
        if (profileRes.data) setIssuer(profileRes.data as any);
      } catch (err) {
        console.error('プレビュー読込エラー:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId]);

  if (loading || !invoice) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-app-gold animate-spin" />
      </div>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const res = await fetch('/api/invoices/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      const data = await res.json();
      if (data.success) {
        setExportResult({
          spreadsheetUrl: data.spreadsheetUrl,
          pdfUrl: data.pdfUrl,
        });
        if (invoice) {
          setInvoice({ ...invoice, pdf_url: null, drive_file_id: data.spreadsheetId });
        }
        // v0.5.7: 生成されたスプシを自動で新規タブで開く（プレビュー確認用）
        if (data.spreadsheetUrl) {
          window.open(data.spreadsheetUrl, '_blank', 'noopener,noreferrer');
        }
      } else {
        alert(`作成に失敗しました: ${data.error}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('請求書の作成に失敗しました');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (d: string) => {
    const parts = d.split('-');
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`;
  };

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <ChevronLeft className="w-5 h-5 text-app-text-mute" />
          </button>
          <h2 className="text-sm font-medium text-app-text">
            請求書プレビュー
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-app-button text-white rounded-lg text-xs font-medium hover:bg-app-button-hover transition-colors disabled:opacity-50">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {exporting ? '作成中...' : '請求書作成'}
          </button>
          <button onClick={() => onEdit(invoiceId)}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-app-text rounded-lg text-xs border border-app-line-medium hover:bg-app-surface transition-colors">
            <Pencil className="w-3.5 h-3.5" />編集
          </button>
        </div>
      </div>

      {/* 出力結果リンク */}
      {exportResult && exportResult.spreadsheetUrl && (
        <div className="bg-app-green/5 rounded-lg px-4 py-3 mb-4 flex items-center gap-4">
          <span className="text-xs text-app-green font-medium">作成完了</span>
          <a href={exportResult.spreadsheetUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-app-gold hover:underline">スプレッドシートを開く</a>
          <span className="text-[10px] text-app-text-mute">※ プレビュー確認後、スプシから「ファイル→ダウンロード→PDF」で保存してください</span>
        </div>
      )}

      {/* 請求書本体 */}
      <div className="bg-white rounded-2xl p-8 max-w-2xl mx-auto" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>

        {/* タイトル */}
        <h1 className="text-center font-['Shippori_Mincho'] text-2xl text-app-text mb-8 tracking-widest">
          請　求　書
        </h1>

        {/* 宛先・日付・請求元 */}
        <div className="flex justify-between mb-8">
          <div>
            <div className="text-lg font-medium text-app-text mb-1">
              {client?.name || '—'} 御中
            </div>
            {client?.address && (
              <div className="text-xs text-app-text-mute">
                {client.postal_code ? `〒${client.postal_code} ` : ''}{client.address}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-['Saira_Condensed'] text-sm text-app-text-mute tabular-nums">
              {invoice.invoice_number}
            </div>
            <div className="text-xs text-app-text-mute mt-1 mb-3">
              {formatDate(invoice.issue_date)}
            </div>
            {issuer && (
              <div className="text-xs text-app-text space-y-0.5">
                {issuer.business_name && <div className="font-medium">{issuer.business_name}</div>}
                {issuer.address && (
                  <div className="text-app-text-mute">{issuer.postal_code ? `〒${issuer.postal_code} ` : ''}{issuer.address}</div>
                )}
                {issuer.phone && <div className="text-app-text-mute font-['Saira_Condensed'] tabular-nums">TEL {issuer.phone}</div>}
                {issuer.email && <div className="text-app-text-mute">{issuer.email}</div>}
              </div>
            )}
          </div>
        </div>

        {/* 件名 */}
        {invoice.subject && (
          <div className="mb-4">
            <div className="text-xs text-app-text-mute mb-0.5">件名</div>
            <div className="text-sm text-app-text">{invoice.subject}</div>
          </div>
        )}

        {/* 冒頭金額: header_amount_type で切替 */}
        <div className="bg-app-surface-alt rounded-lg px-6 py-4 mb-4 flex items-center justify-between">
          <span className="text-sm text-app-text">
            {invoice.withholding_tax && invoice.header_amount_type === 'net_payment'
              ? '差引お振込額'
              : 'ご請求金額（税込）'}
          </span>
          <span className="text-2xl font-['Saira_Condensed'] tabular-nums font-medium text-app-green">
            ¥{(
              invoice.withholding_tax && invoice.header_amount_type === 'net_payment'
                ? (invoice.net_payment ?? invoice.total)
                : invoice.total
            ).toLocaleString()}
          </span>
        </div>

        {/* 支払期限 */}
        {invoice.due_date && (
          <div className="mb-6 text-sm">
            <span className="text-app-text-mute mr-3">お支払期限</span>
            <span className="text-app-text">{formatDate(invoice.due_date)}</span>
          </div>
        )}

        {/* 明細テーブル */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-app-text">
              <th className="text-left py-2 text-xs text-app-text font-medium" style={{ width: '45%' }}>品名・摘要</th>
              <th className="text-center py-2 text-xs text-app-text font-medium w-16">数量</th>
              <th className="text-center py-2 text-xs text-app-text font-medium w-14">単位</th>
              <th className="text-right py-2 text-xs text-app-text font-medium w-24">単価</th>
              <th className="text-right py-2 text-xs text-app-text font-medium w-28">金額</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-app-line">
                <td className="py-2.5 text-app-text">{item.description}</td>
                <td className="py-2.5 text-center font-['Saira_Condensed'] tabular-nums text-app-text-sub">{item.quantity}</td>
                <td className="py-2.5 text-center text-app-text-sub">{item.unit || '式'}</td>
                <td className="py-2.5 text-right font-['Saira_Condensed'] tabular-nums text-app-text-sub">¥{item.unit_price.toLocaleString()}</td>
                <td className="py-2.5 text-right font-['Saira_Condensed'] tabular-nums text-app-text">¥{item.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 小計・税・合計（源泉ありなら源泉行と差引お振込額を追加） */}
        <div className="flex justify-end mb-8">
          <div className="w-60">
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-app-text-mute">小計</span>
              <span className="font-['Saira_Condensed'] tabular-nums">¥{invoice.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-app-text-mute">消費税</span>
              <span className="font-['Saira_Condensed'] tabular-nums text-app-text-mute">—</span>
            </div>
            <div className="flex justify-between py-1.5 text-sm border-t-2 border-app-text mt-1 pt-2">
              <span className="font-medium text-app-text">合計（税込）</span>
              <span className="font-['Saira_Condensed'] tabular-nums font-medium text-app-text text-lg">¥{invoice.total.toLocaleString()}</span>
            </div>
            {invoice.withholding_tax && (
              <>
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-app-text-mute">源泉徴収額</span>
                  <span className="font-['Saira_Condensed'] tabular-nums text-app-red-soft">−¥{(invoice.withholding_amount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 text-sm border-t-2 border-app-text mt-1 pt-2">
                  <span className="font-medium text-app-text">差引お振込額</span>
                  <span className="font-['Saira_Condensed'] tabular-nums font-medium text-app-green text-lg">¥{(invoice.net_payment ?? invoice.total).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 振込先 */}
        {bankAccount && (
          <div className="border-t border-app-line pt-4 mb-4">
            <div className="text-xs text-app-text-mute mb-2">お振込先</div>
            <div className="text-sm text-app-text space-y-0.5">
              <div>{bankAccount.bank_name}{bankAccount.bank_code && !(bankAccount.bank_name || '').includes(`（${bankAccount.bank_code}）`) ? `（${bankAccount.bank_code}）` : ''}</div>
              <div className="text-app-text-sub">{bankAccount.branch_name || ''}{bankAccount.branch_code && !(bankAccount.branch_name || '').includes(`（${bankAccount.branch_code}）`) ? `（${bankAccount.branch_code}）` : ''}</div>
              <div className="text-app-text-sub">{({ savings: '普通', ordinary: '普通', checking: '当座' } as Record<string, string>)[bankAccount.account_type] || bankAccount.account_type} {bankAccount.account_number || ''}</div>
              <div className="text-app-text-sub">{bankAccount.account_holder_kana || bankAccount.account_holder_name || bankAccount.name}</div>
            </div>
          </div>
        )}

        {/* 支払条件 */}
        {invoice.payment_terms && (
          <div className="border-t border-app-line pt-4 mb-4">
            <div className="text-xs text-app-text-mute mb-1">お支払条件</div>
            <div className="text-sm text-app-text-sub">{invoice.payment_terms}</div>
          </div>
        )}

        {/* 備考（固定2行: インボイス免税注記 + 振込手数料負担 を必ず表示） */}
        <div className="border-t border-app-line pt-4">
          <div className="text-xs text-app-text-mute mb-1">備考</div>
          <div className="text-sm text-app-text-sub whitespace-pre-wrap">
            {[
              (invoice.notes || '').trim(),
              '本請求書は、2023年10月1日施行のインボイス制度における「適格請求書発行事業者以外の事業者」として発行するものです。',
              feeBurdenLabel(invoice.fee_burden),
            ].filter(Boolean).join('\n\n')}
          </div>
        </div>
      </div>
    </div>
  );
}
