'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Modal from '@/components/Modal';
import TransactionForm from '@/components/TransactionForm';
import { supabase, Transaction, Project } from '@/lib/supabase';
import { COLORS, DIVISIONS, KAMOKU, formatYen, getDivision, getKamoku, getUser } from '@/lib/constants';

// CSVパース用
function parseCSV(text: string): string[][] {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
}

// 科目推定
function guessKamoku(store: string, description: string): string {
  const text = `${store} ${description}`.toLowerCase();
  if (text.includes('jr') || text.includes('新幹線') || text.includes('航空') || text.includes('ana') || text.includes('jal') || text.includes('タクシー') || text.includes('高速')) return 'travel';
  if (text.includes('amazon') || text.includes('ヨドバシ') || text.includes('ビック')) return 'equipment';
  if (text.includes('docomo') || text.includes('softbank') || text.includes('au') || text.includes('通信')) return 'communication';
  if (text.includes('adobe') || text.includes('artlist') || text.includes('サブスク') || text.includes('月額')) return 'subscription';
  if (text.includes('レンタカー') || text.includes('ガソリン') || text.includes('駐車')) return 'vehicle';
  if (text.includes('ホテル') || text.includes('旅館') || text.includes('宿泊')) return 'travel';
  if (text.includes('食事') || text.includes('レストラン') || text.includes('カフェ')) return 'entertainment';
  return 'misc';
}

interface CSVRow {
  date: string;
  store: string;
  amount: number;
  kamoku: string;
  division: string;
  selected: boolean;
}

