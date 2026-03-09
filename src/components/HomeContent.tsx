'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Uploader } from '@/components/Uploader';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS } from '@/types/database';
import type { Project } from '@/types/database';
import { CheckCircle2, AlertTriangle, ArrowRight, Camera, PenLine, Loader2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import TransportFields, { EMPTY_TRANSPORT } from '@/components/TransportFields';
import type { TransportData } from '@/components/TransportFields';
import { saveTransportDetails } from '@/lib/transportUtils';
import EntertainmentFields, { EMPTY_ENTERTAINMENT } from '@/components/EntertainmentFields';
import type { EntertainmentData } from '@/components/EntertainmentFields';
import { entertainmentToDescription } from '@/lib/entertainmentUtils';

interface TransactionRow {
  id: string;
  date: string;
  store: string | null;
  description: string | null;
  amount: number;
  tx_type: 'expense' | 'revenue';
  kamoku: string;
  confirmed: boolean;
}

type SummaryMode = 'single' | 'ytd' | 'range';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}月`,
}));

export default function HomeContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'all';
  const year = searchParams.get('year') || new Date().getFullYear().toString();

  const [expenseTotal, setExpenseTotal] = useState(0);
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  const [recentTx, setRecentTx] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // サマリーモード
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('single');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(new Date().getMonth() + 1);
  const [rangeFromYear, setRangeFromYear] = useState(year);
  const [rangeToYear, setRangeToYear] = useState(year);

  // ヘッダーの年度変更に追従
  useEffect(() => {
    setRangeFromYear(year);
    setRangeToYear(year);
  }, [year]);

  // 撮影 / 手入力 切替
  const [inputMode, setInputMode] = useState<'camera' | 'manual'>('camera');

  // 手入力フォーム
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    store: '',
    kamoku: 'misc',
    owner: owner === 'all' ? 'tomo' : owner,
    description: '',
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [transportData, setTransportData] = useState<TransportData>({ ...EMPTY_TRANSPORT });
  const [entertainmentData, setEntertainmentData] = useState<EntertainmentData>({ ...EMPTY_ENTERTAINMENT });
  const [allocRows, setAllocRows] = useState<{ division_id: string; project_id: string; percent: number }[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // サマリー期間の計算
  const getDateRange = useCallback(() => {
    let startYear: string;
    let startMonth: number;
    let endYear: string;
    let endMonth: number;

    if (summaryMode === 'single') {
      startYear = year;
      startMonth = selectedMonth;
      endYear = year;
      endMonth = selectedMonth;
    } else if (summaryMode === 'ytd') {
      startYear = year;
      startMonth = 1;
      endYear = year;
      endMonth = selectedMonth;
    } else {
      startYear = rangeFromYear;
      startMonth = rangeFrom;
      endYear = rangeToYear;
      endMonth = rangeTo;
    }

    const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    const endDate = endMonth === 12
      ? `${parseInt(endYear) + 1}-01-01`
      : `${endYear}-${String(endMonth + 1).padStart(2, '0')}-01`;

    return { startDate, endDate };
  }, [summaryMode, selectedMonth, rangeFrom, rangeTo, rangeFromYear, rangeToYear, year]);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    const { startDate, endDate } = getDateRange();

    try {
      let summaryQuery = supabase
        .from('transactions')
        .select('amount, tx_type, confirmed')
        .gte('date', startDate)
        .lt('date', endDate);

      if (owner !== 'all') {
        summaryQuery = summaryQuery.eq('owner', owner);
      }

      const { data: summaryData } = await summaryQuery;

      if (summaryData) {
        let expSum = 0;
        let revSum = 0;
        let uncCount = 0;
        for (const row of summaryData) {
          if (row.tx_type === 'expense') expSum += row.amount;
          if (row.tx_type === 'revenue') revSum += row.amount;
          if (!row.confirmed) uncCount++;
        }
        setExpenseTotal(expSum);
        setRevenueTotal(revSum);
        setUnconfirmedCount(uncCount);
      }

      let recentQuery = supabase
        .from('transactions')
        .select('id, date, store, description, amount, tx_type, kamoku, confirmed')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      if (owner !== 'all') {
        recentQuery = recentQuery.eq('owner', owner);
      }

      const { data: recentData } = await recentQuery;
      setRecentTx((recentData as TransactionRow[]) || []);

      // プロジェクト取得
      const { data: pjData } = await supabase.from('projects').select('*').order('name');
      setProjects((pjData as Project[]) || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, year, getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  const expenseKamoku = Object.entries(KAMOKU)
    .filter(([, v]) => v.type === 'expense')
    .map(([id, v]) => ({ id, name: v.name }));

  // サマリーラベル
  const summaryLabel = (() => {
    if (summaryMode === 'single') return `${year}年${selectedMonth}月`;
    if (summaryMode === 'ytd') return `${year}年1月〜${selectedMonth}月`;
    if (rangeFromYear === rangeToYear) return `${rangeFromYear}年${rangeFrom}月〜${rangeTo}月`;
    return `${rangeFromYear}年${rangeFrom}月〜${rangeToYear}年${rangeTo}月`;
  })();

  const handleManualSave = async () => {
    if (!manualForm.amount || !manualForm.date) {
      setManualError('日付と金額は必須です');
      return;
    }
    if (manualForm.kamoku === 'travel' && (!transportData.from_location || !transportData.to_location || !transportData.carrier)) {
      setManualError('交通費の出発地・到着地・利用会社は必須です');
      return;
    }
    if (manualForm.kamoku === 'entertainment' && !entertainmentData.guest_name) {
      setManualError('接待交際費の相手先名は必須です');
      return;
    }
    if (allocRows.length > 0) {
      const total = allocRows.reduce((s, r) => s + r.percent, 0);
      if (total !== 100) { setManualError('事業割り当ての合計が100%になるようにしてください'); return; }
      if (allocRows.some(r => !r.division_id)) { setManualError('事業を選択してください'); return; }
    }
    if (!supabase) return;

    setManualSaving(true);
    setManualError(null);

    // 接待交際費の場合、descriptionを構造化
    let finalDescription = manualForm.description || null;
    if (manualForm.kamoku === 'entertainment') {
      finalDescription = entertainmentToDescription(entertainmentData, manualForm.description);
    }

    try {
      const { data: inserted, error: dbErr } = await supabase
        .from('transactions')
        .insert({
          tx_type: 'expense',
          date: manualForm.date,
          amount: parseInt(manualForm.amount.replace(/,/g, '')) || 0,
          store: manualForm.store || null,
          kamoku: manualForm.kamoku,
          division: 'general',
          owner: manualForm.owner,
          description: finalDescription,
          source: 'manual',
          confirmed: true,
        } as any)
        .select('id')
        .single();
      if (dbErr) throw dbErr;

      if (manualForm.kamoku === 'travel' && inserted) {
        await saveTransportDetails((inserted as any).id, transportData);
      }

      // allocation保存（事業割り当てがある場合）
      if (allocRows.length > 0 && inserted) {
        const txAmount = parseInt(manualForm.amount.replace(/,/g, '')) || 0;
        const inserts = allocRows.map(r => ({
          transaction_id: (inserted as any).id,
          division_id: r.division_id,
          project_id: r.project_id || null,
          percent: r.percent,
          amount: Math.round(txAmount * r.percent / 100),
        }));
        await supabase.from('transaction_allocations').insert(inserts);
      }

      setManualSuccess(true);
      if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);

      setTimeout(() => {
        setManualForm({
          date: new Date().toISOString().split('T')[0],
          amount: '',
          store: '',
          kamoku: 'misc',
          owner: owner === 'all' ? 'tomo' : owner,
          description: '',
        });
        setTransportData({ ...EMPTY_TRANSPORT });
        setEntertainmentData({ ...EMPTY_ENTERTAINMENT });
        setAllocRows([]);
        setManualSuccess(false);
      }, 1500);

      fetchData();
    } catch (err) {
      console.error('Manual save error:', err);
      setManualError('保存に失敗しました');
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* ── サマリー ── */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {/* モード切替 */}
          <div className="flex bg-[#F5F5F3] rounded-lg p-0.5 mb-4">
            {([
              { key: 'single', label: '単月' },
              { key: 'ytd', label: '累計' },
              { key: 'range', label: '期間' },
            ] as const).map((m) => (
              <button
                key={m.key}
                onClick={() => setSummaryMode(m.key)}
                className={`flex-1 py-1.5 text-xs rounded-md transition-all ${
                  summaryMode === m.key
                    ? 'bg-white text-[#1a1a1a] shadow-sm font-medium'
                    : 'text-[#999]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* 月選択 */}
          <div className="flex items-center gap-2 mb-4">
            {summaryMode === 'range' ? (
              <>
                <select
                  value={rangeFromYear}
                  onChange={(e) => setRangeFromYear(e.target.value)}
                  className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none font-['Saira_Condensed']"
                >
                  {Array.from({ length: 5 }, (_, i) => parseInt(year) - 2 + i).map(y => (
                    <option key={y} value={String(y)}>{y}年</option>
                  ))}
                </select>
                <select
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(parseInt(e.target.value))}
                  className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none font-['Saira_Condensed']"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <span className="text-xs text-[#999]">〜</span>
                <select
                  value={rangeToYear}
                  onChange={(e) => setRangeToYear(e.target.value)}
                  className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none font-['Saira_Condensed']"
                >
                  {Array.from({ length: 5 }, (_, i) => parseInt(year) - 2 + i).map(y => (
                    <option key={y} value={String(y)}>{y}年</option>
                  ))}
                </select>
                <select
                  value={rangeTo}
                  onChange={(e) => setRangeTo(parseInt(e.target.value))}
                  className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none font-['Saira_Condensed']"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </>
            ) : (
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-2 py-1 bg-[#F5F5F3] rounded-lg text-xs border-0 outline-none font-['Saira_Condensed']"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            )}
            <span className="text-xs text-[#999] ml-1">
              {summaryMode === 'ytd' && `(1月〜${selectedMonth}月)`}
            </span>
          </div>

          {loading ? (
            <div className="h-20 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#D4A03A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#999]">{summaryLabel}の経費</span>
                  <span className="font-['Saira_Condensed'] text-2xl text-[#1a1a1a] tabular-nums">
                    {formatAmount(expenseTotal)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[#999]">{summaryLabel}の売上</span>
                  <span className="font-['Saira_Condensed'] text-2xl text-[#1B4D3E] tabular-nums">
                    {formatAmount(revenueTotal)}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100">
                {unconfirmedCount === 0 ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1B4D3E]" />
                    <span className="text-sm text-[#1B4D3E]">問題なし</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#D4A03A]" />
                    <span className="text-sm text-[#D4A03A]">
                      確認待ち {unconfirmedCount}件
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── 入力モード切替 + 入力エリア ── */}
        <div>
          <div className="flex bg-white rounded-t-2xl overflow-hidden" style={{ boxShadow: '0 -2px 10px rgba(0,0,0,0.02)' }}>
            <button
              onClick={() => setInputMode('camera')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs transition-colors ${
                inputMode === 'camera'
                  ? 'text-[#1a1a1a] font-medium border-b-2 border-[#1a1a1a]'
                  : 'text-[#999] border-b-2 border-transparent'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              撮影
            </button>
            <button
              onClick={() => setInputMode('manual')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs transition-colors ${
                inputMode === 'manual'
                  ? 'text-[#1a1a1a] font-medium border-b-2 border-[#1a1a1a]'
                  : 'text-[#999] border-b-2 border-transparent'
              }`}
            >
              <PenLine className="w-3.5 h-3.5" />
              手入力
            </button>
          </div>

          {inputMode === 'camera' && (
            <Uploader onUploadComplete={fetchData} />
          )}

          {inputMode === 'manual' && (
            <div className="bg-white rounded-b-2xl p-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
              {manualSuccess ? (
                <div className="flex flex-col items-center py-6">
                  <CheckCircle2 className="w-10 h-10 text-[#1B4D3E] mb-2" />
                  <p className="text-sm text-[#1B4D3E] font-medium">登録完了</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#999] block mb-1">日付</label>
                    <input
                      type="date"
                      value={manualForm.date}
                      onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#999] block mb-1">金額（税込）</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={manualForm.amount ? Number(manualForm.amount.replace(/,/g, '')).toLocaleString() : ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/,/g, '');
                        if (/^\d*$/.test(v)) setManualForm({ ...manualForm, amount: v });
                      }}
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                      placeholder="15,300"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#999] block mb-1">取引先</label>
                    <input
                      type="text"
                      value={manualForm.store}
                      onChange={(e) => setManualForm({ ...manualForm, store: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                      placeholder="スターバックス"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#999] block mb-1">勘定科目</label>
                    <select
                      value={manualForm.kamoku}
                      onChange={(e) => setManualForm({ ...manualForm, kamoku: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                    >
                      {expenseKamoku.map((k) => (
                        <option key={k.id} value={k.id}>{k.name}</option>
                      ))}
                    </select>
                  </div>
                  {manualForm.kamoku === 'travel' && (
                    <TransportFields data={transportData} onChange={setTransportData} />
                  )}
                  {manualForm.kamoku === 'entertainment' && (
                    <EntertainmentFields data={entertainmentData} onChange={setEntertainmentData} />
                  )}
                  <div>
                    <label className="text-xs text-[#999] block mb-1">担当者</label>
                    <select
                      value={manualForm.owner}
                      onChange={(e) => setManualForm({ ...manualForm, owner: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                    >
                      <option value="tomo">トモ</option>
                      <option value="toshiki">トシキ</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[#999] block mb-1">メモ</label>
                    <input
                      type="text"
                      value={manualForm.description}
                      onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                      placeholder="任意"
                    />
                  </div>
                  {manualError && <p className="text-xs text-[#C23728]">{manualError}</p>}

                  {/* 事業・PJ割り当て（複数行按分） */}
                  <div className="pt-2 border-t border-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-[#999]">事業・PJ割り当て（任意）</label>
                      {allocRows.length === 0 && (
                        <button onClick={() => setAllocRows([{ division_id: '', project_id: '', percent: 100 }])}
                          className="flex items-center gap-1 text-[10px] text-[#D4A03A] hover:underline">
                          <Plus className="w-3 h-3" />追加
                        </button>
                      )}
                    </div>
                    {allocRows.length > 0 ? (
                      <div className="space-y-2">
                        {allocRows.map((row, idx) => {
                          const filteredPJ = row.division_id ? projects.filter(p => p.division === row.division_id && p.status !== 'completed') : [];
                          return (
                            <div key={idx} className="flex items-center gap-1.5">
                              <select value={row.division_id}
                                onChange={e => setAllocRows(prev => prev.map((r, i) => i === idx ? { ...r, division_id: e.target.value, project_id: '' } : r))}
                                className="px-2 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none flex-1">
                                <option value="">事業</option>
                                {Object.entries(DIVISIONS).filter(([id]) => id !== 'general').map(([id, v]) => (
                                  <option key={id} value={id}>{v.name}</option>
                                ))}
                              </select>
                              <select value={row.project_id}
                                onChange={e => setAllocRows(prev => prev.map((r, i) => i === idx ? { ...r, project_id: e.target.value } : r))}
                                className="px-2 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none flex-1 truncate">
                                <option value="">PJ</option>
                                {filteredPJ.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <input type="number" value={row.percent}
                                onChange={e => setAllocRows(prev => prev.map((r, i) => i === idx ? { ...r, percent: parseInt(e.target.value, 10) || 0 } : r))}
                                className="w-12 px-1.5 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none text-right font-['Saira_Condensed'] tabular-nums"
                                min={0} max={100} />
                              <span className="text-[10px] text-[#999]">%</span>
                              <button onClick={() => setAllocRows(prev => prev.filter((_, i) => i !== idx))}
                                className="text-[#C23728]/60 hover:text-[#C23728] p-0.5">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between pt-1">
                          <button onClick={() => setAllocRows(prev => [...prev, { division_id: '', project_id: '', percent: 0 }])}
                            className="flex items-center gap-1 text-[10px] text-[#D4A03A] hover:underline">
                            <Plus className="w-3 h-3" />行を追加
                          </button>
                          <span className={`text-[10px] font-['Saira_Condensed'] tabular-nums ${allocRows.reduce((s, r) => s + r.percent, 0) === 100 ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>
                            合計 {allocRows.reduce((s, r) => s + r.percent, 0)}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#999]">後から経営ページでも割り当て・変更できます</p>
                    )}
                  </div>

                  <button
                    onClick={handleManualSave}
                    disabled={manualSaving || !manualForm.amount || !manualForm.date}
                    className="w-full py-3 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium
                      hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {manualSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      '登録する'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 最近の取引 ── */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <h2 className="text-xs text-[#999] mb-3">最近の取引</h2>

          {loading ? (
            <div className="h-20 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-[#D4A03A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : recentTx.length === 0 ? (
            <p className="text-sm text-[#ccc] py-4 text-center">取引がありません</p>
          ) : (
            <div className="space-y-0">
              {recentTx.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-['Saira_Condensed'] text-xs text-[#999] w-10 shrink-0 tabular-nums">
                      {formatDate(tx.date)}
                    </span>
                    <span className="text-sm text-[#1a1a1a] truncate">
                      {tx.store || tx.description || KAMOKU[tx.kamoku as keyof typeof KAMOKU]?.name || '—'}
                    </span>
                  </div>
                  <span
                    className={`font-['Saira_Condensed'] text-sm tabular-nums shrink-0 ml-3 ${
                      tx.tx_type === 'revenue' ? 'text-[#1B4D3E]' : 'text-[#1a1a1a]'
                    }`}
                  >
                    {tx.tx_type === 'revenue' ? '+' : ''}{formatAmount(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Link
            href={`/expenses?owner=${owner}&year=${year}`}
            className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-gray-100 text-xs text-[#999] hover:text-[#D4A03A] transition-colors"
          >
            経費ページで全て見る
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
