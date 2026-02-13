'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/Header';
import CopyButton from '@/components/CopyButton';
import { supabase, Transaction, AnbunSetting } from '@/lib/supabase';
import { COLORS, KAMOKU, formatYen, getKamoku } from '@/lib/constants';

export default function ReportPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [anbunSettings, setAnbunSettings] = useState<AnbunSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [txRes, anbunRes] = await Promise.all([
        supabase.from('transactions').select('*'),
        supabase.from('anbun_settings').select('*'),
      ]);
      if (txRes.data) setTransactions(txRes.data);
      if (anbunRes.data) setAnbunSettings(anbunRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('komu10_user='));
    if (userCookie) {
      const user = userCookie.split('=')[1];
      if (user === 'all' || user === 'tomo' || user === 'toshiki') setCurrentUser(user);
    }
  }, []);

  const handleUserChange = (user: string) => {
    setCurrentUser(user);
    document.cookie = `komu10_user=${user}; path=/; max-age=31536000`;
  };

  // 按分比率を取得
  const getAnbunRatio = (kamokuId: string) => {
    const setting = anbunSettings.find(a => a.kamoku === kamokuId && a.owner === currentUser);
    return setting ? setting.ratio / 100 : 1;
  };

  // 科目別集計（按分適用後）
  const kamokuTotals = useMemo(() => {
    const totals: { [kamokuId: string]: { total: number; afterAnbun: number } } = {};
    
    KAMOKU.forEach(k => {
      totals[k.id] = { total: 0, afterAnbun: 0 };
    });

    transactions
      .filter(tx => tx.date.startsWith(String(selectedYear)))
      .forEach(tx => {
        if (totals[tx.kamoku]) {
          totals[tx.kamoku].total += tx.amount;
          const ratio = getAnbunRatio(tx.kamoku);
          totals[tx.kamoku].afterAnbun += Math.round(tx.amount * ratio);
        }
      });

    return totals;
  }, [transactions, selectedYear, currentUser, anbunSettings]);

  // 売上・経費合計
  const totalRevenue = Object.entries(kamokuTotals)
    .filter(([id]) => getKamoku(id)?.type === 'revenue')
    .reduce((sum, [, v]) => sum + v.afterAnbun, 0);

  const totalExpense = Object.entries(kamokuTotals)
    .filter(([id]) => getKamoku(id)?.type === 'expense')
    .reduce((sum, [, v]) => sum + v.afterAnbun, 0);

  const profit = totalRevenue - totalExpense;

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div></div>;

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>申告レポート</h1>
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
            E-TAXに転記する数字のサマリーです。下の科目別合計をE-TAX画面に入力してください（17科目で約15分）。
          </p>
        </div>

        {/* 年度選択 */}
        <div className="card mb-6">
          <div className="flex items-center gap-3">
            <select className="input select w-32" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <span className="text-sm" style={{ color: COLORS.textSecondary }}>確定申告用（1月〜12月）</span>
          </div>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card" style={{ borderLeft: `3px solid ${COLORS.gold}` }}>
            <div className="text-xs" style={{ color: COLORS.textMuted }}>売上合計</div>
            <div className="font-number text-xl" style={{ color: COLORS.gold }}>{formatYen(totalRevenue)}</div>
            <CopyButton text={String(totalRevenue)} />
          </div>
          <div className="card" style={{ borderLeft: `3px solid ${COLORS.crimson}` }}>
            <div className="text-xs" style={{ color: COLORS.textMuted }}>経費合計（按分後）</div>
            <div className="font-number text-xl" style={{ color: COLORS.crimson }}>{formatYen(totalExpense)}</div>
            <CopyButton text={String(totalExpense)} />
          </div>
          <div className="card" style={{ borderLeft: `3px solid ${profit >= 0 ? COLORS.green : COLORS.crimson}` }}>
            <div className="text-xs" style={{ color: COLORS.textMuted }}>所得（売上−経費）</div>
            <div className="font-number text-xl" style={{ color: profit >= 0 ? COLORS.green : COLORS.crimson }}>{formatYen(profit)}</div>
            <CopyButton text={String(profit)} />
          </div>
        </div>

        {/* 売上科目 */}
        <div className="card mb-6">
          <div className="text-sm font-medium mb-3" style={{ color: COLORS.gold }}>売上</div>
          <div className="space-y-2">
            {KAMOKU.filter(k => k.type === 'revenue').map(k => {
              const data = kamokuTotals[k.id];
              if (data.total === 0) return null;
              return (
                <div key={k.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: COLORS.border }}>
                  <span className="text-sm">{k.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-number" style={{ color: COLORS.textPrimary }}>{formatYen(data.afterAnbun)}</span>
                    <CopyButton text={String(data.afterAnbun)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 経費科目 */}
        <div className="card">
          <div className="text-sm font-medium mb-3" style={{ color: COLORS.crimson }}>経費（按分適用後）</div>
          <div className="space-y-2">
            {KAMOKU.filter(k => k.type === 'expense').map(k => {
              const data = kamokuTotals[k.id];
              if (data.total === 0) return null;
              const ratio = getAnbunRatio(k.id);
              const hasAnbun = ratio < 1;
              return (
                <div key={k.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: COLORS.border }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{k.name}</span>
                    {hasAnbun && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100" style={{ color: COLORS.textMuted }}>
                        按分{Math.round(ratio * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {hasAnbun && (
                      <span className="text-xs" style={{ color: COLORS.textMuted }}>
                        {formatYen(data.total)} →
                      </span>
                    )}
                    <span className="font-number" style={{ color: COLORS.textPrimary }}>{formatYen(data.afterAnbun)}</span>
                    <CopyButton text={String(data.afterAnbun)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 注意事項 */}
        <div className="mt-6 p-4 rounded-lg" style={{ background: 'rgba(212,160,58,0.1)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: COLORS.gold }}>💡 E-TAX入力のポイント</div>
          <ul className="text-xs space-y-1" style={{ color: COLORS.textSecondary }}>
            <li>• 各科目の金額をコピーして、E-TAXの該当欄に貼り付けてください</li>
            <li>• 按分が適用されている科目は按分後の金額を入力してください</li>
            <li>• 減価償却費は固定資産台帳を確認してください</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
