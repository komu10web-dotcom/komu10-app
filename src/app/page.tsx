'use client';

import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { Uploader } from '@/components/Uploader';
import { supabase } from '@/lib/supabase';
import { Receipt, Check, AlertCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface PendingReceipt {
  id: string;
  vendor?: string;
  amount?: number;
  date?: string;
  confidence?: number;
}

interface MonthlySummary {
  income: number;
  expense: number;
  balance: number;
}

export default function HomePage() {
  const [pendingReceipts, setPendingReceipts] = useState<PendingReceipt[]>([]);
  const [summary, setSummary] = useState<MonthlySummary>({ income: 0, expense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // 未処理領収書（最大3件）
      const { data: receipts } = await supabase
        .from('receipts')
        .select('id, ai_extracted, confidence_score')
        .in('status', ['pending', 'needs_review'])
        .order('created_at', { ascending: false })
        .limit(3) as { data: Array<{ id: string; ai_extracted: any; confidence_score: number | null }> | null };

      if (receipts) {
        setPendingReceipts(receipts.map(r => ({
          id: r.id,
          vendor: r.ai_extracted?.vendor,
          amount: r.ai_extracted?.amount,
          date: r.ai_extracted?.date,
          confidence: r.confidence_score ?? undefined,
        })));
      }

      // 今月の集計
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth) as { data: Array<{ amount: number }> | null };

      if (transactions) {
        const income = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
        setSummary({ income, expense, balance: income - expense });
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', { 
      style: 'currency', 
      currency: 'JPY',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-black/10';
    if (confidence >= 0.85) return 'bg-forest';
    if (confidence >= 0.7) return 'bg-gold';
    return 'bg-crimson';
  };

  return (
    <div className="min-h-screen bg-surface pb-20 md:pt-20">
      <Navigation />

      <main className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <header className="mb-8">
          <h1 className="font-display text-2xl tracking-wide text-black/90 mb-1">
            komu10
          </h1>
          <p className="text-sm text-black/40">
            {new Date().toLocaleDateString('ja-JP', { month: 'long', year: 'numeric' })}
          </p>
        </header>

        {/* Uploader */}
        <section className="mb-8">
          <Uploader onUploadComplete={() => loadData()} />
        </section>

        {/* Monthly Summary - ORION: 数字を並べるな */}
        <section className="mb-8">
          <div className="bg-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-black/40 uppercase tracking-wider">今月</span>
              {summary.balance >= 0 ? (
                <span className="flex items-center gap-1 text-xs text-forest">
                  <Check className="w-3 h-3" />
                  良好
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-crimson">
                  <AlertCircle className="w-3 h-3" />
                  注意
                </span>
              )}
            </div>
            <div className="font-number text-3xl text-black/90 tracking-tight">
              {formatAmount(summary.balance)}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-black/40">
              <span>収入 {formatAmount(summary.income)}</span>
              <span>支出 {formatAmount(summary.expense)}</span>
            </div>
          </div>
        </section>

        {/* Pending Receipts - NOA: 最大3件のみ */}
        {pendingReceipts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs text-black/40 uppercase tracking-wider">
                未処理
              </h2>
              <span className="text-xs text-black/30">{pendingReceipts.length}件</span>
            </div>

            <div className="space-y-2">
              {pendingReceipts.map((receipt) => (
                <Link
                  key={receipt.id}
                  href={`/receipts/${receipt.id}`}
                  className="flex items-center gap-4 bg-white rounded-xl p-4 transition-smooth hover:bg-gold/5"
                >
                  <div className={`w-2 h-2 rounded-full ${getConfidenceColor(receipt.confidence)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-black/80 truncate">
                      {receipt.vendor || '店舗名なし'}
                    </p>
                    {receipt.date && (
                      <p className="text-xs text-black/40">{receipt.date}</p>
                    )}
                  </div>
                  {receipt.amount && (
                    <span className="font-number text-base text-black/70">
                      {formatAmount(receipt.amount)}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-black/20" />
                </Link>
              ))}
            </div>

            {pendingReceipts.length > 0 && (
              <Link
                href="/accounting/receipts"
                className="block mt-3 text-center text-sm text-gold hover:text-gold/80 transition-smooth"
              >
                すべて表示
              </Link>
            )}
          </section>
        )}

        {/* Empty State */}
        {!loading && pendingReceipts.length === 0 && (
          <section className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-forest/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-forest" />
            </div>
            <p className="text-sm text-black/60">未処理なし</p>
            <p className="text-xs text-black/40 mt-1">すべて整理されています</p>
          </section>
        )}
      </main>
    </div>
  );
}
