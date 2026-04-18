'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DIVISIONS, TRANSACTION_STATUS } from '@/types/database';
import type { Transaction, RevenueType, RevenueTypeDivision, ContractType, BusinessDomain, Project, Client } from '@/types/database';
import InvoiceTab from './InvoiceTab';

// ステータスバッジの色定義
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  forecast: { bg: 'bg-[#F5F5F3]', text: 'text-[#999]' },
  accrued:  { bg: 'bg-[#81D8D0]/10', text: 'text-[#1B4D3E]' },
  billed:   { bg: 'bg-[#D4A03A]/10', text: 'text-[#D4A03A]' },
  settled:  { bg: 'bg-[#1B4D3E]/10', text: 'text-[#1B4D3E]' },
};
import { Plus, Upload, Pencil, Trash2, Search, Loader2, X } from 'lucide-react';
import { usePeriodRange } from './HeaderControls';

// 売上で選択可能な事業
const DIVISION_OPTIONS = Object.entries(DIVISIONS).map(([id, v]) => ({
  id,
  name: v.name,
  label: v.label,
  color: v.color,
}));

export default function IncomeContent() {
  const { owner, startDate, endDate } = usePeriodRange();

  // タブ切り替え
  const [activeTab, setActiveTab] = useState<'sales' | 'invoices'>('sales');

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // マスタデータ（DBから取得）
  const [revenueTypes, setRevenueTypes] = useState<RevenueType[]>([]);
  const [revenueTypeDivisions, setRevenueTypeDivisions] = useState<RevenueTypeDivision[]>([]);
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [businessDomains, setBusinessDomains] = useState<BusinessDomain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // フィルター
  const [searchText, setSearchText] = useState('');

  // モーダル
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);

  // CSVインポート
  const [importing, setImporting] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── 収益タイプマスタ取得 ──
  const fetchRevenueTypes = useCallback(async () => {
    if (!supabase) return;
    try {
      const [rtRes, rtdRes, ctRes, bdRes, pjRes, clRes] = await Promise.all([
        supabase.from('revenue_types').select('*').order('sort_order'),
        supabase.from('revenue_type_divisions').select('*'),
        supabase.from('contract_types').select('*').order('sort_order'),
        supabase.from('business_domains').select('*').order('sort_order'),
        supabase.from('projects').select('*').order('name'),
        supabase.from('clients').select('*').order('name'),
      ]);
      if (rtRes.data) setRevenueTypes(rtRes.data as RevenueType[]);
      if (rtdRes.data) setRevenueTypeDivisions(rtdRes.data as RevenueTypeDivision[]);
      if (ctRes.data) setContractTypes(ctRes.data as ContractType[]);
      if (bdRes.data) setBusinessDomains(bdRes.data as BusinessDomain[]);
      if (pjRes.data) setProjects(pjRes.data as Project[]);
      if (clRes.data) setClients(clRes.data as Client[]);
    } catch (err) {
      console.error('Fetch master data error:', err);
    }
  }, []);

  // ── 取引データ取得 ──
  const fetchTransactions = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('tx_type', 'revenue')
        .gte('date', startDate)
        .lt('date', endDate)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (owner !== 'all') {
        query = query.eq('owner', owner);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions((data as Transaction[]) || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [owner, startDate, endDate]);

  useEffect(() => {
    fetchRevenueTypes();
    fetchTransactions();
  }, [fetchRevenueTypes, fetchTransactions]);

  // ── 収益タイプ名引き当て ──
  const getRevenueTypeName = (revenueTypeId: string | null): string => {
    if (!revenueTypeId) return '—';
    const rt = revenueTypes.find((r) => r.id === revenueTypeId);
    return rt ? rt.name : revenueTypeId;
  };

  // ── 契約区分名引き当て ──
  const getContractTypeName = (contractTypeId: string | null): string => {
    if (!contractTypeId) return '—';
    const ct = contractTypes.find((c) => c.id === contractTypeId);
    return ct ? ct.name : contractTypeId;
  };

  // ── プロジェクト名引き当て ──
  const getProjectName = (projectId: string | null): string => {
    if (!projectId) return '—';
    const pj = projects.find((p) => p.id === projectId);
    return pj ? pj.name : projectId;
  };

  // ── ステータス名引き当て ──
  const getStatusLabel = (status: string | null): string => {
    if (!status) return TRANSACTION_STATUS.settled;
    return TRANSACTION_STATUS[status as keyof typeof TRANSACTION_STATUS] || TRANSACTION_STATUS.settled;
  };
  const getEffectiveStatus = (status: string | null): string => status || 'settled';

  // ── フィルター適用 ──
  const filtered = transactions.filter((tx) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      const rtName = getRevenueTypeName(tx.revenue_type);
      const div = DIVISIONS[tx.division as keyof typeof DIVISIONS];
      const divName = div ? div.name : '';
      const haystack = `${tx.store || ''} ${tx.description || ''} ${rtName} ${divName}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // ── 集計 ──
  const revenueSum = filtered.reduce((s, t) => s + t.amount, 0);

  const formatAmount = (n: number) => `¥${n.toLocaleString()}`;

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  };

  // ── 削除 ──
  const handleDelete = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
      setDeleteTarget(null);
      fetchTransactions();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // ── CSVインポート（売上用） ──
  const handleCsvImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) {
        alert('CSVにデータがありません');
        return;
      }

      const imported: Array<{
        tx_type: string;
        date: string;
        amount: number;
        kamoku: string;
        division: string;
        owner: string;
        store: string;
        description: string;
        revenue_type: string | null;
        source: string;
        confirmed: boolean;
      }> = [];

      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
        if (vals.length < 3) continue;

        let date = '';
        let store = '';
        let amount = 0;

        vals.forEach((v) => {
          if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(v)) {
            date = v.replace(/\//g, '-');
          } else if (/^\d+$/.test(v) && Number(v) > 0 && !amount) {
            amount = Number(v);
          } else if (v.length > 1 && !date && !/^\d+$/.test(v) && !store) {
            store = v;
          }
        });

        if (date && amount > 0) {
          imported.push({
            tx_type: 'revenue',
            date,
            amount,
            kamoku: 'sales',
            division: 'general',
            owner: owner === 'all' ? 'tomo' : owner,
            store,
            description: '',
            revenue_type: null,
            source: 'csv',
            confirmed: true,
          });
        }
      }

      if (imported.length === 0) {
        alert('インポートできるデータがありませんでした');
        return;
      }

      if (!supabase) return;
      const { error } = await supabase.from('transactions').insert(imported);
      if (error) throw error;
      alert(`${imported.length}件の売上を取り込みました`);
      fetchTransactions();
    } catch (err) {
      console.error('CSV import error:', err);
      alert('CSVインポートに失敗しました');
    } finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── ヘッダー + タブ ── */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">売上</h1>
            <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">SALES</p>
          </div>
          <div className="flex items-center gap-1 bg-[#F5F5F3] rounded-lg p-0.5">
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'sales' ? 'bg-white text-[#1a1a1a] shadow-sm font-medium' : 'text-[#999] hover:text-[#666]'
              }`}
            >
              売上一覧
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'invoices' ? 'bg-white text-[#1a1a1a] shadow-sm font-medium' : 'text-[#999] hover:text-[#666]'
              }`}
            >
              請求書
            </button>
          </div>
        </div>

        {/* ── 請求書タブ ── */}
        {activeTab === 'invoices' ? (
          <InvoiceTab owner={owner} clients={clients} />
        ) : (
        <>

        {/* ── 売上タブ: ヘッダーアクション ── */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            売上入力
          </button>
          <label className="flex items-center gap-1.5 px-4 py-2 bg-white text-[#1a1a1a] rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors cursor-pointer border border-gray-200">
            <Upload className="w-3.5 h-3.5" />
            {importing ? 'インポート中...' : 'CSV'}
            <input
              ref={csvRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsvImport(f);
              }}
            />
          </label>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#999]" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="検索..."
              className="pl-8 pr-3 py-2 bg-white rounded-lg text-xs border border-gray-200 outline-none focus:ring-2 focus:ring-[#D4A03A]/50 w-40"
            />
          </div>
          <span className="text-xs text-[#999]">
            {filtered.length}件
          </span>
        </div>

        {/* ── テーブル ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-[#ccc]">
              売上がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">日付</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">ステータス</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">取引先</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">事業</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">契約区分</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">収益タイプ</th>
                    <th className="text-left px-4 py-3 text-xs text-[#999] font-normal">PJ</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal">金額</th>
                    <th className="text-right px-4 py-3 text-xs text-[#999] font-normal w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx) => {
                    const rtName = getRevenueTypeName(tx.revenue_type);
                    const ctName = getContractTypeName(tx.contract_type_id);
                    const pjName = getProjectName(tx.project_id);
                    const div = DIVISIONS[tx.division as keyof typeof DIVISIONS];
                    const effStatus = getEffectiveStatus(tx.status);
                    const statusStyle = STATUS_STYLES[effStatus] || STATUS_STYLES.settled;
                    return (
                      <tr key={tx.id} className="border-b border-gray-50 hover:bg-[#F5F5F3]/50 transition-colors">
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs text-[#999] tabular-nums">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {getStatusLabel(tx.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[#1a1a1a]">{tx.store || '—'}</div>
                          {tx.description && (
                            <div className="text-xs text-[#999] mt-0.5">{tx.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {div ? (
                            <span className="inline-flex items-center gap-1 text-xs text-[#6b6b6b]">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: div.color }}
                              />
                              {div.label}
                            </span>
                          ) : (
                            <span className="text-xs text-[#999]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#6b6b6b]">{ctName}</td>
                        <td className="px-4 py-3 text-xs text-[#6b6b6b]">{rtName}</td>
                        <td className="px-4 py-3 text-xs text-[#6b6b6b] max-w-[120px] truncate" title={pjName !== '—' ? pjName : undefined}>{pjName}</td>
                        <td className="px-4 py-3 text-right font-['Saira_Condensed'] tabular-nums text-[#1B4D3E]">
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditTarget(tx); setModalOpen(true); }}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors"
                              title="編集"
                            >
                              <Pencil className="w-3.5 h-3.5 text-[#999]" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(tx.id)}
                              className="p-1.5 hover:bg-[#C23728]/10 rounded-md transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── フッター集計 ── */}
          {!loading && filtered.length > 0 && (() => {
            const forecastSum = filtered.filter(t => getEffectiveStatus(t.status) === 'forecast').reduce((s, t) => s + t.amount, 0);
            const settledSum = filtered.filter(t => getEffectiveStatus(t.status) === 'settled').reduce((s, t) => s + t.amount, 0);
            const otherSum = revenueSum - forecastSum - settledSum;
            return (
              <div className="flex items-center justify-end gap-4 px-4 py-3 border-t border-gray-100 bg-[#F5F5F3]/50">
                {forecastSum > 0 && (
                  <div className="text-xs">
                    <span className="text-[#999]">見込み: </span>
                    <span className="font-['Saira_Condensed'] text-[#999] tabular-nums">{formatAmount(forecastSum)}</span>
                  </div>
                )}
                {otherSum > 0 && (
                  <div className="text-xs">
                    <span className="text-[#999]">確定未入金: </span>
                    <span className="font-['Saira_Condensed'] text-[#D4A03A] tabular-nums">{formatAmount(otherSum)}</span>
                  </div>
                )}
                {settledSum > 0 && (
                  <div className="text-xs">
                    <span className="text-[#999]">入金済: </span>
                    <span className="font-['Saira_Condensed'] text-[#1B4D3E] tabular-nums">{formatAmount(settledSum)}</span>
                  </div>
                )}
                <div className="text-xs">
                  <span className="text-[#999]">合計: </span>
                  <span className="font-['Saira_Condensed'] text-[#1B4D3E] tabular-nums font-medium">{formatAmount(revenueSum)}</span>
                </div>
              </div>
            );
          })()}
        </div>

      {/* ── 売上入力/編集モーダル ── */}
      {modalOpen && (
        <IncomeModal
          editData={editTarget}
          defaultOwner={owner === 'all' ? 'tomo' : owner}
          revenueTypes={revenueTypes}
          revenueTypeDivisions={revenueTypeDivisions}
          contractTypes={contractTypes}
          businessDomains={businessDomains}
          projects={projects}
          clients={clients}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
          onSaved={() => { setModalOpen(false); setEditTarget(null); fetchTransactions(); }}
        />
      )}

      {/* ── 削除確認 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この売上を削除しますか？</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e22] transition-colors"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
        </>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════
// 売上入力モーダル
// ═══════════════════════════════════════════

interface IncomeModalProps {
  editData: Transaction | null;
  defaultOwner: string;
  revenueTypes: RevenueType[];
  revenueTypeDivisions: RevenueTypeDivision[];
  contractTypes: ContractType[];
  businessDomains: BusinessDomain[];
  projects: Project[];
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}

function IncomeModal({ editData, defaultOwner, revenueTypes, revenueTypeDivisions, contractTypes, businessDomains, projects, clients, onClose, onSaved }: IncomeModalProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    date: editData?.date || new Date().toISOString().split('T')[0],
    amount: editData?.amount.toString() || '',
    store: editData?.store || '',
    client_id: editData?.client_id || '',
    division: editData?.division || '',
    project_id: editData?.project_id || '',
    project_name_input: editData?.project_id
      ? (projects.find(p => p.id === editData.project_id)?.name || '')
      : '',
    business_domain: (editData as any)?.business_domain || '',
    contract_type_id: editData?.contract_type_id || '',
    revenue_type: editData?.revenue_type || '',
    owner: editData?.owner || defaultOwner,
    description: editData?.description || '',
    status: editData?.status || 'forecast',
    expected_payment_date: editData?.expected_payment_date || '',
    actual_payment_date: editData?.actual_payment_date || '',
    issue_invoice: false, // 請求書発行トグル（新規作成時のみ有効）
  });

  // 案件名サジェスト用
  const [projectSuggestions, setProjectSuggestions] = useState<Project[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleChange = (field: string, value: any) => {
    setForm((prev) => {
      const next: any = { ...prev, [field]: value };
      // 取引先選択時、storeをclient.nameで自動セット（後方互換）
      if (field === 'client_id') {
        const selected = clients.find((c) => c.id === value);
        next.store = selected ? selected.name : '';
      }
      // 事業変更時、現在の収益タイプがその事業に紐づかなければリセット
      if (field === 'division') {
        if (next.revenue_type) {
          const available = getFilteredRevenueTypes(value);
          if (!available.find((rt) => rt.id === next.revenue_type)) {
            next.revenue_type = '';
          }
        }
      }
      // 案件名入力変更時、project_idをクリア（再紐付けはサジェスト選択 or 新規作成で行う）
      if (field === 'project_name_input') {
        next.project_id = '';
      }
      return next;
    });
  };

  // 案件名入力時のサジェスト更新
  const handleProjectNameInput = (value: string) => {
    handleChange('project_name_input', value);
    if (value.trim().length >= 1) {
      const matches = projects
        .filter(p => p.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 5);
      setProjectSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    } else {
      setProjectSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // サジェストクリック時：既存プロジェクトに紐付け
  const handleSelectSuggestion = (project: Project) => {
    setForm(prev => ({
      ...prev,
      project_id: project.id,
      project_name_input: project.name,
      // 既存PJの部門を自動セット（未設定なら）
      division: prev.division || project.division,
    }));
    setProjectSuggestions([]);
    setShowSuggestions(false);
  };

  // 選択事業に紐づく収益タイプを返す（未選択時は全件）
  const getFilteredRevenueTypes = (divisionId: string): RevenueType[] => {
    if (!divisionId) return revenueTypes;
    const linkedIds = new Set(
      revenueTypeDivisions
        .filter((rtd) => rtd.division === divisionId)
        .map((rtd) => rtd.revenue_type_id)
    );
    return revenueTypes.filter((rt) => linkedIds.has(rt.id));
  };

  const filteredRT = getFilteredRevenueTypes(form.division);

  // owner連動：選択ownerの取引先のみ表示
  const filteredClients = clients.filter((c) => c.owner === form.owner);

  const handleSave = async () => {
    if (!supabase) return;

    // 基本バリデーション
    if (!form.date || !form.amount) {
      setError('日付と金額は必須です');
      return;
    }

    const amount = parseInt(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError('金額は正の整数で入力してください');
      return;
    }

    // 3軸必須バリデーション（軸A：契約形態 / 軸B：事業領域 / 軸C：案件名）
    if (!form.contract_type_id) {
      setError('契約形態を選んでください');
      return;
    }
    if (!form.business_domain) {
      setError('事業領域を選んでください');
      return;
    }
    if (!form.project_name_input.trim()) {
      setError('案件名を入力してください');
      return;
    }

    // 部門（DIVISIONS）も必須
    if (!form.division) {
      setError('部門を選んでください');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 案件の解決：既存サジェスト選択済 or 完全一致既存 or 新規作成
      let projectId: string | null = form.project_id || null;
      const trimmedName = form.project_name_input.trim();

      if (!projectId) {
        // サジェストで選ばれていない場合、完全一致するprojectを探す
        const exactMatch = projects.find(p => p.name === trimmedName);
        if (exactMatch) {
          // 同名警告：既存案件として登録するか、別案件として新規作成するか
          const useExisting = confirm(
            `既存の案件「${exactMatch.name}」と同名です。\n\nOK: 既存案件として登録する\nキャンセル: 別案件として新規作成する`
          );
          if (useExisting) {
            projectId = exactMatch.id;
          } else {
            // 新規作成（別案件として）
            const { data: newProject, error: pjErr } = await supabase
              .from('projects')
              .insert({
                name: trimmedName,
                division: form.division,
                owner: form.owner,
                business_domain: form.business_domain,
                status: 'active',
              } as any)
              .select()
              .single();
            if (pjErr) throw pjErr;
            projectId = newProject?.id || null;
          }
        } else {
          // 新規作成
          const { data: newProject, error: pjErr } = await supabase
            .from('projects')
            .insert({
              name: trimmedName,
              division: form.division,
              owner: form.owner,
              business_domain: form.business_domain,
              status: 'active',
            } as any)
            .select()
            .single();
          if (pjErr) throw pjErr;
          projectId = newProject?.id || null;
        }
      }

      const record = {
        tx_type: 'revenue' as const,
        date: form.date,
        amount,
        kamoku: 'sales',
        division: form.division,
        owner: form.owner,
        store: form.store || null,
        description: form.description || null,
        revenue_type: form.revenue_type || null,
        contract_type_id: form.contract_type_id,
        business_domain: form.business_domain,
        project_id: projectId,
        client_id: form.client_id || null,
        source: 'manual',
        confirmed: true,
        status: form.status || 'forecast',
        accrual_date: form.date,
        expected_payment_date: form.expected_payment_date || null,
        actual_payment_date: form.actual_payment_date || null,
      };

      let savedTxId: string | null = null;

      if (editData) {
        const { error: err } = await supabase
          .from('transactions')
          .update(record)
          .eq('id', editData.id);
        if (err) throw err;
        savedTxId = editData.id;
      } else {
        const { data: saved, error: err } = await supabase
          .from('transactions')
          .insert(record)
          .select('id')
          .single();
        if (err) throw err;
        savedTxId = saved?.id || null;
      }

      // 請求書発行トグルONなら、請求書タブに遷移（新規作成時のみ）
      if (!editData && form.issue_invoice && savedTxId) {
        onSaved();
        router.push(`/income?tab=invoices&transaction_id=${savedTxId}`);
        return;
      }

      onSaved();
    } catch (err) {
      console.error('Save error:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            {editData ? '売上を編集' : '売上を入力'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {/* フォーム */}
        <div className="px-5 py-4 space-y-4">
          {/* ステータス */}
          <div>
            <label className="block text-xs text-[#999] mb-1">ステータス</label>
            <select
              value={form.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              {Object.entries(TRANSACTION_STATUS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* 計上日（PL） */}
          <div>
            <label className="block text-xs text-[#999] mb-1">計上日（納品日・役務提供日）</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          {/* 入金予定日 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">入金予定日（任意）</label>
            <input
              type="date"
              value={form.expected_payment_date}
              onChange={(e) => handleChange('expected_payment_date', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          {/* 入金日（settledの場合のみ表示） */}
          {form.status === 'settled' && (
            <div>
              <label className="block text-xs text-[#999] mb-1">入金日</label>
              <input
                type="date"
                value={form.actual_payment_date}
                onChange={(e) => handleChange('actual_payment_date', e.target.value)}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              />
            </div>
          )}

          {/* 金額 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">金額（円）</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => handleChange('amount', e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums"
            />
          </div>

          {/* 取引先 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">取引先</label>
            <select
              value={form.client_id}
              onChange={(e) => handleChange('client_id', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="">未選択（手入力）</option>
              {filteredClients.map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.name}{cl.payment_terms ? ` (${cl.payment_terms})` : ''}</option>
              ))}
            </select>
            {!form.client_id && (
              <input
                type="text"
                value={form.store}
                onChange={(e) => handleChange('store', e.target.value)}
                placeholder="例: 長崎市DMO"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 mt-2"
              />
            )}
          </div>

          {/* 事業（部門） */}
          <div>
            <label className="block text-xs text-[#999] mb-1">部門 <span className="text-[#C23728]">*</span></label>
            <select
              value={form.division}
              onChange={(e) => handleChange('division', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="">未選択</option>
              {DIVISION_OPTIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* ─── 分類（経営分析用）ディバイダ ─── */}
          <div className="pt-1">
            <div className="text-[10px] font-medium tracking-widest text-[#bbb] mb-2 border-t border-[#f0f0f0] pt-3">
              分類（経営分析用）
            </div>
          </div>

          {/* 契約形態（軸A・必須） */}
          <div>
            <label className="block text-xs text-[#999] mb-1">契約形態 <span className="text-[#C23728]">*</span></label>
            <select
              value={form.contract_type_id}
              onChange={(e) => handleChange('contract_type_id', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="">選択してください</option>
              {contractTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
          </div>

          {/* 事業領域（軸B・必須） */}
          <div>
            <label className="block text-xs text-[#999] mb-1">事業領域 <span className="text-[#C23728]">*</span></label>
            <select
              value={form.business_domain}
              onChange={(e) => handleChange('business_domain', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="">選択してください</option>
              {businessDomains.map((bd) => (
                <option key={bd.id} value={bd.id}>{bd.name}</option>
              ))}
            </select>
          </div>

          {/* 案件名（軸C・必須・サジェスト） */}
          <div className="relative">
            <label className="block text-xs text-[#999] mb-1">
              案件名 <span className="text-[#C23728]">*</span>
              {form.project_id && (
                <span className="ml-2 text-[10px] text-[#1B4D3E]">（既存案件に紐付け済）</span>
              )}
            </label>
            <input
              type="text"
              value={form.project_name_input}
              onChange={(e) => handleProjectNameInput(e.target.value)}
              onFocus={() => { if (projectSuggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
              placeholder="例: KKDAY_自治体DMO関連事業支援_2026Q2"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              autoComplete="off"
            />
            {showSuggestions && projectSuggestions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-[#f0f0f0] overflow-hidden">
                {projectSuggestions.map((pj) => (
                  <button
                    key={pj.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(pj); }}
                    className="w-full px-3 py-2 text-left text-xs text-[#333] hover:bg-[#F5F5F3] border-b border-[#f0f0f0] last:border-b-0"
                  >
                    {pj.name}
                    <span className="ml-2 text-[10px] text-[#999]">
                      {DIVISIONS[pj.division as keyof typeof DIVISIONS]?.label || pj.division}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!form.project_id && form.project_name_input.trim() && projectSuggestions.length === 0 && (
              <p className="text-[10px] text-[#bbb] mt-1">＋ 新しい案件として登録されます</p>
            )}
          </div>

          {/* 収益タイプ（任意・マスタ空時は無効化） */}
          <div>
            <label className="block text-xs text-[#999] mb-1">収益タイプ（任意）</label>
            <select
              value={form.revenue_type}
              onChange={(e) => handleChange('revenue_type', e.target.value)}
              disabled={revenueTypes.length === 0}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 disabled:opacity-50"
            >
              <option value="">{revenueTypes.length === 0 ? '（未登録）' : '未選択'}</option>
              {filteredRT.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          </div>

          {/* 担当者 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">担当者</label>
            <select
              value={form.owner}
              onChange={(e) => handleChange('owner', e.target.value)}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            >
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>

          {/* 摘要 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">摘要</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="例: DMO観光データ分析・3月分"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
            />
          </div>

          {/* 請求書発行トグル（新規作成時のみ） */}
          {!editData && (
            <div className="flex items-center gap-2 p-3 bg-[#F5F5F3] rounded-lg">
              <input
                type="checkbox"
                id="issue_invoice"
                checked={form.issue_invoice}
                onChange={(e) => handleChange('issue_invoice', e.target.checked)}
                className="w-4 h-4 accent-[#D4A03A] cursor-pointer"
              />
              <label htmlFor="issue_invoice" className="text-xs text-[#1a1a1a] cursor-pointer flex-1">
                この売上の請求書を発行する
                <span className="block text-[10px] text-[#999] mt-0.5">
                  登録後、請求書作成画面に移動します
                </span>
              </label>
            </div>
          )}

          {/* エラー */}
          {error && (
            <p className="text-xs text-[#C23728]">{error}</p>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {editData ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
