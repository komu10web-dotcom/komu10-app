'use client';

import { useState, useEffect, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { supabase } from '@/lib/supabase';
import { Transaction } from '@/types/database';
import { Plus, Upload, FileText, Receipt, ChevronRight, Search, X } from 'lucide-react';
import Link from 'next/link';

type Tab = 'transactions' | 'journal' | 'tax';

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('transactions');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInput, setShowInput] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, []);

  async function loadTransactions() {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatAmount = (amount: number) => {
    const formatted = new Intl.NumberFormat('ja-JP', {
      maximumFractionDigits: 0,
    }).format(Math.abs(amount));
    return amount < 0 ? `-¥${formatted}` : `¥${formatted}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="min-h-screen bg-surface pb-20 md:pt-20">
      <Navigation />

      <main className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-xl font-medium text-black/90 mb-1">会計</h1>
          <p className="text-sm text-black/40">財務会計 · 税務署向け</p>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1">
          {[
            { id: 'transactions', label: '取引一覧' },
            { id: 'journal', label: '仕訳帳' },
            { id: 'tax', label: '確定申告' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`
                flex-1 py-2 px-4 rounded-lg text-sm transition-smooth
                ${activeTab === tab.id
                  ? 'bg-gold text-white'
                  : 'text-black/50 hover:text-black/70'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setShowInput(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold text-white rounded-xl text-sm font-medium transition-smooth hover:bg-gold/90"
          >
            <Plus className="w-4 h-4" />
            手入力
          </button>
          <button
            onClick={() => setShowCsvImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-black/70 rounded-xl text-sm transition-smooth hover:bg-black/5"
          >
            <Upload className="w-4 h-4" />
            CSV取込
          </button>
        </div>

        {/* Transactions List */}
        {activeTab === 'transactions' && (
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-12 text-black/40">読み込み中...</div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-black/20 mx-auto mb-3" />
                <p className="text-sm text-black/40">取引がありません</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <Link
                  key={tx.id}
                  href={`/accounting/transactions/${tx.id}`}
                  className="flex items-center gap-4 bg-white rounded-xl p-4 transition-smooth hover:bg-gold/5"
                >
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.amount < 0 ? 'bg-crimson/10' : 'bg-forest/10'
                    }`}>
                      {tx.receipt_url ? (
                        <Receipt className={`w-4 h-4 ${tx.amount < 0 ? 'text-crimson' : 'text-forest'}`} />
                      ) : (
                        <FileText className={`w-4 h-4 ${tx.amount < 0 ? 'text-crimson' : 'text-forest'}`} />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-black/80 truncate">
                      {tx.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-black/40">{formatDate(tx.date)}</span>
                      {tx.category && (
                        <span className="text-xs text-black/40 px-1.5 py-0.5 bg-black/5 rounded">
                          {tx.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`font-number text-base ${
                    tx.amount < 0 ? 'text-crimson' : 'text-forest'
                  }`}>
                    {formatAmount(tx.amount)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-black/20" />
                </Link>
              ))
            )}
          </div>
        )}

        {/* Journal */}
        {activeTab === 'journal' && (
          <JournalView transactions={transactions} />
        )}

        {/* Tax */}
        {activeTab === 'tax' && (
          <div className="text-center py-12">
            <p className="text-sm text-black/40">確定申告機能は準備中です</p>
          </div>
        )}
      </main>

      {/* Manual Input Modal */}
      {showInput && (
        <ManualInputModal 
          onClose={() => setShowInput(false)} 
          onSave={loadTransactions}
        />
      )}

      {/* CSV Import Modal */}
      {showCsvImport && (
        <CsvImportModal 
          onClose={() => setShowCsvImport(false)}
          onImport={loadTransactions}
        />
      )}
    </div>
  );
}

// 仕訳帳コンポーネント
function JournalView({ transactions }: { transactions: Transaction[] }) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(Math.abs(amount));
  };

  // 勘定科目マッピング
  const getAccountPair = (tx: Transaction) => {
    if (tx.amount < 0) {
      // 支出
      return {
        debit: { account: tx.category || '経費', amount: Math.abs(tx.amount) },
        credit: { account: tx.account, amount: Math.abs(tx.amount) },
      };
    } else {
      // 収入
      return {
        debit: { account: tx.account, amount: tx.amount },
        credit: { account: '売上', amount: tx.amount },
      };
    }
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-black/5">
          <tr>
            <th className="py-3 px-4 text-left text-xs text-black/50 font-medium">日付</th>
            <th className="py-3 px-4 text-left text-xs text-black/50 font-medium">借方</th>
            <th className="py-3 px-4 text-right text-xs text-black/50 font-medium">金額</th>
            <th className="py-3 px-4 text-left text-xs text-black/50 font-medium">貸方</th>
            <th className="py-3 px-4 text-right text-xs text-black/50 font-medium">金額</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const pair = getAccountPair(tx);
            return (
              <tr key={tx.id} className="border-t border-black/5">
                <td className="py-3 px-4 text-black/60">
                  {new Date(tx.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                </td>
                <td className="py-3 px-4 text-black/80">{pair.debit.account}</td>
                <td className="py-3 px-4 text-right font-number text-black/70">
                  {formatAmount(pair.debit.amount)}
                </td>
                <td className="py-3 px-4 text-black/80">{pair.credit.account}</td>
                <td className="py-3 px-4 text-right font-number text-black/70">
                  {formatAmount(pair.credit.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 手入力モーダル
function ManualInputModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    isExpense: true,
    account: '現金',
    category: '',
    counterpart: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const amount = parseFloat(form.amount) * (form.isExpense ? -1 : 1);
      
      const { error } = await (supabase.from('transactions') as any).insert({
        date: form.date,
        description: form.description,
        amount,
        account: form.account,
        category: form.category || null,
        counterpart: form.counterpart || null,
      });

      if (error) throw error;
      onSave();
      onClose();
    } catch (error) {
      console.error('Save error:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <h2 className="text-lg font-medium">手入力</h2>
          <button onClick={onClose} className="p-2 text-black/40 hover:text-black/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 収入/支出切替 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isExpense: true }))}
              className={`flex-1 py-2 rounded-lg text-sm transition-smooth ${
                form.isExpense ? 'bg-crimson text-white' : 'bg-black/5 text-black/60'
              }`}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isExpense: false }))}
              className={`flex-1 py-2 rounded-lg text-sm transition-smooth ${
                !form.isExpense ? 'bg-forest text-white' : 'bg-black/5 text-black/60'
              }`}
            >
              収入
            </button>
          </div>

          {/* 日付 */}
          <div>
            <label className="block text-xs text-black/50 mb-1">日付</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full px-4 py-3 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              required
            />
          </div>

          {/* 内容 */}
          <div>
            <label className="block text-xs text-black/50 mb-1">内容</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="例: 打ち合わせ交通費"
              className="w-full px-4 py-3 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              required
            />
          </div>

          {/* 金額 */}
          <div>
            <label className="block text-xs text-black/50 mb-1">金額</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40">¥</span>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                className="w-full pl-8 pr-4 py-3 bg-black/5 rounded-xl text-sm font-number focus:outline-none focus:ring-2 focus:ring-gold"
                required
              />
            </div>
          </div>

          {/* 勘定科目 */}
          <div>
            <label className="block text-xs text-black/50 mb-1">勘定科目</label>
            <select
              value={form.account}
              onChange={(e) => setForm(f => ({ ...f, account: e.target.value }))}
              className="w-full px-4 py-3 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="現金">現金</option>
              <option value="普通預金">普通預金</option>
              <option value="クレジットカード">クレジットカード</option>
              <option value="売掛金">売掛金</option>
            </select>
          </div>

          {/* カテゴリ */}
          <div>
            <label className="block text-xs text-black/50 mb-1">カテゴリ（任意）</label>
            <select
              value={form.category}
              onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-4 py-3 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <option value="">選択してください</option>
              <option value="旅費交通費">旅費交通費</option>
              <option value="消耗品費">消耗品費</option>
              <option value="通信費">通信費</option>
              <option value="接待交際費">接待交際費</option>
              <option value="広告宣伝費">広告宣伝費</option>
              <option value="外注費">外注費</option>
              <option value="雑費">雑費</option>
            </select>
          </div>

          {/* 取引先 */}
          <div>
            <label className="block text-xs text-black/50 mb-1">取引先（任意）</label>
            <input
              type="text"
              value={form.counterpart}
              onChange={(e) => setForm(f => ({ ...f, counterpart: e.target.value }))}
              placeholder="例: JR東日本"
              className="w-full px-4 py-3 bg-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </div>

          {/* 保存ボタン */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-gold text-white rounded-xl text-sm font-medium transition-smooth hover:bg-gold/90 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </form>
      </div>
    </div>
  );
}

// CSVインポートモーダル
function CsvImportModal({ onClose, onImport }: { onClose: () => void; onImport: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').slice(0, 6); // プレビュー5行
      const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
      setPreview(rows);
    };
    reader.readAsText(f, 'Shift_JIS'); // 日本語クレカCSV対応
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/transactions/import-csv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Import failed');

      const result = await response.json();
      alert(`${result.imported}件インポートしました`);
      onImport();
      onClose();
    } catch (error) {
      console.error('Import error:', error);
      alert('インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full max-w-2xl rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <h2 className="text-lg font-medium">クレカCSV取込</h2>
          <button onClick={onClose} className="p-2 text-black/40 hover:text-black/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ファイル選択 */}
          <label className="block">
            <div className="flex items-center justify-center w-full h-32 border-2 border-dashed border-black/10 rounded-xl cursor-pointer hover:border-gold/50 hover:bg-gold/5 transition-smooth">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="text-center">
                <Upload className="w-8 h-8 text-black/30 mx-auto mb-2" />
                <p className="text-sm text-black/50">
                  {file ? file.name : 'CSVファイルを選択'}
                </p>
              </div>
            </div>
          </label>

          {/* プレビュー */}
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className={i === 0 ? 'bg-black/5' : ''}>
                      {row.map((cell, j) => (
                        <td key={j} className="py-2 px-3 border-b border-black/5 truncate max-w-[150px]">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* インポートボタン */}
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full py-3 bg-gold text-white rounded-xl text-sm font-medium transition-smooth hover:bg-gold/90 disabled:opacity-50"
          >
            {importing ? 'インポート中...' : 'インポート'}
          </button>
        </div>
      </div>
    </div>
  );
}
