'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Uploader } from '@/components/Uploader';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface TransactionRow {
  id: string;
  date: string;
  store: string | null;
  description: string | null;
  amount: number;
  tx_type: 'expense' | 'revenue';
  kamoku: string;
  confirmed: boolean;
}

export default function HomeContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'all';
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  const [expenseTotal, setExpenseTotal] = useState(0);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  const [recentTx, setRecentTx] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const monthStr = `${year}-${String(currentMonth).padStart(2, '0')}`;
    const startDate = `${monthStr}-01`;
    const endDate = currentMonth === 12
      ? `${parseInt(year) + 1}-01-01`
      : `${year}-${String(currentMonth + 1).padStart(2, '0')}-01`;

    try {
      // 今月の取引（サマリー用）
      let summaryQuery = supabase
        .from('transactions')
        .select('amount, tx_type, confirmed')
        .gte('date', startDate)
        .lt('date', endDate);

      if (owner !== 'all') {
        summaryQuery = summaryQuery.eq('owner', owner);
      }

      const { data: summaryData } = await summaryQuery;

      if (summaryData) {
        let expSum = 0;
        let revSum = 0;
        let uncCount = 0;
        for (const row of summaryData) {
          if (row.tx_type === 'expense') expSum += row.amount;
          if (row.tx_type === 'revenue') revSum += row.amount;
          if (!row.confirmed) uncCount++;
        }
        setExpenseTotal(expSum);
        setRevenueTotal(revSum);
        setUnconfirmedCount(uncCount);
      }

      // 最近の取引5件
      let recentQuery = supabase
        .from('transactions')
        .select('id, date, store, description, amount, tx_type, kamoku, confirmed')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      if (owner !== 'all') {
        recentQuery = recentQuery.eq('owner', owner);
      }

      const { data: recentData } = await recentQuery;
      setRecentTx((recentData as TransactionRow[]) || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* ── 今月サマリー ── */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#D4A03A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#999]">今月の経費</span>
                  <span className="font-['Saira_Condensed'] text-2xl text-[#1a1a1a] tabular-nums">
                    {formatAmount(expenseTotal)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#999]">今月の売上</span>
                  <span className="font-['Saira_Condensed'] text-2xl text-[#1B4D3E] tabular-nums">
                    {formatAmount(revenueTotal)}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100">
                {unconfirmedCount === 0 ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1B4D3E]" />
                    <span className="text-sm text-[#1B4D3E]">問題なし</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#D4A03A]" />
                    <span className="text-sm text-[#D4A03A]">
                      確認待ち {unconfirmedCount}件
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── 領収書アップローダー ── */}
        <Uploader onUploadComplete={fetchData} />

        {/* ── 最近の取引 ── */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <h2 className="text-xs text-[#999] mb-3">最近の取引</h2>

          {loading ? (
            <div className="h-20 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-[#D4A03A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : recentTx.length === 0 ? (
            <p className="text-sm text-[#ccc] py-4 text-center">取引がありません</p>
          ) : (
            <div className="space-y-0">
              {recentTx.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-['Saira_Condensed'] text-xs text-[#999] w-10 shrink-0 tabular-nums">
                      {formatDate(tx.date)}
                    </span>
                    <span className="text-sm text-[#1a1a1a] truncate">
                      {tx.store || tx.description || KAMOKU[tx.kamoku as keyof typeof KAMOKU]?.name || '—'}
                    </span>
                  </div>
                  <span
                    className={`font-['Saira_Condensed'] text-sm tabular-nums shrink-0 ml-3 ${
                      tx.tx_type === 'revenue' ? 'text-[#1B4D3E]' : 'text-[#1a1a1a]'
                    }`}
                  >
                    {tx.tx_type === 'revenue' ? '+' : ''}{formatAmount(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Link
            href={`/expenses?owner=${owner}&year=${year}`}
            className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-gray-100 text-xs text-[#999] hover:text-[#D4A03A] transition-colors"
          >
            出金ページで全て見る
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
