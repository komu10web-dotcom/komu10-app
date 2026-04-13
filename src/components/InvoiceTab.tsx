'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { INVOICE_STATUS } from '@/types/database';
import type { Invoice, InvoiceItem, Client, BankAccount, InvoiceStatusKey } from '@/types/database';
import { Plus, Pencil, Eye, Trash2, Loader2, X, ChevronLeft, Copy } from 'lucide-react';

// ============================================================
// 型定義
// ============================================================
interface InvoiceTabProps {
  owner: string; // 'tomo' | 'toshiki' | 'all'
  clients: Client[];
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
  unit_price: string;
}

// ============================================================
// ステータスバッジスタイル
// ============================================================
const INV_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft:  { bg: 'bg-[#F5F5F3]', text: 'text-[#999]' },
  issued: { bg: 'bg-[#D4A03A]/10', text: 'text-[#D4A03A]' },
  paid:   { bg: 'bg-[#1B4D3E]/10', text: 'text-[#1B4D3E]' },
};

// ============================================================
// メインコンポーネント
// ============================================================
export default function InvoiceTab({ owner, clients }: InvoiceTabProps) {
  // 画面モード: list / edit / preview
  const [view, setView] = useState<'list' | 'edit' | 'preview'>('list');

  // 一覧
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 編集対象
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // 銀行口座（振込先）
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const effectiveOwner = owner === 'all' ? 'tomo' : owner;

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
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            請求書作成
          </button>
          <div className="flex items-center gap-1 ml-auto bg-[#F5F5F3] rounded-lg p-0.5">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                statusFilter === 'all' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#999]'
              }`}
            >
              すべて
            </button>
            {(Object.keys(INVOICE_STATUS) as InvoiceStatusKey[]).map((key) => (
              <button key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                  statusFilter === key ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#999]'
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
              <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-[#ccc]">
              請求書がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">請求書番号</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">発行日</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">ステータス</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">取引先</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal">合計</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const statusStyle = INV_STATUS_STYLES[inv.status] || INV_STATUS_STYLES.draft;
                    return (
                      <tr key={inv.id} className="border-b border-gray-50 hover:bg-[#F5F5F3]/50 transition-colors">
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs tabular-nums text-[#1a1a1a]">
                          {inv.invoice_number}
                        </td>
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs text-[#999] tabular-nums">
                          {formatDate(inv.issue_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {INVOICE_STATUS[inv.status as InvoiceStatusKey] || inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#1a1a1a]">{inv.client_name}</div>
                          {inv.client_number && (
                            <div className="text-[10px] font-['Saira_Condensed'] text-[#999]">{inv.client_number}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-['Saira_Condensed'] tabular-nums text-[#1B4D3E]">
                          {formatAmount(inv.total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openPreview(inv.id)}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors" title="プレビュー">
                              <Eye className="w-3.5 h-3.5 text-[#999]" />
                            </button>
                            <button onClick={() => openEdit(inv.id)}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors" title="編集">
                              <Pencil className="w-3.5 h-3.5 text-[#999]" />
                            </button>
                            <button onClick={() => setDeleteTarget(inv.id)}
                              className="p-1.5 hover:bg-[#C23728]/10 rounded-md transition-colors" title="削除">
                              <Trash2 className="w-3.5 h-3.5 text-[#999]" />
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
            <div className="flex items-center justify-end gap-4 px-4 py-3 border-t border-gray-100 bg-[#F5F5F3]/50">
              {(['draft', 'issued', 'paid'] as const).map((s) => {
                const sum = filtered.filter(i => i.status === s).reduce((a, i) => a + i.total, 0);
                if (sum === 0) return null;
                const style = INV_STATUS_STYLES[s];
                return (
                  <div key={s} className="text-xs">
                    <span className="text-[#999]">{INVOICE_STATUS[s]}: </span>
                    <span className={`font-['Saira_Condensed'] tabular-nums ${style.text}`}>{formatAmount(sum)}</span>
                  </div>
                );
              })}
              <div className="text-xs">
                <span className="text-[#999]">合計: </span>
                <span className="font-['Saira_Condensed'] text-[#1B4D3E] tabular-nums font-medium">
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
              <p className="text-sm text-[#1a1a1a] mb-4">この請求書を削除しますか？</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                  キャンセル
                </button>
                <button onClick={() => handleDelete(deleteTarget)}
                  className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e22] transition-colors">
                  削除する
                </button>
              </div>
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
        owner={effectiveOwner}
        clients={clients.filter(c => c.owner === effectiveOwner && c.is_active)}
        bankAccounts={bankAccounts.filter(b => b.owner === effectiveOwner)}
        onBack={() => { setView('list'); setEditInvoiceId(null); fetchInvoices(); }}
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
  owner,
  clients,
  bankAccounts,
  onBack,
  onPreview,
}: {
  invoiceId: string | null;
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
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string>('draft');
  const [invoiceNumber, setInvoiceNumber] = useState('');

  // 明細行
  const [items, setItems] = useState<ItemForm[]>([
    { description: '', quantity: '1', unit_price: '' },
  ]);

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
          setPeriodStart(inv.period_start || '');
          setPeriodEnd(inv.period_end || '');
          setBankAccountId(inv.bank_account_id || '');
          setNotes(inv.notes || '');
          setStatus(inv.status);
          setInvoiceNumber(inv.invoice_number);
        }
        const { data: itemData } = await supabase
          .from('invoice_items').select('*').eq('invoice_id', invoiceId).order('sort_order');
        if (itemData && itemData.length > 0) {
          setItems(itemData.map((it: any) => ({
            id: it.id,
            description: it.description,
            quantity: it.quantity.toString(),
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
        if (prev.bank_account_id) setBankAccountId(prev.bank_account_id);
        if (prev.invoice_items && prev.invoice_items.length > 0) {
          const sorted = [...prev.invoice_items].sort((a: any, b: any) => a.sort_order - b.sort_order);
          setItems(sorted.map((it: any) => ({
            description: it.description,
            quantity: it.quantity.toString(),
            unit_price: it.unit_price.toString(),
          })));
        }
      }
    })();
  }, [isNew, clientId, owner]);

  // 合計計算
  const calcItemAmount = (item: ItemForm) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return Math.round(qty * price);
  };

  const subtotal = items.reduce((s, it) => s + calcItemAmount(it), 0);
  // 免税事業者: tax_amount = 0
  const taxAmount = 0;
  const total = subtotal + taxAmount;

  // 明細行操作
  const addItem = () => setItems([...items, { description: '', quantity: '1', unit_price: '' }]);
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof ItemForm, value: string) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  // 保存
  const handleSave = async () => {
    if (!supabase || !clientId || items.length === 0) return;
    setSaving(true);
    try {
      const invoiceData: any = {
        owner,
        client_id: clientId,
        issue_date: issueDate,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        subtotal,
        tax_amount: taxAmount,
        total,
        status,
        bank_account_id: bankAccountId || null,
        notes: notes || null,
      };

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
          unit_price: parseFloat(it.unit_price) || 0,
          amount: calcItemAmount(it),
        }));

      if (itemRecords.length > 0) {
        const { error: itemErr } = await supabase.from('invoice_items').insert(itemRecords);
        if (itemErr) throw itemErr;
      }

      // 発行時にissued_atを記録
      if (status === 'issued' && isNew) {
        await supabase.from('invoices').update({ issued_at: new Date().toISOString() }).eq('id', savedId);
      }

      onBack();
    } catch (err) {
      console.error('請求書保存エラー:', err);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const canSave = clientId && items.some(it => it.description.trim());

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-1 hover:bg-black/5 rounded-md transition-colors">
          <ChevronLeft className="w-5 h-5 text-[#999]" />
        </button>
        <h2 className="text-sm font-medium text-[#1a1a1a]">
          {isNew ? '請求書を作成' : `請求書を編集（${invoiceNumber}）`}
        </h2>
      </div>

      <div className="bg-white rounded-2xl p-6" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
        {/* 基本情報 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* 取引先 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">取引先 <span className="text-[#C23728]">*</span></label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              <option value="">選択してください</option>
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.client_number} — {cl.name}</option>
              ))}
            </select>
          </div>

          {/* 発行日 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">発行日</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed']" />
          </div>

          {/* 対象期間 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">対象期間（開始）</label>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed']" />
          </div>
          <div>
            <label className="block text-xs text-[#999] mb-1">対象期間（終了）</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed']" />
          </div>

          {/* 振込先 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">振込先口座</label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              <option value="">選択してください</option>
              {bankAccounts.map((ba) => (
                <option key={ba.id} value={ba.id}>{ba.bank_name} {ba.branch_name || ''} ({ba.name})</option>
              ))}
            </select>
          </div>

          {/* ステータス */}
          <div>
            <label className="block text-xs text-[#999] mb-1">ステータス</label>
            <div className="flex gap-1.5">
              {(Object.keys(INVOICE_STATUS) as InvoiceStatusKey[]).map((key) => (
                <button key={key} type="button"
                  onClick={() => setStatus(key)}
                  className={`px-3 py-2 text-[11px] rounded-lg transition-colors ${
                    status === key ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>
                  {INVOICE_STATUS[key]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 明細行 */}
        <div className="mb-6">
          <div className="text-xs text-[#999] mb-2">明細</div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <input type="text" value={item.description}
                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                    placeholder="品名・内容"
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
                </div>
                <div className="w-20">
                  <input type="text" inputMode="numeric" value={item.quantity}
                    onChange={(e) => updateItem(idx, 'quantity', e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="数量"
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 text-center font-['Saira_Condensed'] tabular-nums" />
                </div>
                <div className="w-32">
                  <input type="text" inputMode="numeric" value={item.unit_price}
                    onChange={(e) => updateItem(idx, 'unit_price', e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="単価"
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 text-right font-['Saira_Condensed'] tabular-nums" />
                </div>
                <div className="w-28 flex items-center justify-end">
                  <span className="text-sm font-['Saira_Condensed'] tabular-nums text-[#1a1a1a]">
                    {calcItemAmount(item) > 0 ? `¥${calcItemAmount(item).toLocaleString()}` : '—'}
                  </span>
                </div>
                <button onClick={() => removeItem(idx)}
                  className={`p-2 rounded-md transition-colors ${items.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[#C23728]/10'}`}
                  disabled={items.length <= 1}>
                  <X className="w-3.5 h-3.5 text-[#999]" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-[#D4A03A] hover:text-[#b8882e] mt-3 transition-colors">
            <Plus className="w-3.5 h-3.5" />行を追加
          </button>
        </div>

        {/* 合計 */}
        <div className="border-t border-gray-100 pt-4 mb-6">
          <div className="flex justify-end gap-8">
            <div className="text-right space-y-1">
              <div className="text-xs text-[#999]">小計</div>
              <div className="text-xs text-[#999]">消費税</div>
              <div className="text-sm font-medium text-[#1a1a1a]">合計</div>
            </div>
            <div className="text-right space-y-1 font-['Saira_Condensed'] tabular-nums">
              <div className="text-sm text-[#1a1a1a]">{`¥${subtotal.toLocaleString()}`}</div>
              <div className="text-sm text-[#999]">—</div>
              <div className="text-lg font-medium text-[#1B4D3E]">{`¥${total.toLocaleString()}`}</div>
            </div>
          </div>
        </div>

        {/* 備考 */}
        <div className="mb-6">
          <label className="block text-xs text-[#999] mb-1">備考</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="備考・特記事項"
            rows={2}
            className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 resize-none" />
        </div>

        {/* アクション */}
        <div className="flex gap-2">
          <button onClick={onBack}
            className="px-6 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!canSave || saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
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
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

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
            <ChevronLeft className="w-5 h-5 text-[#999]" />
          </button>
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            請求書プレビュー
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(invoiceId)}
            className="flex items-center gap-1.5 px-4 py-2 bg-white text-[#1a1a1a] rounded-lg text-xs border border-gray-200 hover:bg-gray-50 transition-colors">
            <Pencil className="w-3.5 h-3.5" />編集
          </button>
        </div>
      </div>

      {/* 請求書本体 */}
      <div className="bg-white rounded-2xl p-8 max-w-2xl mx-auto" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>

        {/* タイトル */}
        <h1 className="text-center font-['Shippori_Mincho'] text-2xl text-[#1a1a1a] mb-8 tracking-widest">
          請　求　書
        </h1>

        {/* 宛先・日付・請求元 */}
        <div className="flex justify-between mb-8">
          <div>
            <div className="text-lg font-medium text-[#1a1a1a] mb-1">
              {client?.name || '—'} 御中
            </div>
            {client?.address && (
              <div className="text-xs text-[#999]">
                {client.postal_code ? `〒${client.postal_code} ` : ''}{client.address}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-['Saira_Condensed'] text-sm text-[#999] tabular-nums">
              {invoice.invoice_number}
            </div>
            <div className="text-xs text-[#999] mt-1 mb-3">
              {formatDate(invoice.issue_date)}
            </div>
            {issuer && (
              <div className="text-xs text-[#1a1a1a] space-y-0.5">
                {issuer.business_name && <div className="font-medium">{issuer.business_name}</div>}
                {issuer.address && (
                  <div className="text-[#999]">{issuer.postal_code ? `〒${issuer.postal_code} ` : ''}{issuer.address}</div>
                )}
                {issuer.phone && <div className="text-[#999] font-['Saira_Condensed'] tabular-nums">TEL {issuer.phone}</div>}
                {issuer.email && <div className="text-[#999]">{issuer.email}</div>}
              </div>
            )}
          </div>
        </div>

        {/* 対象期間 */}
        {(invoice.period_start || invoice.period_end) && (
          <div className="text-xs text-[#999] mb-4">
            対象期間: {invoice.period_start ? formatDate(invoice.period_start) : ''} 〜 {invoice.period_end ? formatDate(invoice.period_end) : ''}
          </div>
        )}

        {/* 合計金額 */}
        <div className="bg-[#F5F5F3] rounded-lg px-6 py-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-[#1a1a1a]">ご請求金額</span>
          <span className="text-2xl font-['Saira_Condensed'] tabular-nums font-medium text-[#1B4D3E]">
            ¥{invoice.total.toLocaleString()}
          </span>
        </div>

        {/* 明細テーブル */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b-2 border-[#1a1a1a]">
              <th className="text-left py-2 text-xs text-[#1a1a1a] font-medium" style={{ width: '50%' }}>品名</th>
              <th className="text-center py-2 text-xs text-[#1a1a1a] font-medium w-20">数量</th>
              <th className="text-right py-2 text-xs text-[#1a1a1a] font-medium w-28">単価</th>
              <th className="text-right py-2 text-xs text-[#1a1a1a] font-medium w-28">金額</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2.5 text-[#1a1a1a]">{item.description}</td>
                <td className="py-2.5 text-center font-['Saira_Condensed'] tabular-nums text-[#666]">{item.quantity}</td>
                <td className="py-2.5 text-right font-['Saira_Condensed'] tabular-nums text-[#666]">¥{item.unit_price.toLocaleString()}</td>
                <td className="py-2.5 text-right font-['Saira_Condensed'] tabular-nums text-[#1a1a1a]">¥{item.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 小計・税・合計 */}
        <div className="flex justify-end mb-8">
          <div className="w-60">
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-[#999]">小計</span>
              <span className="font-['Saira_Condensed'] tabular-nums">¥{invoice.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-[#999]">消費税</span>
              <span className="font-['Saira_Condensed'] tabular-nums text-[#999]">—</span>
            </div>
            <div className="flex justify-between py-1.5 text-sm border-t-2 border-[#1a1a1a] mt-1 pt-2">
              <span className="font-medium text-[#1a1a1a]">合計</span>
              <span className="font-['Saira_Condensed'] tabular-nums font-medium text-[#1B4D3E] text-lg">¥{invoice.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 振込先 */}
        {bankAccount && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            <div className="text-xs text-[#999] mb-2">お振込先</div>
            <div className="text-sm text-[#1a1a1a]">
              {bankAccount.bank_name} {bankAccount.branch_name || ''}
            </div>
            <div className="text-xs text-[#999] mt-0.5">
              {bankAccount.account_type} {bankAccount.account_number_last4 ? `****${bankAccount.account_number_last4}` : ''} / {bankAccount.name}
            </div>
          </div>
        )}

        {/* 備考 */}
        {invoice.notes && (
          <div className="border-t border-gray-100 pt-4">
            <div className="text-xs text-[#999] mb-1">備考</div>
            <div className="text-sm text-[#666] whitespace-pre-wrap">{invoice.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
