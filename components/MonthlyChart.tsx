'use client';

import { useRouter } from 'next/navigation';
import { COLORS, formatYen } from '@/lib/constants';

interface MonthlyData {
  month: string;
  revenue: number;
  expense: number;
}

interface MonthlyChartProps {
  data: MonthlyData[];
}

export default function MonthlyChart({ data }: MonthlyChartProps) {
  const router = useRouter();
  
  const maxValue = Math.max(...data.flatMap(d => [d.revenue, d.expense]), 1);
  const chartHeight = 160;

  const handleBarClick = (month: string, type: 'revenue' | 'expense') => {
    // YYYY-MM形式で取引一覧にフィルター
    router.push(`/transactions?month=${month}&type=${type}`);
  };

  return (
    <div className="card">
      <div className="text-xs font-medium mb-4" style={{ color: COLORS.textMuted }}>
        月別推移
      </div>
      
      <div className="flex items-end gap-3" style={{ height: chartHeight }}>
        {data.map((d, i) => {
          const revenueHeight = (d.revenue / maxValue) * (chartHeight - 24);
          const expenseHeight = (d.expense / maxValue) * (chartHeight - 24);
          
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-end gap-1 flex-1">
                {/* 売上バー */}
                <div
                  className="chart-bar w-4 rounded-t transition-all tooltip"
                  style={{
                    height: Math.max(revenueHeight, 2),
                    background: COLORS.gold,
                  }}
                  data-tooltip={`売上: ${formatYen(d.revenue)}`}
                  onClick={() => handleBarClick(d.month, 'revenue')}
                />
                {/* 経費バー */}
                <div
                  className="chart-bar w-4 rounded-t transition-all tooltip"
                  style={{
                    height: Math.max(expenseHeight, 2),
                    background: COLORS.crimson,
                  }}
                  data-tooltip={`経費: ${formatYen(d.expense)}`}
                  onClick={() => handleBarClick(d.month, 'expense')}
                />
              </div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>
                {d.month.split('-')[1]}月
              </div>
            </div>
          );
        })}
      </div>

      {/* 凡例 */}
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ background: COLORS.gold }} />
          <span className="text-xs" style={{ color: COLORS.textSecondary }}>売上</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ background: COLORS.crimson }} />
          <span className="text-xs" style={{ color: COLORS.textSecondary }}>経費</span>
        </div>
      </div>
      
      <div className="text-xs text-center mt-2" style={{ color: COLORS.textMuted }}>
        ※ クリックで取引一覧にフィルター
      </div>
    </div>
  );
}
