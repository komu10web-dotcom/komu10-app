'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { KAMOKU } from '@/types/database';
import type { Project } from '@/types/database';
import { CheckCircle2, AlertTriangle, ArrowRight, PenLine } from 'lucide-react';
import Link from 'next/link';
import { usePeriodRange } from './HeaderControls';
import TransactionModal from '@/components/TransactionModal';
import BulkReceiptModal from '@/components/BulkReceiptModal';

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
  const { owner, startDate, endDate } = usePeriodRange();

  const [expenseTotal, setExpenseTotal] = useState(0);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  const [recentTx, setRecentTx] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // v0.9.0: 経費追加モーダル（領収書アップロード統合済）
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // v0.17.1: インボイス登録判定用(当年・2年前売上 + 登録済フラグ)
  const [invoiceRegistered, setInvoiceRegistered] = useState(false);
  const [revenueCurrent, setRevenueCurrent] = useState(0);
  const [revenueTwoYearsAgo, setRevenueTwoYearsAgo] = useState(0);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
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

      let recentQuery = supabase
        .from('transactions')
        .select('id, date, store, description, amount, tx_type, kamoku, confirmed')
        .gte('date', startDate)
        .lt('date', endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      if (owner !== 'all') {
        recentQuery = recentQuery.eq('owner', owner);
      }

      const { data: recentData } = await recentQuery;
      setRecentTx((recentData as TransactionRow[]) || []);

      // プロジェクト取得
      const { data: pjData } = await supabase.from('projects').select('*').order('name');
      setProjects((pjData as Project[]) || []);

      // v0.17.1: インボイス登録判定用データ
      // owner='all' の時は tomo を見る(確定申告ページと同じ慣習)
      const effectiveOwner = owner === 'all' ? 'tomo' : owner;
      const currentYear = new Date().getFullYear();

      const { data: profileData } = await supabase
        .from('profiles')
        .select('invoice_registered')
        .eq('user_key', effectiveOwner)
        .single();
      setInvoiceRegistered(!!(profileData as any)?.invoice_registered);

      // 当年売上
      const { data: revCurrentData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('owner', effectiveOwner)
        .eq('tx_type', 'revenue')
        .gte('date', `${currentYear}-01-01`)
        .lt('date', `${currentYear + 1}-01-01`);
      setRevenueCurrent((revCurrentData || []).reduce((s: number, r: any) => s + (r.amount || 0), 0));

      // 2年前売上(基準期間)
      const { data: rev2yData } = await supabase
        .from('transactions')
        .select('amount')
        .eq('owner', effectiveOwner)
        .eq('tx_type', 'revenue')
        .gte('date', `${currentYear - 2}-01-01`)
        .lt('date', `${currentYear - 1}-01-01`);
      setRevenueTwoYearsAgo((rev2yData || []).reduce((s: number, r: any) => s + (r.amount || 0), 0));
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* ── サマリー ── */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="h-20 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#D4A03A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#999]">経費</span>
                  <span className="font-['Saira_Condensed'] text-2xl text-[#1a1a1a] tabular-nums">
                    {formatAmount(expenseTotal)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#999]">売上</span>
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

        {/* v0.17.1: インボイス登録判定バナー(800万円超かつ未登録時のみ表示) */}
        {(() => {
          if (invoiceRegistered) return null;
          const threshold = 8_000_000;
          const taxableLine = 10_000_000;
          const showByCurrentYear = revenueCurrent >= threshold;
          const showByBaseLine = revenueTwoYearsAgo > taxableLine;
          if (!showByCurrentYear && !showByBaseLine) return null;

          let level: 'confirmed' | 'warning' | 'caution' = 'caution';
          if (showByBaseLine) level = 'confirmed';
          else if (revenueCurrent > taxableLine) level = 'warning';
          else level = 'caution';

          const config = {
            confirmed: {
              color: '#C23728',
              bg: '#FDF0EE',
              title: '当年から、消費税を納める必要があります',
              sub: '2年前売上が1,000万円超でした。確定申告で消費税申告も必要です',
            },
            warning: {
              color: '#C23728',
              bg: '#FDF0EE',
              title: '来々年(2年後)から、消費税を納めます',
              sub: '当年売上が1,000万円を超えました。インボイス登録の手続きを始めましょう',
            },
            caution: {
              color: '#D4A03A',
              bg: '#FAF6EE',
              title: '売上1,000万円が見えてきました',
              sub: 'このまま超えると、2年後から消費税の納税義務が発生します',
            },
          }[level];

          return (
            <Link
              href="/tax-return"
              className="block rounded-2xl p-5 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: config.bg, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: config.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1" style={{ color: config.color }}>
                    {config.title}
                  </p>
                  <p className="text-[11px] text-[#333] leading-relaxed mb-2">
                    {config.sub}
                  </p>
                  <div className="flex items-center gap-1 text-[11px]" style={{ color: config.color }}>
                    <span>確定申告ページで詳細を見る</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })()}

        {/* v0.9.0: 経費追加CTAボタン（領収書・手入力の統合） */}
        <button
          onClick={() => setManualModalOpen(true)}
          className="w-full bg-[#1a1a1a] text-white rounded-2xl py-4 px-5 flex items-center justify-center gap-2 hover:bg-[#333] transition-colors"
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        >
          <PenLine className="w-4 h-4" />
          <span className="text-sm font-medium">経費を追加</span>
        </button>

        {/* v0.19.0: 複数領収書まとめてリンク */}
        <button
          onClick={() => setBulkModalOpen(true)}
          className="w-full text-center text-[11px] text-[#999] hover:text-[#1a1a1a] transition-colors -mt-2"
        >
          領収書をまとめて取り込む
        </button>

        <TransactionModal
          isOpen={manualModalOpen}
          onClose={() => setManualModalOpen(false)}
          onSaved={fetchData}
          defaultOwner={owner === 'all' ? 'tomo' : owner}
          projects={projects}
        />

        {/* v0.19.0: 複数領収書一括取込モーダル */}
        <BulkReceiptModal
          isOpen={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          onSaved={fetchData}
          defaultOwner={owner === 'all' ? 'tomo' : owner}
          projects={projects}
        />

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
            href="/expenses"
            className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-gray-100 text-xs text-[#999] hover:text-[#D4A03A] transition-colors"
          >
            経費ページで全て見る
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
