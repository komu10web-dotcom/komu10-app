'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, DIVISIONS, formatYen } from '@/lib/constants';

interface MonthlyData {
  month: string;
  revenue: number;
  expense: number;
}

interface DivisionMonthlyData {
  [divisionId: string]: MonthlyData[];
}

interface MonthlyChartProps {
  data: MonthlyData[];
  byDivision?: DivisionMonthlyData;
}

type ViewMode = 'profit' | 'revenue' | 'expense';
type ScopeMode = 'all' | 'division';

export default function MonthlyChart({ data, byDivision }: MonthlyChartProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('profit');
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  
  const chartHeight = 160;

  const handleBarClick = (month: string, type?: 'revenue' | 'expense', division?: string) => {
    let url = `/transactions?month=${month}`;
    if (type) url += `&type=${type}`;
    if (division) url += `&division=${division}`;
    router.push(url);
  };

  // 全体表示
  const renderAllChart = () => {
    if (viewMode === 'profit') {
      // 利益表示（プラス/マイナス）
      const profits = data.map(d => d.revenue - d.expense);
      const maxProfit = Math.max(...profits.map(Math.abs), 1);
      
      return (
        <div className="flex items-center gap-3" style={{ height: chartHeight }}>
          {data.map((d, i) => {
            const profit = d.revenue - d.expense;
            const barHeight = (Math.abs(profit) / maxProfit) * ((chartHeight - 24) / 2);
            const isPositive = profit >= 0;
            
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center">
                <div className="flex flex-col items-center justify-center" style={{ height: chartHeight - 24 }}>
                  {/* 上半分（プラス） */}
                  <div className="flex items-end justify-center" style={{ height: (chartHeight - 24) / 2 }}>
                    {isPositive && (
                      <div
                        className="chart-bar w-6 rounded-t transition-all tooltip cursor-pointer"
                        style={{ height: Math.max(barHeight, 2), background: COLORS.green }}
                        data-tooltip={`利益: ${formatYen(profit)}`}
                        onClick={() => handleBarClick(d.month)}
                      />
                    )}
                  </div>
                  {/* 中央線 */}
                  <div className="w-full h-px" style={{ background: COLORS.border }} />
                  {/* 下半分（マイナス） */}
                  <div className="flex items-start justify-center" style={{ height: (chartHeight - 24) / 2 }}>
                    {!isPositive && (
                      <div
                        className="chart-bar w-6 rounded-b transition-all tooltip cursor-pointer"
                        style={{ height: Math.max(barHeight, 2), background: COLORS.crimson }}
                        data-tooltip={`損失: ${formatYen(profit)}`}
                        onClick={() => handleBarClick(d.month)}
                      />
                    )}
                  </div>
                </div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>
                  {d.month.split('-')[1]}月
                </div>
              </div>
            );
          })}
        </div>
      );
    } else {
      // 売上 or 経費 単独表示
      const values = data.map(d => viewMode === 'revenue' ? d.revenue : d.expense);
      const maxValue = Math.max(...values, 1);
      const barColor = viewMode === 'revenue' ? COLORS.gold : COLORS.crimson;
      
      return (
        <div className="flex items-end gap-3" style={{ height: chartHeight }}>
          {data.map((d, i) => {
            const value = viewMode === 'revenue' ? d.revenue : d.expense;
            const barHeight = (value / maxValue) * (chartHeight - 24);
            
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end justify-center flex-1">
                  <div
                    className="chart-bar w-6 rounded-t transition-all tooltip cursor-pointer"
                    style={{ height: Math.max(barHeight, 2), background: barColor }}
                    data-tooltip={`${viewMode === 'revenue' ? '売上' : '経費'}: ${formatYen(value)}`}
                    onClick={() => handleBarClick(d.month, viewMode)}
                  />
                </div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>
                  {d.month.split('-')[1]}月
                </div>
              </div>
            );
          })}
        </div>
      );
    }
  };

  // 部門別表示
  const renderDivisionChart = () => {
    if (!byDivision) return renderAllChart();
    
    // 各部門の値を計算
    const getValue = (d: MonthlyData) => {
      if (viewMode === 'profit') return d.revenue - d.expense;
      if (viewMode === 'revenue') return d.revenue;
      return d.expense;
    };
    
    // 全部門の最大値を取得
    let maxValue = 1;
    DIVISIONS.forEach(div => {
      const divData = byDivision[div.id] || [];
      divData.forEach(d => {
        const v = Math.abs(getValue(d));
        if (v > maxValue) maxValue = v;
      });
    });

    return (
      <div className="flex items-end gap-2" style={{ height: chartHeight }}>
        {data.map((d, monthIndex) => {
          const month = d.month;
          
          return (
            <div key={month} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-end gap-px flex-1">
                {DIVISIONS.map(div => {
                  const divData = byDivision[div.id]?.find(dd => dd.month === month);
                  const value = divData ? getValue(divData) : 0;
                  const barHeight = (Math.abs(value) / maxValue) * (chartHeight - 24);
                  
                  return (
                    <div
                      key={div.id}
                      className="chart-bar w-1.5 rounded-t transition-all tooltip cursor-pointer"
                      style={{ 
                        height: Math.max(barHeight, 1), 
                        background: div.color,
                        opacity: value === 0 ? 0.3 : 1
                      }}
                      data-tooltip={`${div.abbr}: ${formatYen(value)}`}
                      onClick={() => handleBarClick(month, viewMode === 'profit' ? undefined : viewMode, div.id)}
                    />
                  );
                })}
              </div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>
                {month.split('-')[1]}月
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card">
      {/* ヘッダー：タイトル + 切り替えボタン */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-medium" style={{ color: COLORS.textMuted }}>
          月別推移
        </div>
        <div className="flex items-center gap-2">
          {/* 表示切り替え */}
          <div className="flex items-center border rounded" style={{ borderColor: COLORS.border }}>
            {(['profit', 'revenue', 'expense'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-2 py-1 text-xs transition-colors"
                style={{ 
                  background: viewMode === mode ? 'rgba(27,77,62,0.1)' : 'transparent',
                  color: viewMode === mode ? COLORS.green : COLORS.textMuted
                }}
              >
                {{ profit: '利益', revenue: '売上', expense: '経費' }[mode]}
              </button>
            ))}
          </div>
          {/* スコープ切り替え */}
          {byDivision && (
            <div className="flex items-center border rounded" style={{ borderColor: COLORS.border }}>
              <button
                onClick={() => setScopeMode('all')}
                className="px-2 py-1 text-xs transition-colors"
                style={{ 
                  background: scopeMode === 'all' ? 'rgba(27,77,62,0.1)' : 'transparent',
                  color: scopeMode === 'all' ? COLORS.green : COLORS.textMuted
                }}
              >
                全体
              </button>
              <button
                onClick={() => setScopeMode('division')}
                className="px-2 py-1 text-xs transition-colors"
                style={{ 
                  background: scopeMode === 'division' ? 'rgba(27,77,62,0.1)' : 'transparent',
                  color: scopeMode === 'division' ? COLORS.green : COLORS.textMuted
                }}
              >
                部門別
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* チャート本体 */}
      {scopeMode === 'all' ? renderAllChart() : renderDivisionChart()}

      {/* 凡例 */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: COLORS.border }}>
        {scopeMode === 'all' ? (
          viewMode === 'profit' ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ background: COLORS.green }} />
                <span className="text-xs" style={{ color: COLORS.textSecondary }}>利益</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ background: COLORS.crimson }} />
                <span className="text-xs" style={{ color: COLORS.textSecondary }}>損失</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ background: viewMode === 'revenue' ? COLORS.gold : COLORS.crimson }} />
              <span className="text-xs" style={{ color: COLORS.textSecondary }}>
                {viewMode === 'revenue' ? '売上' : '経費'}
              </span>
            </div>
          )
        ) : (
          // 部門別凡例
          <div className="flex flex-wrap items-center justify-center gap-3">
            {DIVISIONS.map(div => (
              <div key={div.id} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded" style={{ background: div.color }} />
                <span className="text-xs" style={{ color: COLORS.textSecondary }}>{div.abbr}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="text-xs text-center mt-2" style={{ color: COLORS.textMuted }}>
        ※ クリックで取引一覧にフィルター
      </div>
    </div>
  );
}
