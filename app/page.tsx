'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import KPICard from '@/components/KPICard';
import MonthlyChart from '@/components/MonthlyChart';
import ProjectCard from '@/components/ProjectCard';
import ReceiptUploader from '@/components/ReceiptUploader';
import { supabase, Transaction, Project } from '@/lib/supabase';
import { COLORS, DIVISIONS, formatYen, getDivision } from '@/lib/constants';

export default function Dashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // データ取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      const [txRes, pjRes] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
      ]);

      if (txRes.data) setTransactions(txRes.data);
      if (pjRes.data) setProjects(pjRes.data);
      
      setLoading(false);
    };

    fetchData();
  }, []);

  // ユーザー切り替え（Cookie保存）
  const handleUserChange = (user: string) => {
    setCurrentUser(user);
    document.cookie = `komu10_user=${user}; path=/; max-age=31536000`;
  };

  // 初回読み込み時にCookieからユーザー取得
  useEffect(() => {
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('komu10_user='));
    if (userCookie) {
      const user = userCookie.split('=')[1];
      if (user === 'all' || user === 'tomo' || user === 'toshiki') {
        setCurrentUser(user);
      }
    }
  }, []);

  // 統計計算
  const stats = useMemo(() => {
    const yearTx = transactions.filter(t => t.date.startsWith(String(selectedYear)));
    
    const revenue = yearTx.filter(t => t.tx_type === 'revenue').reduce((sum, t) => sum + t.amount, 0);
    const expense = yearTx.filter(t => t.tx_type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const profit = revenue - expense;

    // 月別データ
    const monthlyData: { [key: string]: { revenue: number; expense: number } } = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${selectedYear}-${String(m).padStart(2, '0')}`;
      monthlyData[key] = { revenue: 0, expense: 0 };
    }
    yearTx.forEach(t => {
      const month = t.date.substring(0, 7);
      if (monthlyData[month]) {
        if (t.tx_type === 'revenue') {
          monthlyData[month].revenue += t.amount;
        } else {
          monthlyData[month].expense += t.amount;
        }
      }
    });

    // 部門別データ（年間合計）
    const byDivision: { [key: string]: { revenue: number; expense: number } } = {};
    DIVISIONS.forEach(d => {
      byDivision[d.id] = { revenue: 0, expense: 0 };
    });
    yearTx.forEach(t => {
      if (byDivision[t.division]) {
        if (t.tx_type === 'revenue') {
          byDivision[t.division].revenue += t.amount;
        } else {
          byDivision[t.division].expense += t.amount;
        }
      }
    });

    // 部門別月次データ（グラフ用）
    const byDivisionMonthly: { [divId: string]: { month: string; revenue: number; expense: number }[] } = {};
    DIVISIONS.forEach(d => {
      byDivisionMonthly[d.id] = [];
      for (let m = 1; m <= 12; m++) {
        const key = `${selectedYear}-${String(m).padStart(2, '0')}`;
        byDivisionMonthly[d.id].push({ month: key, revenue: 0, expense: 0 });
      }
    });
    yearTx.forEach(t => {
      const month = t.date.substring(0, 7);
      const divData = byDivisionMonthly[t.division];
      if (divData) {
        const monthData = divData.find(d => d.month === month);
        if (monthData) {
          if (t.tx_type === 'revenue') {
            monthData.revenue += t.amount;
          } else {
            monthData.expense += t.amount;
          }
        }
      }
    });

    // プロジェクト別データ
    const byProject: { [key: string]: { revenue: number; expense: number } } = {};
    transactions.forEach(t => {
      if (t.project_id) {
        if (!byProject[t.project_id]) {
          byProject[t.project_id] = { revenue: 0, expense: 0 };
        }
        if (t.tx_type === 'revenue') {
          byProject[t.project_id].revenue += t.amount;
        } else {
          byProject[t.project_id].expense += t.amount;
        }
      }
    });

    return {
      revenue,
      expense,
      profit,
      monthlyData: Object.entries(monthlyData).map(([month, data]) => ({
        month,
        ...data,
      })),
      byDivision,
      byDivisionMonthly,
      byProject,
    };
  }, [transactions, selectedYear]);

  // 最近の取引（5件）
  const recentTransactions = transactions.slice(0, 5);

  // その年に完了したプロジェクト
  const completedProjects = projects.filter(p => p.status === 'completed').slice(0, 4);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 領収書アップローダー */}
        <div className="mb-6">
          <ReceiptUploader />
        </div>

        {/* 年度選択 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>
            {selectedYear}年 ダッシュボード
          </h1>
          <select
            className="input select w-auto"
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
          >
            {[2024, 2025, 2026].map(year => (
              <option key={year} value={year}>{year}年</option>
            ))}
          </select>
        </div>

        {/* KPIカード */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <KPICard 
            label="売上" 
            value={stats.revenue} 
            color={COLORS.gold}
            filterType="revenue"
          />
          <KPICard 
            label="経費" 
            value={stats.expense} 
            color={COLORS.crimson}
            filterType="expense"
          />
          <KPICard 
            label="利益" 
            value={stats.profit} 
            color={stats.profit >= 0 ? COLORS.green : COLORS.crimson}
            subValue={stats.revenue > 0 ? `利益率 ${Math.round((stats.profit / stats.revenue) * 100)}%` : undefined}
            clickable={false}
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 左カラム: チャート + 部門別 */}
          <div className="col-span-2 space-y-6">
            {/* 月別チャート */}
            <MonthlyChart data={stats.monthlyData} byDivision={stats.byDivisionMonthly} />

            {/* 部門別損益 */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-medium" style={{ color: COLORS.textMuted }}>
                  部門別損益
                </div>
                <div className="flex items-center gap-4 text-xs" style={{ color: COLORS.textMuted }}>
                  <span className="w-20 text-right">売上</span>
                  <span className="w-20 text-right">経費</span>
                  <span className="w-24 text-right">利益</span>
                </div>
              </div>
              <div className="space-y-3">
                {DIVISIONS.map(div => {
                  const data = stats.byDivision[div.id] || { revenue: 0, expense: 0 };
                  const profit = data.revenue - data.expense;
                  return (
                    <div 
                      key={div.id}
                      className="flex items-center gap-3 py-2 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => router.push(`/transactions?division=${div.id}`)}
                    >
                      <div 
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: div.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate" style={{ color: COLORS.textPrimary }}>
                          {div.name}
                        </div>
                        <div className="text-xs" style={{ color: COLORS.textMuted }}>
                          {div.abbr}
                        </div>
                      </div>
                      <div className="text-right w-20">
                        <div className="font-number text-sm" style={{ color: COLORS.gold }}>
                          {formatYen(data.revenue)}
                        </div>
                      </div>
                      <div className="text-right w-20">
                        <div className="font-number text-sm" style={{ color: COLORS.crimson }}>
                          {formatYen(data.expense)}
                        </div>
                      </div>
                      <div className="text-right w-24">
                        <div 
                          className="font-number text-sm"
                          style={{ color: profit >= 0 ? COLORS.green : COLORS.crimson }}
                        >
                          {formatYen(profit)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右カラム: 最近の取引 + プロジェクト */}
          <div className="space-y-6">
            {/* 最近の取引 */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium" style={{ color: COLORS.textMuted }}>
                  最近の取引
                </div>
                <button 
                  className="text-xs"
                  style={{ color: COLORS.green }}
                  onClick={() => router.push('/transactions')}
                >
                  すべて見る →
                </button>
              </div>
              <div className="space-y-2">
                {recentTransactions.map(tx => {
                  const div = getDivision(tx.division);
                  return (
                    <div 
                      key={tx.id}
                      className="flex items-center gap-2 py-2 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => router.push(`/transactions?id=${tx.id}`)}
                    >
                      <div 
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: div?.color || COLORS.sand }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate" style={{ color: COLORS.textPrimary }}>
                          {tx.store || tx.description || '—'}
                        </div>
                      </div>
                      <div 
                        className="font-number text-sm shrink-0"
                        style={{ color: tx.tx_type === 'revenue' ? COLORS.gold : COLORS.crimson }}
                      >
                        {formatYen(tx.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 完了プロジェクト */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-medium" style={{ color: COLORS.textMuted }}>
                  完了プロジェクト
                </div>
                <button 
                  className="text-xs"
                  style={{ color: COLORS.green }}
                  onClick={() => router.push('/projects?status=completed')}
                >
                  すべて見る →
                </button>
              </div>
              <div className="space-y-3">
                {completedProjects.map(pj => {
                  const pjStats = stats.byProject[pj.id] || { revenue: 0, expense: 0 };
                  const profit = pjStats.revenue - pjStats.expense;
                  const div = getDivision(pj.division);
                  
                  // 通し番号・管理番号
                  const seqNo = pj.seq_no ? `PJ-${String(pj.seq_no).padStart(3, '0')}` : '';
                  const divNo = pj.external_id && div?.prefix ? `${div.prefix}-${String(pj.external_id).padStart(3, '0')}` : '';

                  return (
                    <div 
                      key={pj.id}
                      className="py-2 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{ borderColor: COLORS.border }}
                      onClick={() => router.push(`/projects?id=${pj.id}`)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div 
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: div?.color || COLORS.sand }}
                        />
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          {seqNo && (
                            <span className="text-xs font-mono px-1 rounded shrink-0" style={{ background: 'rgba(10,10,11,0.05)', color: COLORS.textSecondary, fontSize: '10px' }}>
                              {seqNo}
                            </span>
                          )}
                          {divNo && (
                            <span className="text-xs font-mono px-1 rounded shrink-0" style={{ background: `${div?.color}15`, color: div?.color, fontSize: '10px' }}>
                              {divNo}
                            </span>
                          )}
                          <span className="text-xs truncate" style={{ color: COLORS.textPrimary }}>
                            {pj.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pl-3.5">
                        <div className="font-number text-xs" style={{ color: COLORS.gold }}>
                          売上: {formatYen(pjStats.revenue)}
                        </div>
                        <div 
                          className="font-number text-xs"
                          style={{ color: profit >= 0 ? COLORS.green : COLORS.crimson }}
                        >
                          利益: {formatYen(profit)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {completedProjects.length === 0 && (
                  <div className="text-xs py-4 text-center" style={{ color: COLORS.textMuted }}>
                    完了プロジェクトはありません
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
