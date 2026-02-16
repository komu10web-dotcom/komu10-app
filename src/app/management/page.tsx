'use client';

import { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { supabase } from '@/lib/supabase';
import { TrendingUp, TrendingDown, Clock, AlertCircle, Check } from 'lucide-react';

interface DivisionSummary {
  id: string;
  name: string;
  code: string;
  color: string;
  revenue: number;
  expense: number;
  profit: number;
}

interface MonthlySummary {
  revenue: number;
  expense: number;
  profit: number;
  runway: number;
}

export default function ManagementPage() {
  const [summary, setSummary] = useState<MonthlySummary>({
    revenue: 0,
    expense: 0,
    profit: 0,
    runway: 0,
  });
  const [divisions, setDivisions] = useState<DivisionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // 今月の期間
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      // 取引データ取得
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth) as { data: Array<{ amount: number }> | null };

      if (transactions) {
        const revenue = transactions
          .filter(t => t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions
          .filter(t => t.amount < 0)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // ランウェイ計算（簡易版）
        const avgMonthlyExpense = expense || 1;
        const cashBalance = 1000000; // 仮の残高
        const runway = Math.round(cashBalance / avgMonthlyExpense * 10) / 10;

        setSummary({
          revenue,
          expense,
          profit: revenue - expense,
          runway,
        });
      }

      // 部門データ取得
      const { data: divisionData } = await supabase
        .from('divisions')
        .select('*')
        .order('sort_order') as { data: Array<{ id: string; name: string; code: string; color: string | null; sort_order: number }> | null };

      if (divisionData) {
        // 部門別集計（仮データ）
        const divisionSummaries = divisionData.map(d => ({
          id: d.id,
          name: d.name,
          code: d.code,
          color: d.color || '#D4A03A',
          revenue: Math.floor(Math.random() * 500000),
          expense: Math.floor(Math.random() * 300000),
          profit: 0,
        }));
        
        divisionSummaries.forEach(d => {
          d.profit = d.revenue - d.expense;
        });

        setDivisions(divisionSummaries);
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  }

  const formatAmount = (amount: number) => {
    if (Math.abs(amount) >= 10000) {
      return `¥${(amount / 10000).toFixed(1)}万`;
    }
    return `¥${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(amount)}`;
  };

  const getHealthStatus = () => {
    if (summary.profit > 0 && summary.runway > 6) return 'good';
    if (summary.runway > 3) return 'warning';
    return 'danger';
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="min-h-screen bg-surface pb-20 md:pt-20">
      <Navigation />

      <main className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-xl font-medium text-black/90 mb-1">経営</h1>
          <p className="text-sm text-black/40">管理会計 · 経営判断向け</p>
        </header>

        {loading ? (
          <div className="text-center py-12 text-black/40">読み込み中...</div>
        ) : (
          <>
            {/* Main Status - AURA: 正しい不安と正しい安心 */}
            <section className="mb-8">
              <div className={`
                bg-white rounded-2xl p-6
                ${healthStatus === 'good' ? 'ring-2 ring-forest/20' : ''}
                ${healthStatus === 'warning' ? 'ring-2 ring-gold/30' : ''}
                ${healthStatus === 'danger' ? 'ring-2 ring-crimson/30' : ''}
              `}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-black/40 uppercase tracking-wider">
                    {new Date().toLocaleDateString('ja-JP', { month: 'long' })}
                  </span>
                  <div className={`
                    flex items-center gap-1 text-xs px-2 py-1 rounded-full
                    ${healthStatus === 'good' ? 'bg-forest/10 text-forest' : ''}
                    ${healthStatus === 'warning' ? 'bg-gold/10 text-gold' : ''}
                    ${healthStatus === 'danger' ? 'bg-crimson/10 text-crimson' : ''}
                  `}>
                    {healthStatus === 'good' && <Check className="w-3 h-3" />}
                    {healthStatus === 'warning' && <AlertCircle className="w-3 h-3" />}
                    {healthStatus === 'danger' && <AlertCircle className="w-3 h-3" />}
                    {healthStatus === 'good' ? '健全' : healthStatus === 'warning' ? '注意' : '要対応'}
                  </div>
                </div>

                {/* Profit Display */}
                <div className="mb-6">
                  <div className={`font-number text-4xl tracking-tight ${
                    summary.profit >= 0 ? 'text-forest' : 'text-crimson'
                  }`}>
                    {summary.profit >= 0 ? '+' : ''}{formatAmount(summary.profit)}
                  </div>
                  <p className="text-sm text-black/40 mt-1">今月の損益</p>
                </div>

                {/* Revenue / Expense */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5">
                  <div>
                    <div className="flex items-center gap-1 text-xs text-black/40 mb-1">
                      <TrendingUp className="w-3 h-3" />
                      収入
                    </div>
                    <div className="font-number text-lg text-black/80">
                      {formatAmount(summary.revenue)}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-xs text-black/40 mb-1">
                      <TrendingDown className="w-3 h-3" />
                      支出
                    </div>
                    <div className="font-number text-lg text-black/80">
                      {formatAmount(summary.expense)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Runway - STRIPE-MIND: キャッシュの時間軸 */}
            <section className="mb-8">
              <div className="bg-white rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-black/40 mb-2">
                      <Clock className="w-3 h-3" />
                      ランウェイ
                    </div>
                    <div className={`font-number text-3xl ${
                      summary.runway > 6 ? 'text-forest' : 
                      summary.runway > 3 ? 'text-gold' : 'text-crimson'
                    }`}>
                      {summary.runway}
                      <span className="text-lg ml-1">ヶ月</span>
                    </div>
                  </div>
                  <div className="w-16 h-16">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-black/10"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${Math.min(summary.runway / 12 * 100, 100)} 100`}
                        className={
                          summary.runway > 6 ? 'text-forest' : 
                          summary.runway > 3 ? 'text-gold' : 'text-crimson'
                        }
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </section>

            {/* Division Summary - NEXUS: 部門別採算 */}
            <section>
              <h2 className="text-xs text-black/40 uppercase tracking-wider mb-3">
                部門別
              </h2>
              <div className="space-y-2">
                {divisions.map((division) => (
                  <div
                    key={division.id}
                    className="bg-white rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: division.color }}
                        />
                        <span className="text-sm font-medium text-black/80">
                          {division.name}
                        </span>
                        <span className="text-xs text-black/30">{division.code}</span>
                      </div>
                      <span className={`font-number text-base ${
                        division.profit >= 0 ? 'text-forest' : 'text-crimson'
                      }`}>
                        {division.profit >= 0 ? '+' : ''}{formatAmount(division.profit)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <div 
                          className="bg-forest/60"
                          style={{ 
                            width: `${division.revenue / (division.revenue + division.expense) * 100}%` 
                          }}
                        />
                        <div 
                          className="bg-crimson/60"
                          style={{ 
                            width: `${division.expense / (division.revenue + division.expense) * 100}%` 
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between mt-2 text-xs text-black/40">
                      <span>収入 {formatAmount(division.revenue)}</span>
                      <span>支出 {formatAmount(division.expense)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
