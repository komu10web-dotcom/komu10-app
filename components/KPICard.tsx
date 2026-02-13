'use client';

import { useRouter } from 'next/navigation';
import { COLORS, formatYen } from '@/lib/constants';

interface KPICardProps {
  label: string;
  value: number;
  subValue?: string;
  color: string;
  filterType?: 'revenue' | 'expense';
  clickable?: boolean;
}

export default function KPICard({ label, value, subValue, color, filterType, clickable = true }: KPICardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (clickable && filterType) {
      router.push(`/transactions?type=${filterType}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`card ${clickable ? 'card-hover cursor-pointer' : ''}`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="text-xs mb-1" style={{ color: COLORS.textMuted }}>
        {label}
      </div>
      <div className="font-number text-2xl" style={{ color }}>
        {formatYen(value)}
      </div>
      {subValue && (
        <div className="text-xs mt-1" style={{ color: COLORS.textSecondary }}>
          {subValue}
        </div>
      )}
    </div>
  );
}
