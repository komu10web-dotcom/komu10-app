'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DIVISIONS } from '@/types/database';
import type { Transaction } from '@/types/database';
import { Plus, Trash2 } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';

// ========== ヘルパー ==========

function yen(n: number): string {
  if (n === 0) return '¥0';
  const prefix = n < 0 ? '-¥' : '¥';
  return prefix + Math.abs(n).toLocaleString();
}

const currentMonth = new Date().getMonth() + 1;

// ========== 型 ==========

type SimItem = {
  id: number;
  name: string;
  type: 'monthly' | 'hourly';
  monthlyAmount: number;
  hourlyRate: number;
  hoursPerDay: number;
  daysPerWeek: number;
  startMonth: number;
  endMonth: number;
  division: string;
};

// ========== コンポーネント ==========

export default function SimulationContent() {
  const { owner, startDate, endDate, year } = usePeriodRange();

  // 実績データ
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [loading, setLoading] = useState(true);

  // シミュレーション
  const [simItems, setSimItems] = useState<SimItem[]>([]);
  const [simNextId, setSimNextId] = useState(1);

  // ── データ取得 ──
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let q = supabase.from('transactions').select('id, tx_type, amount')
        .gte('date', startDate).lt('date', endDate);
      if (owner !== 'all') q = q.eq('owner', owner);
      const { data } = await q;
      const txList = (data as Pick<Transaction, 'id' | 'tx_type' | 'amount'>[]) || [];
      setTotalRevenue(txList.filter(t => t.tx_type === 'revenue').reduce((s, t) => s + t.amount, 0));
      setTotalExpense(txList.filter(t => t.tx_type === 'expense').reduce((s, t) => s + t.amount, 0));
    } catch (err) {
      console.error('Simulation data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── シミュレーション操作 ──
  const addSimItem = () => {
    setSimItems(prev => [...prev, {
      id: simNextId,
      name: '',
      type: 'monthly',
      monthlyAmount: 0,
      hourlyRate: 0,
      hoursPerDay: 8,
      daysPerWeek: 3,
      startMonth: currentMonth,
      endMonth: 12,
      division: 'support',
    }]);
    setSimNextId(prev => prev + 1);
  };
  const removeSimItem = (id: number) => setSimItems(prev => prev.filter(s => s.id !== id));
  const updateSimItem = (id: number, patch: Partial<SimItem>) => {
    setSimItems(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  // ── 計算 ──
  const simMonthlyAmount = (s: SimItem): number => {
    if (s.type === 'monthly') return s.monthlyAmount;
    return Math.round(s.hourlyRate * s.hoursPerDay * s.daysPerWeek * 4.3);
  };

  const simTotalAnnual = simItems.reduce((sum, s) => {
    const monthly = simMonthlyAmount(s);
    const months = Math.max(0, s.endMonth - s.startMonth + 1);
    return sum + monthly * months;
  }, 0);

  const totalProfit = totalRevenue - totalExpense;
  const profitRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const hasSim = simItems.length > 0;
  const simRevenue = totalRevenue + simTotalAnnual;
  const simProfit = simRevenue - totalExpense;
  const simProfitRate = simRevenue > 0 ? (simProfit / simRevenue) * 100 : 0;

  if (loading) {
    return <div className="p-6 text-center text-sm text-[#ccc]">読み込み中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">案件検討</h1>
        <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">SIMULATION</p>
      </div>

      {/* ── 着地予測KPI ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '実績売上', value: totalRevenue, sim: simRevenue, color: '#D4A03A' },
          { label: '実績経費', value: totalExpense, sim: totalExpense, color: '#C23728' },
          { label: '実績利益', value: totalProfit, sim: simProfit, color: totalProfit >= 0 ? '#1B4D3E' : '#C23728' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-2xl px-5 py-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <p className="text-[10px] tracking-wider text-[#999] mb-2">{kpi.label}</p>
            <p className="font-['Saira_Condensed'] text-lg tabular-nums text-[#999]">{yen(kpi.value)}</p>
            {hasSim && kpi.sim !== kpi.value && (
              <div className="mt-2 pt-2 border-t border-dashed border-[#D4A03A]/20">
                <p className="text-[9px] tracking-wider text-[#D4A03A] mb-0.5">着地見込</p>
                <p className="font-['Saira_Condensed'] text-2xl tabular-nums" style={{ color: kpi.label === '実績利益' ? (simProfit >= 0 ? '#1B4D3E' : '#C23728') : kpi.color }}>{yen(kpi.sim)}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 着地利益率 ── */}
      {hasSim && (
        <div className="bg-white rounded-2xl px-5 py-4 mb-8" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] tracking-wider text-[#999]">着地利益率</p>
            <div className="flex items-center gap-3">
              <span className="font-['Saira_Condensed'] text-xs tabular-nums text-[#999]">{profitRate.toFixed(1)}%</span>
              <span className="text-[10px] text-[#999]">→</span>
              <span className="font-['Saira_Condensed'] text-sm tabular-nums font-medium" style={{ color: simProfitRate >= 0 ? '#1B4D3E' : '#C23728' }}>{simProfitRate.toFixed(1)}%</span>
            </div>
          </div>
          <div className="w-full h-2 bg-[#F5F5F3] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(Math.max(simProfitRate, 0), 100)}%`, background: '#D4A03A' }} />
          </div>
        </div>
      )}

      {/* ── 見込み案件一覧 ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-medium tracking-widest text-[#999]">見込み案件</p>
          <button
            onClick={addSimItem}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-[#D4A03A] rounded-lg hover:bg-[#C49530] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 案件を追加
          </button>
        </div>

        {simItems.length === 0 ? (
          <div className="bg-white rounded-2xl py-16 text-center" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <p className="text-sm text-[#ccc] mb-1">見込み案件がありません</p>
            <p className="text-[10px] text-[#ddd]">「案件を追加」で売上シミュレーションを開始できます</p>
          </div>
        ) : (
          <div className="space-y-4">
            {simItems.map(item => {
              const monthly = simMonthlyAmount(item);
              const months = Math.max(0, item.endMonth - item.startMonth + 1);
              const total = monthly * months;
              const divInfo = DIVISIONS[item.division as keyof typeof DIVISIONS];
              return (
                <div key={item.id} className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
                  {/* カードヘッダー */}
                  <div className="px-5 pt-5 pb-3 flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="案件名（例: KKday業務委託）"
                        value={item.name}
                        onChange={e => updateSimItem(item.id, { name: e.target.value })}
                        className="text-sm text-[#1a1a1a] bg-transparent outline-none w-full placeholder:text-[#ccc] font-medium"
                      />
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="w-2 h-2 rounded-sm" style={{ background: divInfo?.color || '#C4B49A' }} />
                        <span className="text-[10px] text-[#999]">{divInfo?.name || item.division}</span>
                        <span className="text-[10px] text-[#999]">·</span>
                        <span className="text-[10px] text-[#999]">{item.startMonth}月〜{item.endMonth}月</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="font-['Saira_Condensed'] text-xl tabular-nums text-[#D4A03A]">{yen(monthly)}<span className="text-xs text-[#999] font-sans">/月</span></p>
                        <p className="text-[10px] text-[#999] font-['Saira_Condensed'] tabular-nums">{months}ヶ月 = {yen(total)}</p>
                      </div>
                      <button onClick={() => removeSimItem(item.id)} className="text-[#ddd] hover:text-[#C23728] transition-colors p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* カード詳細 */}
                  <div className="px-5 pb-5 pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* 金額タイプ */}
                      <div className="flex items-center gap-0.5 bg-[#F5F5F3] rounded-lg p-0.5">
                        <button
                          onClick={() => updateSimItem(item.id, { type: 'monthly' })}
                          className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${item.type === 'monthly' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#999]'}`}
                        >月額</button>
                        <button
                          onClick={() => updateSimItem(item.id, { type: 'hourly' })}
                          className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${item.type === 'hourly' ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#999]'}`}
                        >時給</button>
                      </div>

                      {item.type === 'monthly' ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={item.monthlyAmount || ''}
                            onChange={e => updateSimItem(item.id, { monthlyAmount: parseInt(e.target.value) || 0 })}
                            placeholder="210,000"
                            className="w-28 text-sm font-['Saira_Condensed'] tabular-nums text-right bg-[#F5F5F3] rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                          />
                          <span className="text-[10px] text-[#999]">円/月</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="number"
                            value={item.hourlyRate || ''}
                            onChange={e => updateSimItem(item.id, { hourlyRate: parseInt(e.target.value) || 0 })}
                            placeholder="4,200"
                            className="w-20 text-sm font-['Saira_Condensed'] tabular-nums text-right bg-[#F5F5F3] rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                          />
                          <span className="text-[10px] text-[#999]">円/h ×</span>
                          <input
                            type="number"
                            value={item.hoursPerDay}
                            onChange={e => updateSimItem(item.id, { hoursPerDay: parseFloat(e.target.value) || 0 })}
                            className="w-12 text-sm font-['Saira_Condensed'] tabular-nums text-right bg-[#F5F5F3] rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                          />
                          <span className="text-[10px] text-[#999]">h/日 ×</span>
                          <input
                            type="number"
                            value={item.daysPerWeek}
                            onChange={e => updateSimItem(item.id, { daysPerWeek: parseFloat(e.target.value) || 0 })}
                            className="w-12 text-sm font-['Saira_Condensed'] tabular-nums text-right bg-[#F5F5F3] rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                          />
                          <span className="text-[10px] text-[#999]">日/週</span>
                        </div>
                      )}

                      <span className="text-[10px] text-[#ccc]">|</span>

                      {/* 期間 */}
                      <div className="flex items-center gap-1">
                        <select
                          value={item.startMonth}
                          onChange={e => updateSimItem(item.id, { startMonth: parseInt(e.target.value) })}
                          className="text-[11px] bg-[#F5F5F3] rounded-lg px-2 py-1.5 outline-none"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>{m}月</option>
                          ))}
                        </select>
                        <span className="text-[10px] text-[#999]">〜</span>
                        <select
                          value={item.endMonth}
                          onChange={e => updateSimItem(item.id, { endMonth: parseInt(e.target.value) })}
                          className="text-[11px] bg-[#F5F5F3] rounded-lg px-2 py-1.5 outline-none"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>{m}月</option>
                          ))}
                        </select>
                      </div>

                      {/* 事業 */}
                      <select
                        value={item.division}
                        onChange={e => updateSimItem(item.id, { division: e.target.value })}
                        className="text-[11px] bg-[#F5F5F3] rounded-lg px-2 py-1.5 outline-none"
                      >
                        {Object.entries(DIVISIONS).map(([id, d]) => (
                          <option key={id} value={id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