function TransactionsContent() {
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    type: '',
    month: '',
    division: '',
    search: '',
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // CSVインポート用
  const [isCSVModalOpen, setIsCSVModalOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [txRes, pjRes] = await Promise.all([
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('projects').select('*'),
      ]);
      if (txRes.data) setTransactions(txRes.data);
      if (pjRes.data) setProjects(pjRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      type: searchParams.get('type') || '',
      month: searchParams.get('month') || '',
      division: searchParams.get('division') || '',
    }));
  }, [searchParams]);

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

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (filters.type && tx.tx_type !== filters.type) return false;
      if (filters.month && !tx.date.startsWith(filters.month)) return false;
      if (filters.division && tx.division !== filters.division) return false;
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchStore = tx.store?.toLowerCase().includes(search);
        const matchDesc = tx.description?.toLowerCase().includes(search);
        if (!matchStore && !matchDesc) return false;
      }
      return true;
    });
  }, [transactions, filters]);

  const handleAdd = () => { setEditingTransaction(undefined); setIsModalOpen(true); };
  const handleEdit = (tx: Transaction) => { setEditingTransaction(tx); setIsModalOpen(true); };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (!error) setTransactions(prev => prev.filter(t => t.id !== id));
    setDeleteConfirm(null);
  };

  const handleSubmit = async (data: Partial<Transaction>) => {
    try {
      // 空文字をnullに変換（UUID型のため）
      const cleanData = {
        ...data,
        project_id: data.project_id || null,
        receipt_url: data.receipt_url || null,
      };
      
      if (editingTransaction) {
        const { data: updated, error } = await supabase
          .from('transactions')
          .update({ ...cleanData, updated_at: new Date().toISOString() })
          .eq('id', editingTransaction.id)
          .select()
          .single();
        if (error) {
          console.error('Update error:', error);
          alert('更新エラー: ' + error.message);
          return;
        }
        if (updated) setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
      } else {
        const insertData = { ...cleanData, owner: currentUser === 'all' ? 'tomo' : currentUser };
        console.log('Inserting:', insertData);
        const { data: created, error } = await supabase
          .from('transactions')
          .insert([insertData])
          .select()
          .single();
        if (error) {
          console.error('Insert error:', error);
          alert('登録エラー: ' + error.message);
          return;
        }
        if (created) {
          console.log('Created:', created);
          setTransactions(prev => [created, ...prev]);
        }
      }
      setIsModalOpen(false);
      setEditingTransaction(undefined);
    } catch (e) {
      console.error('Unexpected error:', e);
      alert('予期しないエラーが発生しました');
    }
  };

  const clearFilters = () => {
    setFilters({ type: '', month: '', division: '', search: '' });
    window.history.replaceState({}, '', '/transactions');
  };

  const hasFilters = filters.type || filters.month || filters.division || filters.search;

  // CSVインポート処理
  const handleCSVSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      
      // ヘッダー行をスキップして処理
      const dataRows = rows.slice(1).filter(row => row.length >= 3);
      
      const parsed: CSVRow[] = dataRows.map(row => {
        // 楽天カード形式: 利用日,利用店名・商品名,利用者,支払方法,利用金額,支払手数料,支払総額
        // 三井住友形式: ご利用日,ご利用先など,ご利用金額
        // 汎用形式: 日付, 店名/内容, 金額
        let date = '', store = '', amount = 0;
        
        // 日付を探す
        for (const cell of row) {
          if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(cell)) {
            date = cell.replace(/\//g, '-');
            break;
          }
        }
        
        // 金額を探す（数字のみ、またはカンマ区切り）
        for (let i = row.length - 1; i >= 0; i--) {
          const num = parseInt(row[i].replace(/[,円￥]/g, ''));
          if (!isNaN(num) && num > 0) {
            amount = num;
            break;
          }
        }
        
        // 店名（日付と金額以外の最初のテキスト）
        for (const cell of row) {
          if (cell && cell !== date && !cell.match(/^[\d,円￥]+$/) && cell.length > 1) {
            store = cell;
            break;
          }
        }

        const kamoku = guessKamoku(store, '');
        
        return {
          date,
          store,
          amount,
          kamoku,
          division: 'general',
          selected: true,
        };
      }).filter(row => row.date && row.amount > 0);

      setCsvRows(parsed);
      setIsCSVModalOpen(true);
    };
    reader.readAsText(file, 'Shift_JIS'); // 日本語CSVはShift-JISが多い
    
    // input をリセット
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCSVImport = async () => {
    const selectedRows = csvRows.filter(r => r.selected);
    if (selectedRows.length === 0) return;

    setCsvImporting(true);
    try {
      const newTxs = selectedRows.map(row => ({
        tx_type: 'expense' as const,
        date: row.date,
        amount: row.amount,
        kamoku: row.kamoku,
        division: row.division,
        owner: currentUser === 'all' ? 'tomo' : currentUser,
        store: row.store,
        source: 'csv_cc',
      }));

      const { data, error } = await supabase
        .from('transactions')
        .insert(newTxs)
        .select();

      if (!error && data) {
        setTransactions(prev => [...data, ...prev]);
        setIsCSVModalOpen(false);
        setCsvRows([]);
      }
    } finally {
      setCsvImporting(false);
    }
  };

  const toggleAllCSV = (checked: boolean) => {
    setCsvRows(prev => prev.map(r => ({ ...r, selected: checked })));
  };

  const updateCSVRow = (index: number, field: keyof CSVRow, value: any) => {
    setCsvRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div>
    </div>;
  }

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>取引一覧</h1>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleCSVSelect}
              className="hidden"
            />
            <button 
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              CSVインポート
            </button>
            <button className="btn btn-primary" onClick={handleAdd}>+ 取引追加</button>
          </div>
        </div>

        <div className="card mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <select className="input select w-32" value={filters.type} onChange={e => setFilters(prev => ({ ...prev, type: e.target.value }))}>
              <option value="">すべて</option>
              <option value="revenue">売上</option>
              <option value="expense">経費</option>
            </select>
            <input type="month" className="input w-40" value={filters.month} onChange={e => setFilters(prev => ({ ...prev, month: e.target.value }))} />
            <select className="input select w-48" value={filters.division} onChange={e => setFilters(prev => ({ ...prev, division: e.target.value }))}>
              <option value="">全部門</option>
              {DIVISIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input type="text" className="input flex-1 min-w-48" placeholder="取引先・内容で検索..." value={filters.search} onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))} />
            {hasFilters && <button className="btn btn-ghost" onClick={clearFilters}>リセット</button>}
          </div>
          {hasFilters && <div className="mt-3 text-xs" style={{ color: COLORS.textMuted }}>{filteredTransactions.length}件の取引</div>}
        </div>

        <div className="card overflow-hidden p-0">
          <table className="table">
            <thead>
              <tr>
                <th>日付</th><th>種別</th><th>担当</th><th>部門</th><th>科目</th><th>取引先</th><th>内容</th><th className="text-right">金額</th><th>PJ</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map(tx => {
                const div = getDivision(tx.division);
                const kamoku = getKamoku(tx.kamoku);
                const owner = getUser(tx.owner);
                const project = projects.find(p => p.id === tx.project_id);
                return (
                  <tr key={tx.id}>
                    <td className="font-number whitespace-nowrap">{tx.date}</td>
                    <td><span className={`badge ${tx.tx_type === 'revenue' ? 'badge-revenue' : 'badge-expense'}`}>{tx.tx_type === 'revenue' ? '売上' : '経費'}</span></td>
                    <td className="text-sm">{owner?.name || tx.owner}</td>
                    <td><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{ background: div?.color || COLORS.sand }} /><span className="text-sm">{div?.abbr || tx.division}</span></div></td>
                    <td className="text-sm">{kamoku?.name || tx.kamoku}</td>
                    <td className="text-sm max-w-32 truncate">{tx.store || '—'}</td>
                    <td className="text-sm max-w-40 truncate">{tx.description || '—'}</td>
                    <td className="text-right"><span className="font-number" style={{ color: tx.tx_type === 'revenue' ? COLORS.gold : COLORS.crimson }}>{formatYen(tx.amount)}</span></td>
                    <td className="text-xs max-w-32" style={{ color: COLORS.textMuted }}>
                      {project ? (
                        <div>
                          <div className="flex items-center gap-0.5 mb-0.5">
                            {project.seq_no && (
                              <span className="font-mono px-1 rounded" style={{ background: 'rgba(10,10,11,0.05)', fontSize: '10px' }}>
                                PJ-{String(project.seq_no).padStart(3, '0')}
                              </span>
                            )}
                            {project.external_id && div && (
                              <span className="font-mono px-1 rounded" style={{ background: `${getDivision(project.division)?.color}15`, color: getDivision(project.division)?.color, fontSize: '10px' }}>
                                {getDivision(project.division)?.prefix}-{String(project.external_id).padStart(3, '0')}
                              </span>
                            )}
                          </div>
                          <span className="truncate block">{project.name}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button className="p-1 rounded hover:bg-gray-100" onClick={() => handleEdit(tx)} style={{ color: COLORS.textMuted }}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </button>
                        <button className="p-1 rounded hover:bg-red-50" onClick={() => setDeleteConfirm(tx.id)} style={{ color: COLORS.crimson }}>
                          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && <div className="text-center py-12" style={{ color: COLORS.textMuted }}>取引がありません</div>}
        </div>
      </main>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingTransaction(undefined); }} title={editingTransaction ? '取引を編集' : '取引を追加'}>
        <TransactionForm transaction={editingTransaction} projects={projects} currentUser={currentUser} onSubmit={handleSubmit} onCancel={() => { setIsModalOpen(false); setEditingTransaction(undefined); }} />
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="取引を削除">
        <p className="text-sm mb-4" style={{ color: COLORS.textSecondary }}>この取引を削除しますか？この操作は取り消せません。</p>
        <div className="flex gap-2">
          <button className="btn flex-1" style={{ background: COLORS.crimson, color: 'white' }} onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>削除</button>
          <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>キャンセル</button>
        </div>
      </Modal>

      {/* CSVインポートモーダル */}
      <Modal isOpen={isCSVModalOpen} onClose={() => { setIsCSVModalOpen(false); setCsvRows([]); }} title="クレカCSVインポート">
        <div className="space-y-4">
          <p className="text-xs" style={{ color: COLORS.textMuted }}>
            CSVから{csvRows.length}件の取引を検出しました。科目・部門を確認して取り込んでください。
          </p>
          
          <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: COLORS.border }}>
            <input
              type="checkbox"
              checked={csvRows.every(r => r.selected)}
              onChange={e => toggleAllCSV(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs" style={{ color: COLORS.textMuted }}>すべて選択</span>
            <div className="flex-1" />
            <span className="text-xs" style={{ color: COLORS.textMuted }}>
              {csvRows.filter(r => r.selected).length}件選択中
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2">
            {csvRows.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded"
                style={{ background: row.selected ? 'rgba(27,77,62,0.05)' : 'transparent' }}
              >
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={e => updateCSVRow(i, 'selected', e.target.checked)}
                  className="w-4 h-4"
                />
                <div className="text-xs font-number w-24">{row.date}</div>
                <div className="text-xs flex-1 truncate">{row.store}</div>
                <div className="text-xs font-number w-20 text-right" style={{ color: COLORS.crimson }}>
                  {formatYen(row.amount)}
                </div>
                <select
                  className="input select text-xs py-1 w-28"
                  value={row.kamoku}
                  onChange={e => updateCSVRow(i, 'kamoku', e.target.value)}
                >
                  {KAMOKU.filter(k => k.type === 'expense').map(k => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
                <select
                  className="input select text-xs py-1 w-24"
                  value={row.division}
                  onChange={e => updateCSVRow(i, 'division', e.target.value)}
                >
                  {DIVISIONS.map(d => (
                    <option key={d.id} value={d.id}>{d.abbr}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              className="btn btn-primary flex-1"
              onClick={handleCSVImport}
              disabled={csvImporting || csvRows.filter(r => r.selected).length === 0}
            >
              {csvImporting ? 'インポート中...' : `${csvRows.filter(r => r.selected).length}件をインポート`}
            </button>
            <button className="btn btn-secondary" onClick={() => { setIsCSVModalOpen(false); setCsvRows([]); }}>
              キャンセル
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function TransactionsPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-sm" style={{ color: COLORS.textMuted }}>読み込み中...</div></div>}><TransactionsContent /></Suspense>;
}
