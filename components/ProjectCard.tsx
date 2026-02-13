'use client';

import { COLORS, formatYen, formatPercent, getDivision, getStatus, getUser } from '@/lib/constants';
import { Project } from '@/lib/supabase';

interface ProjectCardProps {
  project: Project;
  stats: {
    revenue: number;
    expense: number;
  };
  onClick?: () => void;
}

export default function ProjectCard({ project, stats, onClick }: ProjectCardProps) {
  const division = getDivision(project.division);
  const status = getStatus(project.status);
  const owner = getUser(project.owner);
  
  const profit = stats.revenue - stats.expense;
  
  // ROI: (利益 ÷ 経費) × 100
  const roi = stats.expense > 0 ? (profit / stats.expense) * 100 : 0;
  
  // 利益率: (利益 ÷ 売上) × 100
  const profitMargin = stats.revenue > 0 ? (profit / stats.revenue) * 100 : 0;
  
  // 予算消化率
  const budgetUsed = project.budget && project.budget > 0 
    ? (stats.expense / project.budget) * 100 
    : 0;
  
  // 目標達成率
  const targetAchieved = project.target_revenue && project.target_revenue > 0 
    ? (stats.revenue / project.target_revenue) * 100 
    : 0;

  return (
    <div 
      className="card card-hover cursor-pointer"
      onClick={onClick}
      style={{ borderLeft: `3px solid ${division?.color || COLORS.sand}` }}
    >
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: COLORS.textPrimary }}>
            {project.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: COLORS.textMuted }}>
            {division?.name}{owner ? ` · ${owner.name}` : ''}
          </div>
        </div>
        <span 
          className="badge ml-2 shrink-0"
          style={{ 
            background: `${status?.color}15`,
            color: status?.color 
          }}
        >
          {status?.name}
        </span>
      </div>

      {/* 財務指標 */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <div className="text-xs" style={{ color: COLORS.textMuted }}>売上</div>
          <div className="font-number text-sm" style={{ color: COLORS.gold }}>
            {formatYen(stats.revenue)}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: COLORS.textMuted }}>経費</div>
          <div className="font-number text-sm" style={{ color: COLORS.crimson }}>
            {formatYen(stats.expense)}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: COLORS.textMuted }}>利益</div>
          <div 
            className="font-number text-sm" 
            style={{ color: profit >= 0 ? COLORS.green : COLORS.crimson }}
          >
            {formatYen(profit)}
          </div>
        </div>
        <div>
          {/* ROI と 利益率 両方表示 */}
          <div 
            className="tooltip" 
            data-tooltip="ROI = 利益 ÷ 経費 × 100"
          >
            <div className="text-xs" style={{ color: COLORS.textMuted }}>ROI</div>
            <div 
              className="font-number text-sm"
              style={{ color: roi >= 100 ? COLORS.green : COLORS.textSecondary }}
            >
              {stats.expense > 0 ? formatPercent(roi) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* 利益率（別行） */}
      <div 
        className="flex items-center gap-2 mb-3 tooltip" 
        data-tooltip="利益率 = 利益 ÷ 売上 × 100"
      >
        <div className="text-xs" style={{ color: COLORS.textMuted }}>利益率</div>
        <div 
          className="font-number text-sm"
          style={{ color: profitMargin >= 50 ? COLORS.green : COLORS.textSecondary }}
        >
          {stats.revenue > 0 ? formatPercent(profitMargin) : '—'}
        </div>
      </div>

      {/* プログレスバー */}
      {(project.budget || project.target_revenue) && (
        <div className="flex gap-3">
          {project.budget && project.budget > 0 && (
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: COLORS.textMuted }}>予算消化</span>
                <span className="text-xs font-number" style={{ color: COLORS.textSecondary }}>
                  {formatPercent(budgetUsed)}
                </span>
              </div>
              <div className="progress">
                <div 
                  className="progress-bar"
                  style={{ 
                    width: `${Math.min(budgetUsed, 100)}%`,
                    background: budgetUsed > 100 ? COLORS.crimson : COLORS.gold
                  }}
                />
              </div>
            </div>
          )}
          {project.target_revenue && project.target_revenue > 0 && (
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: COLORS.textMuted }}>目標達成</span>
                <span className="text-xs font-number" style={{ color: COLORS.textSecondary }}>
                  {formatPercent(targetAchieved)}
                </span>
              </div>
              <div className="progress">
                <div 
                  className="progress-bar"
                  style={{ 
                    width: `${Math.min(targetAchieved, 100)}%`,
                    background: targetAchieved >= 100 ? COLORS.green : COLORS.teal
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
