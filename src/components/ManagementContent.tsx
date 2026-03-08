'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DIVISIONS } from '@/types/database';
import type { Transaction, Project } from '@/types/database';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

// ---------- 型定義 ----------

interface MonthData {
  month: number;
  revenue: number;
  expense: number;
  profit: number;
}

interface DivisionPL {
  id: string;
  name: string;
  label: string;
  color: string;
  revenue: number;
  expense: number;
  profit: number;
}

interface ProjectPL {
  id: string;
  name: string;
  division: string;
  revenue: number;
  expense: number;
  profit: number;
}

// ---------- ヘルパー ----------

function yen(n: number): string {
  if (n === 0) return '¥0';
  const prefix = n < 0 ? '-¥' : '¥';
  return prefix + Math.abs(n).toLocaleString();
}

// external_idから事業別IDを生成
function formatProjectId(pj: Project): string {
  const parts: string[] = [];
  if (pj.seq_no) parts.push(`PJ-${String(pj.seq_no).padStart(3, '0')}`);
  if (pj.external_id) {
    const div = DIVISIONS[pj.division as keyof typeof DIVISIONS];
    const prefix = div?.prefix || 'GEN';
    const num = pj.external_id.replace(/^yt-/, '');
    parts.push(`${prefix}-${String(num).padStart(3, '0')}`);
  }
  return parts.length > 0 ? parts.map(p => `[${p}]`).join('') : '';
}

const DIVISION_FILTER = [
  { value: 'all', label: '全事業' },
  ...Object.entries(DIVISIONS).map(([id, v]) => ({ value: id, label: v.label })),
];

// ---------- コンポーネント ----------

