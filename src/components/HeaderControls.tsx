'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const OWNERS = [
  { key: 'all', label: '全体' },
  { key: 'tomo', label: 'トモ' },
  { key: 'toshiki', label: 'トシキ' },
] as const;

type PeriodMode = 'month' | 'fiscal' | 'year' | 'range';

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

export default function HeaderControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const owner = searchParams.get('owner') || 'all';

  // 期間パラメータ読み取り
  const modeParam = (searchParams.get('mode') as PeriodMode) || 'month';
  const ymParam = searchParams.get('ym') || `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const fyParam = searchParams.get('fy') || String(currentYear);
  const yParam = searchParams.get('y') || String(currentYear);
  const fromParam = searchParams.get('from') || `${currentYear}-01`;
  const toParam = searchParams.get('to') || `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const [fiscalStartMonth, setFiscalStartMonth] = useState(1);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => parseInt(ymParam.split('-')[0]));
  const monthPickerRef = useRef<HTMLDivElement>(null);

  // ポップオーバー外クリックで閉じる
  useEffect(() => {
    if (!showMonthPicker) return;
    const handler = (e: MouseEvent) => {
      if (monthPickerRef.current && !monthPickerRef.current.contains(e.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMonthPicker]);

  // ymParam変更時にpickerYearを同期
  useEffect(() => {
    setPickerYear(parseInt(ymParam.split('-')[0]));
  }, [ymParam]);

  // 決算期開始月を取得
  useEffect(() => {
    if (!supabase) return;
    const effectiveOwner = owner === 'all' ? 'tomo' : owner;
    supabase.from('profiles').select('fiscal_start_month').eq('user_key', effectiveOwner).single()
      .then(({ data }: { data: any }) => {
        if (data?.fiscal_start_month) setFiscalStartMonth(data.fiscal_start_month);
      });
  }, [owner]);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => params.set(k, v));
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  // 月送り
  const shiftMonth = (delta: number) => {
    const [y, m] = ymParam.split('-').map(Number);
    let newM = m + delta;
    let newY = y;
    if (newM > 12) { newM = 1; newY++; }
    if (newM < 1) { newM = 12; newY--; }
    updateParams({ mode: 'month', ym: `${newY}-${String(newM).padStart(2, '0')}` });
  };

  // 今月に戻る
  const goToday = () => {
    updateParams({ mode: 'month', ym: `${currentYear}-${String(currentMonth).padStart(2, '0')}` });
  };

  // 表示ラベル
  const periodLabel = (() => {
    if (modeParam === 'month') {
      const [y, m] = ymParam.split('-').map(Number);
      return `${y}年${m}月`;
    }
    if (modeParam === 'fiscal') {
      const fy = parseInt(fyParam);
      const startM = fiscalStartMonth;
      const endM = startM === 1 ? 12 : startM - 1;
      const endY = startM === 1 ? fy : fy + 1;
      return `${fy}年${startM}月〜${endY}年${endM}月`;
    }
    if (modeParam === 'year') {
      return `${yParam}年（1月〜12月）`;
    }
    // range
    const [fy, fm] = fromParam.split('-').map(Number);
    const [ty, tm] = toParam.split('-').map(Number);
    if (fy === ty) return `${fy}年${fm}月〜${tm}月`;
    return `${fy}年${fm}月〜${ty}年${tm}月`;
  })();

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* 担当者フィルター */}
      <div className="flex bg-[#F5F5F3] rounded-lg p-0.5">
        {OWNERS.map((o) => (
          <button
            key={o.key}
            onClick={() => updateParams({ owner: o.key })}
            className={`px-3 py-1.5 text-xs rounded-md transition-all duration-200 ${
              owner === o.key
                ? 'bg-white text-[#1a1a1a] shadow-sm font-medium'
                : 'text-[#999] hover:text-[#6b6b6b]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 期間バー */}
      <div className="flex items-center gap-1 bg-[#F5F5F3] rounded-lg p-0.5">
        {([
          { mode: 'month' as PeriodMode, label: '月' },
          { mode: 'fiscal' as PeriodMode, label: '決算期' },
          { mode: 'year' as PeriodMode, label: '年間' },
          { mode: 'range' as PeriodMode, label: '期間' },
        ]).map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => updateParams({ mode })}
            className={`px-2.5 py-1.5 text-[10px] rounded-md transition-all duration-200 ${
              modeParam === mode
                ? 'bg-white text-[#1a1a1a] shadow-sm font-medium'
                : 'text-[#999] hover:text-[#6b6b6b]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 期間コントロール */}
      <div className="flex items-center gap-1.5">
        {modeParam === 'month' && (
          <div className="relative" ref={monthPickerRef}>
            <div className="flex items-center">
              <button onClick={() => shiftMonth(-1)} className="p-1 hover:bg-[#F5F5F3] rounded">
                <ChevronLeft className="w-3.5 h-3.5 text-[#999]" />
              </button>
              <button
                onClick={() => { setPickerYear(parseInt(ymParam.split('-')[0])); setShowMonthPicker(!showMonthPicker); }}
                className="text-[11px] font-['Saira_Condensed'] tabular-nums text-[#1a1a1a] hover:text-[#D4A03A] transition-colors px-1 border-b border-transparent hover:border-[#D4A03A]"
                style={showMonthPicker ? { color: '#D4A03A', borderBottomColor: '#D4A03A' } : {}}
              >
                {periodLabel}
              </button>
              <button onClick={() => shiftMonth(1)} className="p-1 hover:bg-[#F5F5F3] rounded">
                <ChevronRight className="w-3.5 h-3.5 text-[#999]" />
              </button>
            </div>

            {showMonthPicker && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-xl border border-[#e5e5e3] z-50 p-3 w-[220px]"
                style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
                <div className="flex justify-between items-center mb-2.5">
                  <button onClick={() => setPickerYear(y => y - 1)} className="p-1 hover:bg-[#F5F5F3] rounded">
                    <ChevronLeft className="w-3 h-3 text-[#999]" />
                  </button>
                  <span className="text-[13px] font-medium font-['Saira_Condensed'] tabular-nums text-[#1a1a1a]">{pickerYear}</span>
                  <button onClick={() => setPickerYear(y => y + 1)} className="p-1 hover:bg-[#F5F5F3] rounded">
                    <ChevronRight className="w-3 h-3 text-[#999]" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const [selY, selM] = ymParam.split('-').map(Number);
                    const isSelected = pickerYear === selY && m === selM;
                    const isCurrent = pickerYear === currentYear && m === currentMonth;
                    const isFuture = pickerYear > currentYear || (pickerYear === currentYear && m > currentMonth);
                    return (
                      <button
                        key={m}
                        onClick={() => {
                          updateParams({ mode: 'month', ym: `${pickerYear}-${String(m).padStart(2, '0')}` });
                          setShowMonthPicker(false);
                        }}
                        className={`py-1.5 text-[12px] rounded-md transition-all duration-150 ${
                          isSelected
                            ? 'bg-[#D4A03A] text-white font-medium'
                            : isCurrent
                            ? 'text-[#D4A03A] font-medium hover:bg-[#F5F5F3]'
                            : isFuture
                            ? 'text-[#ccc] hover:bg-[#F5F5F3] hover:text-[#999]'
                            : 'text-[#666] hover:bg-[#F5F5F3]'
                        }`}
                      >
                        {m}月
                      </button>
                    );
                  })}
                </div>
                {!(parseInt(ymParam.split('-')[0]) === currentYear && parseInt(ymParam.split('-')[1]) === currentMonth) && (
                  <button
                    onClick={() => {
                      updateParams({ mode: 'month', ym: `${currentYear}-${String(currentMonth).padStart(2, '0')}` });
                      setShowMonthPicker(false);
                    }}
                    className="w-full mt-2 text-[10px] text-[#D4A03A] hover:text-[#b8882e] transition-colors"
                  >
                    今月に戻る
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {modeParam === 'fiscal' && (
          <div className="flex items-center gap-1">
            <button onClick={() => updateParams({ fy: String(parseInt(fyParam) - 1) })} className="p-1 hover:bg-[#F5F5F3] rounded">
              <ChevronLeft className="w-3.5 h-3.5 text-[#999]" />
            </button>
            <span className="text-[11px] font-['Saira_Condensed'] tabular-nums text-[#1a1a1a] px-1">{periodLabel}</span>
            <button onClick={() => updateParams({ fy: String(parseInt(fyParam) + 1) })} className="p-1 hover:bg-[#F5F5F3] rounded">
              <ChevronRight className="w-3.5 h-3.5 text-[#999]" />
            </button>
          </div>
        )}

        {modeParam === 'year' && (
          <div className="flex items-center gap-1">
            <button onClick={() => updateParams({ y: String(parseInt(yParam) - 1) })} className="p-1 hover:bg-[#F5F5F3] rounded">
              <ChevronLeft className="w-3.5 h-3.5 text-[#999]" />
            </button>
            <span className="text-[11px] font-['Saira_Condensed'] tabular-nums text-[#1a1a1a] px-1">{periodLabel}</span>
            <button onClick={() => updateParams({ y: String(parseInt(yParam) + 1) })} className="p-1 hover:bg-[#F5F5F3] rounded">
              <ChevronRight className="w-3.5 h-3.5 text-[#999]" />
            </button>
          </div>
        )}

        {modeParam === 'range' && (
          <div className="flex items-center gap-1">
            <select value={fromParam} onChange={e => updateParams({ from: e.target.value })}
              className="text-[10px] bg-white px-1.5 py-1 rounded border-0 outline-none font-['Saira_Condensed'] tabular-nums">
              {Array.from({ length: 36 }, (_, i) => {
                const y = currentYear - 2 + Math.floor(i / 12);
                const m = (i % 12) + 1;
                const val = `${y}-${String(m).padStart(2, '0')}`;
                return <option key={val} value={val}>{y}年{m}月</option>;
              })}
            </select>
            <span className="text-[10px] text-[#999]">〜</span>
            <select value={toParam} onChange={e => updateParams({ to: e.target.value })}
              className="text-[10px] bg-white px-1.5 py-1 rounded border-0 outline-none font-['Saira_Condensed'] tabular-nums">
              {Array.from({ length: 36 }, (_, i) => {
                const y = currentYear - 2 + Math.floor(i / 12);
                const m = (i % 12) + 1;
                const val = `${y}-${String(m).padStart(2, '0')}`;
                return <option key={val} value={val}>{y}年{m}月</option>;
              })}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== 期間計算ユーティリティ ==========
// 各ページがURLパラメータから期間を取得するためのヘルパー

export function usePeriodRange() {
  const searchParams = useSearchParams();
  const [fiscalStartMonth, setFiscalStartMonth] = useState(1);

  const owner = searchParams.get('owner') || 'all';
  const mode = (searchParams.get('mode') as PeriodMode) || 'month';
  const ym = searchParams.get('ym') || `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const fy = searchParams.get('fy') || String(currentYear);
  const y = searchParams.get('y') || String(currentYear);
  const from = searchParams.get('from') || `${currentYear}-01`;
  const to = searchParams.get('to') || `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  useEffect(() => {
    if (!supabase) return;
    const effectiveOwner = owner === 'all' ? 'tomo' : owner;
    supabase.from('profiles').select('fiscal_start_month').eq('user_key', effectiveOwner).single()
      .then(({ data }: { data: any }) => {
        if (data?.fiscal_start_month) setFiscalStartMonth(data.fiscal_start_month);
      });
  }, [owner]);

  // startDate, endDate を算出
  let startDate: string;
  let endDate: string;

  if (mode === 'month') {
    const [yr, mn] = ym.split('-').map(Number);
    startDate = `${yr}-${String(mn).padStart(2, '0')}-01`;
    endDate = mn === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mn + 1).padStart(2, '0')}-01`;
  } else if (mode === 'fiscal') {
    const fyNum = parseInt(fy);
    const sm = fiscalStartMonth;
    startDate = `${fyNum}-${String(sm).padStart(2, '0')}-01`;
    if (sm === 1) {
      endDate = `${fyNum + 1}-01-01`;
    } else {
      endDate = `${fyNum + 1}-${String(sm).padStart(2, '0')}-01`;
    }
  } else if (mode === 'year') {
    const yNum = parseInt(y);
    startDate = `${yNum}-01-01`;
    endDate = `${yNum + 1}-01-01`;
  } else {
    // range
    const [fy2, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    startDate = `${fy2}-${String(fm).padStart(2, '0')}-01`;
    endDate = tm === 12 ? `${ty + 1}-01-01` : `${ty}-${String(tm + 1).padStart(2, '0')}-01`;
  }

  // year（後方互換 — 既存ページがyearパラメータを使っている場合のフォールバック）
  const year = mode === 'month' ? ym.split('-')[0]
    : mode === 'fiscal' ? fy
    : mode === 'year' ? y
    : from.split('-')[0];

  return { mode, owner, startDate, endDate, year, fiscalStartMonth };
}
