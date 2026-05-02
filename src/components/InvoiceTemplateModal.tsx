'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { BankAccount } from '@/types/database';

// ============================================================
// v0.8.0: 請求書汎用テンプレ編集モーダル
// ============================================================

interface TemplateItemForm {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
}

interface SaveForm {
  id?: string;
  name: string;
  subject: string;
  payment_terms: string;
  notes: string;
  bank_account_id: string | null;
  withholding_tax: boolean;
  withholding_basis: string;
  header_amount_type: string;
  fee_burden: string;
  items: TemplateItemForm[];
}

interface Props {
  template: any | null;
  templateItems: any[];
  bankAccounts: BankAccount[];
  onSave: (form: SaveForm) => Promise<void>;
  onClose: () => void;
}

export default function InvoiceTemplateModal({
  template,
  templateItems,
  bankAccounts,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [paymentTerms, setPaymentTerms] = useState(template?.payment_terms || '契約書記載の支払条件に準ずる');
  const [notes, setNotes] = useState(template?.notes || '');
  const [bankAccountId, setBankAccountId] = useState<string>(template?.bank_account_id || '');
  const [withholdingTax, setWithholdingTax] = useState<boolean>(template?.withholding_tax || false);
  const [withholdingBasis, setWithholdingBasis] = useState<string>(template?.withholding_basis || 'tax_excluded');
  const [headerAmountType, setHeaderAmountType] = useState<string>(template?.header_amount_type || 'total');
  const [feeBurden, setFeeBurden] = useState<string>(template?.fee_burden || 'client');
  const [items, setItems] = useState<TemplateItemForm[]>(
    templateItems.length > 0
      ? templateItems.map((it: any, idx: number) => ({
          id: it.id,
          description: it.description || '',
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          sort_order: idx,
        }))
      : [{ description: '', quantity: 1, unit_price: 0, sort_order: 0 }]
  );
  const [saving, setSaving] = useState(false);

  const addItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0, sort_order: items.length }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof TemplateItemForm, value: any) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const subtotal = items.reduce((s, it) => s + (it.quantity * it.unit_price), 0);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        id: template?.id,
        name: name.trim(),
        subject,
        payment_terms: paymentTerms,
        notes,
        bank_account_id: bankAccountId || null,
        withholding_tax: withholdingTax,
        withholding_basis: withholdingBasis,
        header_amount_type: headerAmountType,
        fee_burden: feeBurden,
        items,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <p className="text-sm font-medium text-app-text">
            {template ? '請求書テンプレを編集' : '請求書テンプレを追加'}
          </p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/5">
            <X className="w-4 h-4 text-app-text-mute" />
          </button>
        </div>

        {/* ボディ */}
        <div className="p-5 space-y-4">
          {/* テンプレ名 */}
          <div>
            <label className="text-[10px] font-medium tracking-wider text-app-text-mute block mb-1.5">
              テンプレ名 <span className="text-app-red">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 月額顧問 / 撮影スポット / 編集スポット"
              className="w-full px-3 py-2 text-xs bg-app-surface-alt rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-app-button/10"
            />
          </div>

          {/* 件名 */}
          <div>
            <label className="text-[10px] font-medium tracking-wider text-app-text-mute block mb-1.5">件名</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例: ○○年○月分 ご請求書"
              className="w-full px-3 py-2 text-xs bg-app-surface-alt rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-app-button/10"
            />
          </div>

          {/* 明細 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-medium tracking-wider text-app-text-mute">明細</label>
              <button
                onClick={addItem}
                disabled={items.length >= 5}
                className="text-[10px] text-app-text hover:underline disabled:text-app-text-fade disabled:no-underline"
              >
                + 行を追加
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="bg-app-surface-alt rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="text"
                      value={it.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      placeholder="品名・内容"
                      className="flex-1 px-2 py-1.5 text-xs bg-white rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-app-button/20"
                    />
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={items.length <= 1}
                      className="p-1.5 rounded-md hover:bg-state-error-bg disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <Trash2 className="w-3 h-3 text-app-red" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[9px] text-app-text-fade mb-0.5">数量</div>
                      <input
                        type="number"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                        className="w-full px-2 py-1.5 text-xs bg-white rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-app-button/20 font-['Saira_Condensed'] tabular-nums"
                      />
                    </div>
                    <div>
                      <div className="text-[9px] text-app-text-fade mb-0.5">単価</div>
                      <input
                        type="number"
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, 'unit_price', Number(e.target.value))}
                        className="w-full px-2 py-1.5 text-xs bg-white rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-app-button/20 font-['Saira_Condensed'] tabular-nums"
                      />
                    </div>
                    <div>
                      <div className="text-[9px] text-app-text-fade mb-0.5">金額</div>
                      <div className="px-2 py-1.5 text-xs bg-white rounded-md text-app-text-sub font-['Saira_Condensed'] tabular-nums">
                        ¥{Math.round(it.quantity * it.unit_price).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end mt-2 px-2">
              <span className="text-[10px] text-app-text-mute mr-2">小計</span>
              <span className="text-xs font-medium font-['Saira_Condensed'] tabular-nums text-app-text">
                ¥{Math.round(subtotal).toLocaleString()}
              </span>
            </div>
          </div>

          {/* 源泉徴収 */}
          <div>
            <label className="text-[10px] font-medium tracking-wider text-app-text-mute block mb-1.5">源泉徴収</label>
            <div className="flex gap-2">
              <button
                onClick={() => setWithholdingTax(false)}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  !withholdingTax ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-mute'
                }`}
              >
                なし
              </button>
              <button
                onClick={() => setWithholdingTax(true)}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  withholdingTax ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-mute'
                }`}
              >
                あり
              </button>
            </div>
            {withholdingTax && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] text-app-text-fade mb-0.5">源泉計算基準</div>
                  <select
                    value={withholdingBasis}
                    onChange={(e) => setWithholdingBasis(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-app-surface-alt rounded-md border-0 focus:outline-none"
                  >
                    <option value="tax_excluded">税抜基準</option>
                    <option value="tax_included">税込基準</option>
                  </select>
                </div>
                <div>
                  <div className="text-[9px] text-app-text-fade mb-0.5">ヘッダー金額</div>
                  <select
                    value={headerAmountType}
                    onChange={(e) => setHeaderAmountType(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-app-surface-alt rounded-md border-0 focus:outline-none"
                  >
                    <option value="total">合計</option>
                    <option value="net_payment">差引振込額</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 振込先口座 */}
          <div>
            <label className="text-[10px] font-medium tracking-wider text-app-text-mute block mb-1.5">振込先口座</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-app-surface-alt rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-app-button/10"
            >
              <option value="">（指定なし・都度選択）</option>
              {bankAccounts.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name} {b.branch_name} {b.account_type} {b.account_number}
                </option>
              ))}
            </select>
          </div>

          {/* 振込手数料 */}
          <div>
            <label className="text-[10px] font-medium tracking-wider text-app-text-mute block mb-1.5">振込手数料</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFeeBurden('client')}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  feeBurden === 'client' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-mute'
                }`}
              >
                貴社ご負担
              </button>
              <button
                onClick={() => setFeeBurden('self')}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${
                  feeBurden === 'self' ? 'bg-app-button text-white' : 'bg-app-surface-alt text-app-text-mute'
                }`}
              >
                弊社負担
              </button>
            </div>
          </div>

          {/* 支払条件 */}
          <div>
            <label className="text-[10px] font-medium tracking-wider text-app-text-mute block mb-1.5">支払条件</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-app-surface-alt rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-app-button/10"
            />
          </div>

          {/* 備考 */}
          <div>
            <label className="text-[10px] font-medium tracking-wider text-app-text-mute block mb-1.5">備考</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs bg-app-surface-alt rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-app-button/10 resize-none"
            />
          </div>
        </div>

        {/* フッター */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 text-xs text-app-text-mute bg-app-surface-alt rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 text-xs text-white bg-app-button rounded-lg hover:bg-app-button-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
