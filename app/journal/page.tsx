'use client';

import { useState, useEffect, useMemo } from 'react';
import Header from '@/components/Header';
import Modal from '@/components/Modal';
import { supabase, Transaction, Project } from '@/lib/supabase';
import { COLORS, formatYen, getKamoku, getDivision, getUser } from '@/lib/constants';

// 仕訳マッピング（借方/貸方）
function getJournalEntry(tx: Transaction) {
  const kamoku = getKamoku(tx.kamoku);
  if (tx.tx_type === 'revenue') {
    return { debit: '現金預金', debitAmount: tx.amount, credit: kamoku?.name || tx.kamoku, creditAmount: tx.amount };
  } else {
    return { debit: kamoku?.name || tx.kamoku, debitAmount: tx.amount, credit: '現金預金', creditAmount: tx.amount };
  }
}

export default function JournalPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [txRes, pjRes] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: true }),
        supabase.from('projects').select('*'),
      ]);
      if (txRes.data) setTransactions(txRes.data);
      if (pjRes.data) setProjects(pjRes.data);
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

  // 年度・月でフィルター
  const filteredTx = useMemo(() => {
    return transactions.filter(tx => {
      if (!tx.date.startsWith(String(selectedYear))) return false;
      if (selectedMonth && !tx.date.startsWith(`${selectedYear}-${selectedMonth}`)) return false;
      return true;
    });
  }, [transactions, selectedYear, selectedMonth]);

  // 月別集計
  const monthlyTotals = useMemo(() => {
    const totals: { [month: string]: { debit: number; credit: number } } = {};
    for (let m = 1; m <= 12; m++) {
      const key = String(m).padStart(2, '0');
      totals[key] = { debit: 0, credit: 0 };
    }
    transactions.filter(tx => tx.date.startsWith(String(selectedYear))).forEach(tx => {
      const month = tx.date.substring(5, 7);
      if (totals[month]) {
        totals[month].debit += tx.amount;
        totals[month].credit += tx.amount;
      }
    });
    return totals;
  }, [transactions, selectedYear]);

  // 借方・貸方合計
  const totalDebit = filteredTx.reduce((sum, tx) => sum + tx.amount, 0);
  const totalCredit = filteredTx.reduce((sum, tx) => sum + tx.amount, 0);

  // CSV出力
  const handleExportCSV = () => {
    const headers = ['日付', '借方科目', '借方金額', '貸方科目', '貸方金額', '取引先', '内容', 'プロジェクト'];
    const rows = filteredTx.map(tx => {
      const entry = getJournalEntry(tx);
      const project = projects.find(p => p.id === tx.project_id);
      return [tx.date, entry.debit, entry.debitAmount, entry.credit, entry.creditAmount, tx.store || '', tx.description || '', project?.name || ''].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `仕訳帳_${selectedYear}${selectedMonth ? '-' + selectedMonth : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // プロジェクト表示用ヘルパー
  const getProjectDisplay = (projectId?: string) => {
    if (!projectId) return null;
    const project = projects.find(p => p.id === projectId);
    if (!project) return null;
    const div = getDivision(project.division);
    const seqNo = project.seq_no ? `PJ-${String(project.seq_no).padStart(3, '0')}` : '';
    const divNo = project.external_id && div?.prefix ? `${div.prefix}-${String(project.external_id).padStart(3, '0')}` : '';
    return { project, div, seqNo, divNo };
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div></div>;

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>仕訳帳</h1>
            <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
              取引から自動生成された複式簿記の仕訳帳です。CSV出力してExcelで確認・税理士に提出できます。
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleExportCSV}>
            CSV出力
          </button>
        </div>

        {/* フィルター */}
        <div className="card mb-6">
          <div className="flex items-center gap-3">
            <select className="input select w-32" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select className="input select w-32" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              <option value="">全月</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => <option key={m} value={m}>{parseInt(m)}月</option>)}
            </select>
            <div className="flex-1" />
            <div className="text-sm" style={{ color: COLORS.textSecondary }}>
              {filteredTx.length}件の仕訳
            </div>
          </div>
        </div>

        {/* 月別集計 */}
        <div className="card mb-6">
          <div className="text-xs font-medium mb-3" style={{ color: COLORS.textMuted }}>月別集計</div>
          <div className="grid grid-cols-6 gap-2">
            {Object.entries(monthlyTotals).map(([month, totals]) => (
              <div key={month} className={`p-2 rounded cursor-pointer transition-colors ${selectedMonth === month ? 'bg-gray-100' : 'hover:bg-gray-50'}`} onClick={() => setSelectedMonth(selectedMonth === month ? '' : month)}>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>{parseInt(month)}月</div>
                <div className="font-number text-sm" style={{ color: COLORS.textPrimary }}>{formatYen(totals.debit)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 借方・貸方バランス */}
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div className="text-xs" style={{ color: COLORS.textMuted }}>借方・貸方バランス確認</div>
            <div className={`text-xs px-2 py-1 rounded ${totalDebit === totalCredit ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              {totalDebit === totalCredit ? '✓ バランス一致' : '⚠ 不一致'}
            </div>
          </div>
          <div className="flex items-center gap-8 mt-3">
            <div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>借方合計</div>
              <div className="font-number text-lg" style={{ color: COLORS.navy }}>{formatYen(totalDebit)}</div>
            </div>
            <div className="text-2xl" style={{ color: COLORS.textMuted }}>=</div>
            <div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>貸方合計</div>
              <div className="font-number text-lg" style={{ color: COLORS.teal }}>{formatYen(totalCredit)}</div>
            </div>
          </div>
        </div>

        {/* 仕訳帳テーブル */}
        <div className="card overflow-hidden p-0">
          <table className="table">
            <thead>
              <tr>
                <th>日付</th>
                <th>借方科目</th>
                <th className="text-right">借方金額</th>
                <th>貸方科目</th>
                <th className="text-right">貸方金額</th>
                <th>取引先</th>
                <th>内容</th>
                <th>プロジェクト</th>
              </tr>
            </thead>
            <tbody>
              {filteredTx.map(tx => {
                const entry = getJournalEntry(tx);
                const pjDisplay = getProjectDisplay(tx.project_id);
                return (
                  <tr 
                    key={tx.id} 
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <td className="font-number whitespace-nowrap">{tx.date}</td>
                    <td className="text-sm">{entry.debit}</td>
                    <td className="text-right font-number" style={{ color: COLORS.navy }}>{formatYen(entry.debitAmount)}</td>
                    <td className="text-sm">{entry.credit}</td>
                    <td className="text-right font-number" style={{ color: COLORS.teal }}>{formatYen(entry.creditAmount)}</td>
                    <td className="text-sm truncate max-w-24" style={{ color: COLORS.textSecondary }}>{tx.store || '—'}</td>
                    <td className="text-sm truncate max-w-32" style={{ color: COLORS.textSecondary }}>{tx.description || '—'}</td>
                    <td className="text-xs max-w-32">
                      {pjDisplay ? (
                        <div>
                          <div className="flex items-center gap-0.5 mb-0.5">
                            {pjDisplay.seqNo && (
                              <span className="font-mono px-1 rounded" style={{ background: 'rgba(10,10,11,0.05)', color: COLORS.textSecondary, fontSize: '9px' }}>
                                {pjDisplay.seqNo}
                              </span>
                            )}
                            {pjDisplay.divNo && (
                              <span className="font-mono px-1 rounded" style={{ background: `${pjDisplay.div?.color}15`, color: pjDisplay.div?.color, fontSize: '9px' }}>
                                {pjDisplay.divNo}
                              </span>
                            )}
                          </div>
                          <span className="truncate block" style={{ color: COLORS.textMuted }}>{pjDisplay.project.name}</span>
                        </div>
                      ) : (
                        <span style={{ color: COLORS.textMuted }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTx.length === 0 && <div className="text-center py-12" style={{ color: COLORS.textMuted }}>仕訳データがありません</div>}
        </div>
      </main>

      {/* 明細モーダル */}
      <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="取引明細">
        {selectedTx && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>日付</div>
                <div className="text-sm font-number">{selectedTx.date}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>種別</div>
                <div className="text-sm">
                  <span className={`badge ${selectedTx.tx_type === 'revenue' ? 'badge-revenue' : 'badge-expense'}`}>
                    {selectedTx.tx_type === 'revenue' ? '売上' : '経費'}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>金額</div>
                <div className="text-lg font-number" style={{ color: selectedTx.tx_type === 'revenue' ? COLORS.gold : COLORS.crimson }}>
                  {formatYen(selectedTx.amount)}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>勘定科目</div>
                <div className="text-sm">{getKamoku(selectedTx.kamoku)?.name || selectedTx.kamoku}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>部門</div>
                <div className="text-sm flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: getDivision(selectedTx.division)?.color }} />
                  {getDivision(selectedTx.division)?.name || selectedTx.division}
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>担当者</div>
                <div className="text-sm">{getUser(selectedTx.owner)?.name || selectedTx.owner}</div>
              </div>
            </div>
            <div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>取引先</div>
              <div className="text-sm">{selectedTx.store || '—'}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: COLORS.textMuted }}>内容</div>
              <div className="text-sm">{selectedTx.description || '—'}</div>
            </div>
            {selectedTx.memo && (
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>メモ</div>
                <div className="text-sm">{selectedTx.memo}</div>
              </div>
            )}
            {selectedTx.project_id && (
              <div>
                <div className="text-xs" style={{ color: COLORS.textMuted }}>プロジェクト</div>
                {(() => {
                  const pjDisplay = getProjectDisplay(selectedTx.project_id);
                  if (!pjDisplay) return <div className="text-sm">—</div>;
                  return (
                    <div className="text-sm">
                      <div className="flex items-center gap-1 mb-1">
                        {pjDisplay.seqNo && (
                          <span className="font-mono px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(10,10,11,0.05)', color: COLORS.textSecondary }}>
                            {pjDisplay.seqNo}
                          </span>
                        )}
                        {pjDisplay.divNo && (
                          <span className="font-mono px-1.5 py-0.5 rounded text-xs" style={{ background: `${pjDisplay.div?.color}15`, color: pjDisplay.div?.color }}>
                            {pjDisplay.divNo}
                          </span>
                        )}
                      </div>
                      <div>{pjDisplay.project.name}</div>
                    </div>
                  );
                })()}
              </div>
            )}
            <div className="pt-4 border-t" style={{ borderColor: COLORS.border }}>
              <div className="text-xs mb-2" style={{ color: COLORS.textMuted }}>仕訳</div>
              <div className="flex items-center gap-4">
                <div className="flex-1 p-3 rounded" style={{ background: 'rgba(30,58,95,0.05)' }}>
                  <div className="text-xs" style={{ color: COLORS.textMuted }}>借方</div>
                  <div className="text-sm font-medium">{getJournalEntry(selectedTx).debit}</div>
                  <div className="font-number" style={{ color: COLORS.navy }}>{formatYen(selectedTx.amount)}</div>
                </div>
                <div className="flex-1 p-3 rounded" style={{ background: 'rgba(129,216,208,0.1)' }}>
                  <div className="text-xs" style={{ color: COLORS.textMuted }}>貸方</div>
                  <div className="text-sm font-medium">{getJournalEntry(selectedTx).credit}</div>
                  <div className="font-number" style={{ color: COLORS.teal }}>{formatYen(selectedTx.amount)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
