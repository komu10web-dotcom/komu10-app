'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { supabase, Transaction, Project } from '@/lib/supabase';
import { COLORS, DIVISIONS } from '@/lib/constants';

const formatYen = (n: number) => `¥${n.toLocaleString()}`;

const getDivision = (id: string) => DIVISIONS.find(d => d.id === id);

export default function ManagementPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setLoading(true);
    let txQuery = supabase.from('transactions').select('*');
    let pjQuery = supabase.from('projects').select('*');

    if (currentUser !== 'all') {
      txQuery = txQuery.eq('owner', currentUser);
      pjQuery = pjQuery.eq('owner', currentUser);
    }

    const [txRes, pjRes] = await Promise.all([txQuery, pjQuery]);
    setTransactions(txRes.data || []);
    setProjects(pjRes.data || []);
    setLoading(false);
  };

  // 集計
  const stats = {
    revenue: transactions.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + t.amount, 0),
    expense: transactions.filter(t => t.tx_type === 'expense').reduce((s, t) => s + t.amount, 0),
    profit: 0,
    byDivision: {} as Record<string, { revenue: number; expense: number; profit: number }>,
    byProject: {} as Record<string, { revenue: number; expense: number }>,
  };
  stats.profit = stats.revenue - stats.expense;

  // 部門別集計
  DIVISIONS.forEach(d => {
    stats.byDivision[d.id] = { revenue: 0, expense: 0, profit: 0 };
  });
  transactions.forEach(t => {
    const div = t.division || 'general';
    if (!stats.byDivision[div]) {
      stats.byDivision[div] = { revenue: 0, expense: 0, profit: 0 };
    }
    if (t.tx_type === 'revenue') {
      stats.byDivision[div].revenue += t.amount;
    } else {
      stats.byDivision[div].expense += t.amount;
    }
    stats.byDivision[div].profit = stats.byDivision[div].revenue - stats.byDivision[div].expense;
  });

  // PJ別集計
  transactions.forEach(t => {
    if (t.project_id) {
      if (!stats.byProject[t.project_id]) {
        stats.byProject[t.project_id] = { revenue: 0, expense: 0 };
      }
      if (t.tx_type === 'revenue') {
        stats.byProject[t.project_id].revenue += t.amount;
      } else {
        stats.byProject[t.project_id].expense += t.amount;
      }
    }
  });

  // ランウェイ計算（月平均経費で残高を割る）
  const avgMonthlyExpense = stats.expense / Math.max(1, new Set(transactions.map(t => t.date?.slice(0, 7))).size);
  const cashBalance = 1500000; // 仮の残高（将来はcash_accountsから取得）
  const runway = avgMonthlyExpense > 0 ? cashBalance / avgMonthlyExpense : 99;

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={setCurrentUser} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-medium" style={{ color: COLORS.textPrimary }}>
            経営ダッシュボード
          </h1>
          <p className="text-sm mt-1" style={{ color: COLORS.textSecondary }}>
            部門別・プロジェクト別の採算を確認
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: COLORS.textSecondary }}>読み込み中...</div>
        ) : (
          <>
            {/* KPIカード */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="card">
                <div className="text-sm" style={{ color: COLORS.textSecondary }}>売上</div>
                <div className="text-2xl font-number mt-1" style={{ color: COLORS.gold }}>{formatYen(stats.revenue)}</div>
              </div>
              <div className="card">
                <div className="text-sm" style={{ color: COLORS.textSecondary }}>経費</div>
                <div className="text-2xl font-number mt-1" style={{ color: COLORS.crimson }}>{formatYen(stats.expense)}</div>
              </div>
              <div className="card">
                <div className="text-sm" style={{ color: COLORS.textSecondary }}>利益</div>
                <div className="text-2xl font-number mt-1" style={{ color: stats.profit >= 0 ? COLORS.green : COLORS.crimson }}>
                  {formatYen(stats.profit)}
                </div>
              </div>
              <div className="card">
                <div className="text-sm" style={{ color: COLORS.textSecondary }}>ランウェイ</div>
                <div className="text-2xl font-number mt-1" style={{ color: runway < 3 ? COLORS.crimson : COLORS.green }}>
                  {runway.toFixed(1)} ヶ月
                </div>
              </div>
            </div>

            {/* 部門別損益 */}
            <div className="card mb-8">
              <div className="text-sm font-medium mb-4" style={{ color: COLORS.textPrimary }}>部門別損益</div>
              <div className="space-y-3">
                {DIVISIONS.map(div => {
                  const data = stats.byDivision[div.id] || { revenue: 0, expense: 0, profit: 0 };
                  return (
                    <div key={div.id} className="flex items-center gap-4">
                      <div className="w-2 h-2 rounded-full" style={{ background: div.color }} />
                      <div className="w-24 text-sm">{div.short}</div>
                      <div className="flex-1 flex items-center gap-4">
                        <span className="text-sm font-number" style={{ color: COLORS.gold }}>{formatYen(data.revenue)}</span>
                        <span className="text-sm font-number" style={{ color: COLORS.crimson }}>{formatYen(data.expense)}</span>
                        <span className="text-sm font-number font-medium" style={{ color: data.profit >= 0 ? COLORS.green : COLORS.crimson }}>
                          {formatYen(data.profit)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* プロジェクト別採算 TOP10 */}
            <div className="card">
              <div className="text-sm font-medium mb-4" style={{ color: COLORS.textPrimary }}>
                プロジェクト別採算（TOP 10）
              </div>
              <div className="space-y-2">
                {projects
                  .filter(p => stats.byProject[p.id])
                  .map(p => ({
                    ...p,
                    ...stats.byProject[p.id],
                    profit: (stats.byProject[p.id]?.revenue || 0) - (stats.byProject[p.id]?.expense || 0)
                  }))
                  .sort((a, b) => b.profit - a.profit)
                  .slice(0, 10)
                  .map(pj => {
                    const div = getDivision(pj.division);
                    const seqNo = pj.seq_no ? `PJ-${String(pj.seq_no).padStart(3, '0')}` : '';
                    return (
                      <div key={pj.id} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: COLORS.border }}>
                        <div className="w-2 h-2 rounded-full" style={{ background: div?.color || COLORS.sand }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            {seqNo && (
                              <span className="text-xs px-1 rounded" style={{ background: 'rgba(0,0,0,0.05)', fontSize: '10px' }}>
                                {seqNo}
                              </span>
                            )}
                            <span className="text-sm truncate">{pj.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-number shrink-0">
                          <span style={{ color: COLORS.gold }}>{formatYen(pj.revenue)}</span>
                          <span style={{ color: COLORS.crimson }}>{formatYen(pj.expense)}</span>
                          <span style={{ color: pj.profit >= 0 ? COLORS.green : COLORS.crimson, fontWeight: 600, width: '80px', textAlign: 'right' }}>
                            {formatYen(pj.profit)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                {projects.filter(p => stats.byProject[p.id]).length === 0 && (
                  <div className="text-center py-4 text-sm" style={{ color: COLORS.textSecondary }}>
                    プロジェクトに紐づく取引がありません
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
