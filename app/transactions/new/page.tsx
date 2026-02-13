'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DIVISIONS, KAMOKU, REVENUE_TYPES } from '@/lib/constants';

export default function NewTransactionPage() {
  const router = useRouter();
  const [txType, setTxType] = useState<'expense' | 'revenue'>('expense');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      tx_type: txType,
      date: formData.get('date'),
      amount: Number(formData.get('amount')),
      kamoku: formData.get('kamoku'),
      division: formData.get('division'),
      store: formData.get('store') || null,
      description: formData.get('description') || null,
      memo: formData.get('memo') || null,
      revenue_type: txType === 'revenue' ? formData.get('revenue_type') : null,
    };

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        router.push('/transactions');
        router.refresh();
      } else {
        alert('エラーが発生しました');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const kamokuOptions = KAMOKU.filter((k) =>
    txType === 'revenue' ? k.type === 'revenue' : k.type === 'expense'
  );

  return (
    <div className="pt-14 max-w-2xl">
      <h2 className="text-2xl font-semibold font-mincho mb-6">取引追加</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-gray-100 space-y-5">
        {/* 種別 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">種別</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTxType('expense')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                txType === 'expense'
                  ? 'bg-k10-crimson text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              経費
            </button>
            <button
              type="button"
              onClick={() => setTxType('revenue')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                txType === 'revenue'
                  ? 'bg-k10-green text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              売上
            </button>
          </div>
        </div>

        {/* 日付・金額 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
            <input
              type="date"
              name="date"
              required
              defaultValue={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額（税込）</label>
            <input
              type="number"
              name="amount"
              required
              min="0"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              placeholder="0"
            />
          </div>
        </div>

        {/* 科目・部門 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">勘定科目</label>
            <select
              name="kamoku"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              {kamokuOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">部門</label>
            <select
              name="division"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              {DIVISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.short} - {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 売上の場合：収益タイプ */}
        {txType === 'revenue' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">収益タイプ</label>
            <select
              name="revenue_type"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              {REVENUE_TYPES.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 取引先・内容 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">取引先・店名</label>
          <input
            type="text"
            name="store"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            placeholder="例：ヨドバシカメラ"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">内容・摘要</label>
          <input
            type="text"
            name="description"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            placeholder="例：SDカード購入"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
          <textarea
            name="memo"
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            placeholder="補足メモ"
          />
        </div>

        {/* 送信ボタン */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 bg-k10-gold text-white rounded-lg text-sm font-medium hover:bg-k10-gold/90 transition-colors disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