export default function ManagementContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'all';
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  // データ
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // PJ一覧フィルター
  const [divFilter, setDivFilter] = useState('all');
  const [showAllPJ, setShowAllPJ] = useState(false);

  // 同期
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // ---------- データ取得 ----------

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      // トランザクション取得（年フィルター）
      let txQuery = supabase
        .from('transactions')
        .select('*')
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`);

      if (owner !== 'all') {
        txQuery = txQuery.eq('owner', owner);
      }

      const { data: txData } = await txQuery;
      setTransactions((txData as Transaction[]) || []);

      // プロジェクト取得
      let pjQuery = supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (owner !== 'all') {
        pjQuery = pjQuery.eq('owner', owner);
      }

      const { data: pjData } = await pjQuery;
      setProjects((pjData as Project[]) || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------- 集計ロジック ----------

  // 年間KPI
  const totalRevenue = transactions.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.tx_type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalProfit = totalRevenue - totalExpense;
  const profitRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // 月別集計
  const monthlyData: MonthData[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const mStr = String(m).padStart(2, '0');
    const monthTx = transactions.filter(t => t.date.startsWith(`${year}-${mStr}`));
    const rev = monthTx.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + t.amount, 0);
    const exp = monthTx.filter(t => t.tx_type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { month: m, revenue: rev, expense: exp, profit: rev - exp };
  });

  const maxMonthVal = Math.max(...monthlyData.map(m => Math.max(m.revenue, m.expense)), 1);

  // 部門別損益
  const divisionPL: DivisionPL[] = Object.entries(DIVISIONS).map(([id, v]) => {
    const divTx = transactions.filter(t => t.division === id);
    const rev = divTx.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + t.amount, 0);
    const exp = divTx.filter(t => t.tx_type === 'expense').reduce((s, t) => s + t.amount, 0);
    return {
      id,
      name: v.name,
      label: v.label,
      color: v.color,
      revenue: rev,
      expense: exp,
      profit: rev - exp,
    };
  });

  // PJ別損益
  const projectPLMap: Record<string, { revenue: number; expense: number }> = {};
  transactions.forEach(t => {
    if (!t.project_id) return;
    if (!projectPLMap[t.project_id]) projectPLMap[t.project_id] = { revenue: 0, expense: 0 };
    if (t.tx_type === 'revenue') projectPLMap[t.project_id].revenue += t.amount;
    else projectPLMap[t.project_id].expense += t.amount;
  });

  const projectPLList: ProjectPL[] = projects
    .map(pj => {
      const pl = projectPLMap[pj.id] || { revenue: 0, expense: 0 };
      return {
        id: pj.id,
        name: pj.name,
        division: pj.division,
        revenue: pl.revenue,
        expense: pl.expense,
        profit: pl.revenue - pl.expense,
      };
    })
    .filter(p => p.revenue > 0 || p.expense > 0)
    .sort((a, b) => b.profit - a.profit);

  const top5PJ = projectPLList.slice(0, 5);

  // プロジェクト一覧フィルター
  const filteredProjects = divFilter === 'all'
    ? projects
    : projects.filter(p => p.division === divFilter);

  // ---------- 同期 ----------

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setSyncResult({ success: true, message: `同期完了（${result.count}/${result.total}件）` });
        fetchData();
      } else {
        setSyncResult({ success: false, message: result.error || '同期に失敗しました' });
      }
    } catch (err) {
      console.error('Sync error:', err);
      setSyncResult({ success: false, message: '同期に失敗しました' });
    } finally {
      setSyncing(false);
    }
  };

  // ---------- UI ----------

  if (loading) {
    return (
      <div className="bg-[#F5F5F3] min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* ヘッダー */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">経営</h1>
            <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">MANAGEMENT</p>
          </div>
        </div>

        {/* ===== 年間KPIサマリー ===== */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: '売上', value: totalRevenue, color: '#D4A03A' },
            { label: '経費', value: totalExpense, color: '#C23728' },
            { label: '利益', value: totalProfit, color: totalProfit >= 0 ? '#1B4D3E' : '#C23728' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-2xl px-5 py-5"
              style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}
            >
              <p className="text-[10px] tracking-wider text-[#999] mb-2">{kpi.label}</p>
              <p
                className="font-['Saira_Condensed'] text-2xl tabular-nums"
                style={{ color: kpi.color }}
              >
                {yen(kpi.value)}
              </p>
            </div>
          ))}
        </div>

        {/* 利益率バー */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-8" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] tracking-wider text-[#999]">利益率</p>
            <p className="font-['Saira_Condensed'] text-sm tabular-nums" style={{ color: profitRate >= 0 ? '#1B4D3E' : '#C23728' }}>
              {profitRate.toFixed(1)}%
            </p>
          </div>
          <div className="w-full h-2 bg-[#F5F5F3] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(Math.max(profitRate, 0), 100)}%`,
                background: profitRate >= 0 ? '#1B4D3E' : '#C23728',
              }}
            />
          </div>
        </div>

        {/* ===== 月別チャート ===== */}
        <div className="bg-white rounded-2xl px-5 py-5 mb-8" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <p className="text-[10px] tracking-wider text-[#999] mb-5">月別推移</p>
          <div className="flex items-end gap-1" style={{ height: 160 }}>
            {monthlyData.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center h-full justify-end">
                <div className="flex gap-0.5 items-end w-full justify-center" style={{ flex: 1 }}>
                  {/* 売上バー */}
                  <div
                    className="rounded-t transition-all duration-300"
                    style={{
                      width: '40%',
                      height: `${Math.max((m.revenue / maxMonthVal) * 100, m.revenue > 0 ? 3 : 0)}%`,
                      background: '#D4A03A',
                      opacity: 0.8,
                    }}
                  />
                  {/* 経費バー */}
                  <div
                    className="rounded-t transition-all duration-300"
                    style={{
                      width: '40%',
                      height: `${Math.max((m.expense / maxMonthVal) * 100, m.expense > 0 ? 3 : 0)}%`,
                      background: '#C23728',
                      opacity: 0.65,
                    }}
                  />
                </div>
                <p className="text-[9px] text-[#999] mt-2 font-['Saira_Condensed'] tabular-nums">{m.month}</p>
              </div>
            ))}
          </div>
          {/* 凡例 */}
          <div className="flex gap-5 mt-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#D4A03A', opacity: 0.8 }} />
              <span className="text-[10px] text-[#999]">売上</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#C23728', opacity: 0.65 }} />
              <span className="text-[10px] text-[#999]">経費</span>
            </div>
          </div>
        </div>

        {/* ===== 部門別損益 ===== */}
        <div className="mb-8">
          <p className="text-[10px] tracking-wider text-[#999] mb-4">部門別損益</p>
          <div className="grid grid-cols-2 gap-3">
            {divisionPL.map((d) => {
              const maxBar = Math.max(d.revenue, d.expense, 1);
              return (
                <div
                  key={d.id}
                  className="bg-white rounded-2xl px-4 py-4"
                  style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}
                >
                  {/* 部門ヘッダー */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-xs font-medium text-[#1a1a1a]">{d.label}</span>
                    <span className="text-[10px] text-[#999]">{d.name}</span>
                  </div>

                  {/* 売上バー */}
                  <div className="mb-1.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-[#999]">売上</span>
                      <span className="font-['Saira_Condensed'] text-xs tabular-nums text-[#D4A03A]">{yen(d.revenue)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#F5F5F3] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${(d.revenue / maxBar) * 100}%`, background: '#D4A03A', opacity: 0.8 }}
                      />
                    </div>
                  </div>

                  {/* 経費バー */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-[#999]">経費</span>
                      <span className="font-['Saira_Condensed'] text-xs tabular-nums text-[#C23728]">{yen(d.expense)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#F5F5F3] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${(d.expense / maxBar) * 100}%`, background: '#C23728', opacity: 0.65 }}
                      />
                    </div>
                  </div>

                  {/* 利益 */}
                  <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                    <span className="text-[9px] text-[#999]">利益</span>
                    <span
                      className="font-['Saira_Condensed'] text-sm font-medium tabular-nums"
                      style={{ color: d.profit >= 0 ? '#1B4D3E' : '#C23728' }}
                    >
                      {yen(d.profit)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== PJ別損益（上位5件） ===== */}
        <div className="bg-white rounded-2xl px-5 py-5 mb-8" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] tracking-wider text-[#999]">プロジェクト別損益</p>
            {projectPLList.length > 5 && (
              <button
                onClick={() => setShowAllPJ(!showAllPJ)}
                className="text-[10px] text-[#D4A03A] hover:underline flex items-center gap-0.5"
              >
                {showAllPJ ? '上位5件に戻す' : `全${projectPLList.length}件を見る →`}
              </button>
            )}
          </div>

          {projectPLList.length === 0 ? (
            <p className="text-xs text-[#ccc] py-4 text-center">PJに紐づく取引がありません</p>
          ) : (
            <div className="space-y-2">
              {(showAllPJ ? projectPLList : top5PJ).map((p) => {
                const div = DIVISIONS[p.division as keyof typeof DIVISIONS];
                return (
                  <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: div?.color || '#C4B49A' }} />
                    <span className="text-xs text-[#1a1a1a] flex-1 truncate">{p.name}</span>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-['Saira_Condensed'] text-xs tabular-nums text-[#D4A03A]">{yen(p.revenue)}</span>
                      <span className="font-['Saira_Condensed'] text-xs tabular-nums text-[#C23728]">{yen(p.expense)}</span>
                      <span
                        className="font-['Saira_Condensed'] text-xs tabular-nums font-medium w-24 text-right"
                        style={{ color: p.profit >= 0 ? '#1B4D3E' : '#C23728' }}
                      >
                        {yen(p.profit)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== プロジェクト一覧 ===== */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs text-[#999]">プロジェクト（{filteredProjects.length}件）</h2>
              <select
                value={divFilter}
                onChange={(e) => setDivFilter(e.target.value)}
                className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none"
              >
                {DIVISION_FILTER.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] text-white rounded-lg text-[10px] font-medium hover:bg-[#333] disabled:opacity-40 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同期中...' : 'PJ同期'}
            </button>
          </div>

          {syncResult && (
            <div className={`flex items-center gap-2 px-5 py-3 ${
              syncResult.success ? 'bg-[#1B4D3E]/5' : 'bg-[#C23728]/5'
            }`}>
              {syncResult.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1B4D3E]" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-[#C23728]" />
              )}
              <span className={`text-[10px] ${syncResult.success ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>
                {syncResult.message}
              </span>
            </div>
          )}

          {filteredProjects.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#ccc]">
              プロジェクトがありません
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredProjects.map((pj) => {
                const div = DIVISIONS[pj.division as keyof typeof DIVISIONS];
                const pjId = formatProjectId(pj);
                const pl = projectPLMap[pj.id];
                const pjProfit = pl ? pl.revenue - pl.expense : 0;
                return (
                  <div key={pj.id} className="px-5 py-3 hover:bg-[#F5F5F3]/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className="w-2.5 h-2.5 rounded-sm shrink-0 mt-1"
                          style={{ background: div?.color || '#C4B49A' }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {pjId && (
                              <span className="text-[10px] font-['Saira_Condensed'] text-[#999] tabular-nums shrink-0">{pjId}</span>
                            )}
                            <span className="text-sm text-[#1a1a1a] truncate">{pj.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-medium" style={{ color: div?.color || '#999' }}>
                              {div?.label || pj.division}
                            </span>
                            {pj.category && (
                              <span className="text-[10px] text-[#999] bg-[#F5F5F3] px-1.5 py-0.5 rounded">{pj.category}</span>
                            )}
                            {pj.location && (
                              <span className="text-[10px] text-[#999]">{pj.location}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* PJ損益（取引紐付けがある場合） */}
                        {pl && (
                          <span
                            className="font-['Saira_Condensed'] text-xs tabular-nums"
                            style={{ color: pjProfit >= 0 ? '#1B4D3E' : '#C23728' }}
                          >
                            {yen(pjProfit)}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          pj.status === 'completed' ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' :
                          pj.status === 'active' ? 'bg-[#D4A03A]/10 text-[#D4A03A]' :
                          'bg-gray-100 text-[#999]'
                        }`}>
                          {pj.status === 'completed' ? '完了' : pj.status === 'active' ? '進行中' : pj.status === 'ordered' ? '受注' : pj.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
