'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

const OWNERS = [
  { key: 'all', label: '全体' },
  { key: 'tomo', label: 'トモ' },
  { key: 'toshiki', label: 'トシキ' },
] as const;

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

export default function HeaderControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const owner = searchParams.get('owner') || 'all';
  const year = searchParams.get('year') || currentYear.toString();

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(key, value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex items-center gap-3">
      {/* 担当者フィルター */}
      <div className="flex bg-[#F5F5F3] rounded-lg p-0.5">
        {OWNERS.map((o) => (
          <button
            key={o.key}
            onClick={() => updateParams('owner', o.key)}
            className={`
              px-3 py-1.5 text-xs rounded-md transition-all duration-200
              ${owner === o.key
                ? 'bg-white text-[#1a1a1a] shadow-sm font-medium'
                : 'text-[#999] hover:text-[#6b6b6b]'
              }
            `}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 年度セレクター */}
      <select
        value={year}
        onChange={(e) => updateParams('year', e.target.value)}
        className="text-xs bg-[#F5F5F3] text-[#1a1a1a] px-3 py-1.5 rounded-lg border-0 outline-none cursor-pointer font-['Saira_Condensed']"
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}年
          </option>
        ))}
      </select>
    </div>
  );
}
