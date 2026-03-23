'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export const OWNER_CONFIG = {
  tomo:    { label: 'トモ',   color: '#81D8D0', bg: '#EAF6F6', dotColor: '#81D8D0' },
  toshiki: { label: 'トシキ', color: '#D4A03A', bg: '#FBF5E6', dotColor: '#D4A03A' },
  all:     { label: '全体',   color: '#999999', bg: '#F5F5F3', dotColor: '#999999' },
} as const;

export const OWNER_COLOR_PRESETS: Record<string, { value: string; label: string }[]> = {
  tomo: [
    { value: '#EAF6F6', label: 'ティール' },
    { value: '#F0EDF8', label: 'ラベンダー' },
    { value: '#ECF4EC', label: 'セージ' },
  ],
  toshiki: [
    { value: '#FBF5E6', label: 'ゴールド' },
    { value: '#FAEFEA', label: 'テラコッタ' },
    { value: '#E6EDE6', label: 'ブリティッシュグリーン' },
  ],
  all: [
    { value: '#F5F5F3', label: '白系' },
    { value: '#E8E6E3', label: 'グレー系' },
    { value: '#2A2A2A', label: '黒系' },
  ],
};

// 表示順: トモ → トシキ → 全体（全体はlocalStorageで非表示可）
const OWNER_KEYS = ['tomo', 'toshiki', 'all'] as const;

const PAGE_NAMES: Record<string, string> = {
  '/': 'ホーム',
  '/expenses': '経費',
  '/income': '売上',
  '/tax-return': '確定申告',
  '/management': '経営',
  '/simulation': '案件検討',
  '/settings': '設定',
};

type PeriodMode = 'month' | 'fiscal' | 'year' | 'range';

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

export default function HeaderControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // デフォルトをlocalStorageから復元（初回はtomo）
  const getDefaultOwner = () => {
    if (typeof window === 'undefined') return 'tomo';
    return localStorage.getItem('komu10_owner') || 'tomo';
  };
  const owner = searchParams.get('owner') || getDefaultOwner();

  // 「全体」表示トグル（設定ページから変更。デフォルトOFF）
  const [showAllTab, setShowAllTab] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('komu10_show_all') === 'true';
  });
  const visibleOwners = showAllTab ? OWNER_KEYS : OWNER_KEYS.filter(k => k !== 'all');

  // owner変更時にlocalStorageに保存
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('komu10_owner', owner);
  }, [owner]);

  // owner_colorをDBから取得
  const [ownerColors, setOwnerColors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!supabase) return;
    supabase.from('profiles').select('user_key, owner_color').then(({ data }: { data: any }) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((p: any) => { if (p.owner_color) map[p.user_key] = p.owner_color; });
        setOwnerColors(map);
      }
    });
  }, []);

  // 背景色をbodyに適用（DB値優先、なければデフォルト）
  const isDark = (color: string) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  };

  useEffect(() => {
    const cfg = OWNER_CONFIG[owner as keyof typeof OWNER_CONFIG] || OWNER_CONFIG.tomo;
    const bgColor = ownerColors[owner] || cfg.bg;
    document.documentElement.style.setProperty('--owner-bg', bgColor);
    document.body.style.backgroundColor = bgColor;
    // ダークモード対応
    if (isDark(bgColor)) {
      document.documentElement.classList.add('dark-owner');
    } else {
      document.documentElement.classList.remove('dark-owner');
    }
    return () => {
      document.body.style.backgroundColor = '';
      document.documentElement.classList.remove('dark-owner');
    };
  }, [owner, ownerColors]);

  // ページ名
  const pageName = PAGE_NAMES[pathname] || '';
  const ownerCfg = OWNER_CONFIG[owner as keyof typeof OWNER_CONFIG] || OWNER_CONFIG.tomo;

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
      {/* 担当者コンテキスト表示 */}
      <div className="flex items-center gap-1.5 mr-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ownerCfg.dotColor }} />
        <span className="text-xs font-medium text-[#1a1a1a]">
          {ownerCfg.label}{pageName ? `の${pageName}` : ''}
        </span>
      </div>

      {/* 担当者フィルター */}
      <div className="flex bg-[#F5F5F3] rounded-lg p-0.5">
        {visibleOwners.map((key) => {
          const cfg = OWNER_CONFIG[key];
          const isActive = owner === key;
          return (
            <button
              key={key}
              onClick={() => updateParams({ owner: key })}
              className={`px-3 py-1.5 text-xs rounded-md transition-all duration-200 ${
                isActive
                  ? 'bg-white shadow-sm font-medium'
                  : key === 'all'
                  ? 'text-[#ccc] hover:text-[#999]'
                  : 'text-[#999] hover:text-[#6b6b6b]'
              }`}
              style={isActive ? { color: cfg.dotColor } : undefined}
            >
              {cfg.label}
            </button>
          );
        })}
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
              <div className="absolute top-full right-0 mt-2 bg-white rounded-xl border border-[#e5e5e3] z-50 p-3 w-[220px]"
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

  const owner = searchParams.get('owner') || (typeof window !== 'undefined' ? localStorage.getItem('komu10_owner') : null) || 'tomo';
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
