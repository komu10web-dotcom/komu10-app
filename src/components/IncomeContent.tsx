'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { DIVISIONS, TRANSACTION_STATUS } from '@/types/database';
import type { Transaction, RevenueType, RevenueTypeDivision, ContractType, BusinessDomain, Project, Client } from '@/types/database';
import InvoiceTab from './InvoiceTab';

// ステータスバッジの色定義
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  forecast: { bg: 'bg-app-surface-alt', text: 'text-app-text-mute' },
  accrued:  { bg: 'bg-content-scene-notes/10', text: 'text-app-green' },
  billed:   { bg: 'bg-app-gold/10', text: 'text-app-gold' },
  settled:  { bg: 'bg-app-green/10', text: 'text-app-green' },
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
  const searchParams = useSearchParams();

  // タブ切り替え
  const [activeTab, setActiveTab] = useState<'sales' | 'invoices'>('sales');

  // URLパラメータで初期タブ＋請求書自動起動（売上モーダルからの遷移用）
  const initialTransactionId = searchParams.get('transaction_id');
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'invoices') {
      setActiveTab('invoices');
    }
  }, [searchParams]);

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
    <div className="min-h-screen" style={{ background: '#FAFAF6' }}>
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── ヘッダー(VOLUME 03 + X ライン Type II + 牛乳色) ── */}
        <div className="mb-8 pb-5">
          {/* X ライン Type II 非対称テーパー */}
          <svg width="100%" height="3" viewBox="0 0 200 3" preserveAspectRatio="none" style={{ marginBottom: 24, display: 'block' }}>
            <defs>
              <linearGradient id="x-line-income" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#B8893A" stopOpacity="0" />
                <stop offset="20%"  stopColor="#B8893A" stopOpacity="1" />
                <stop offset="100%" stopColor="#0A0A0B" stopOpacity="1" />
              </linearGradient>
            </defs>
            <line x1="0" y1="1.5" x2="200" y2="1.5" stroke="url(#x-line-income)" strokeWidth="1.6" strokeLinecap="butt" />
          </svg>
          <div>
            <p className="font-['Saira_Condensed'] text-[11px] tracking-[0.3em] text-app-gold mb-3 font-medium">
              VOLUME 03 · SALES
            </p>
            <h1 className="font-['Shippori_Mincho'] font-normal text-app-text" style={{ fontSize: 40, fontWeight: 400, letterSpacing: '0.01em', lineHeight: 1.15 }}>
              いくら、稼げているか。
            </h1>
          </div>
          <div className="mt-6 flex items-center gap-1 bg-app-surface-alt rounded-lg p-0.5 w-fit">
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'sales' ? 'bg-white text-app-text shadow-sm font-medium' : 'text-app-text-mute hover:text-app-text-sub'
              }`}
            >
              売上一覧
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTab === 'invoices' ? 'bg-white text-app-text shadow-sm font-medium' : 'text-app-text-mute hover:text-app-text-sub'
              }`}
            >
              請求書
            </button>
          </div>
        </div>

        {/* ── 請求書タブ ── */}
        {activeTab === 'invoices' ? (
          <InvoiceTab owner={owner} clients={clients} initialTransactionId={initialTransactionId} />
        ) : (
        <>

        {/* ── 売上タブ: ヘッダーアクション ── */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-app-button text-white rounded-lg text-xs font-medium hover:bg-app-button-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            売上入力
          </button>
          <label className="flex items-center gap-1.5 px-4 py-2 bg-white text-app-text rounded-lg text-xs font-medium hover:bg-app-surface transition-colors cursor-pointer border border-app-line-medium">
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-text-mute" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="検索..."
              className="pl-8 pr-3 py-2 bg-white rounded-lg text-xs border border-app-line-medium outline-none focus:ring-2 focus:ring-app-gold/50 w-40"
            />
          </div>
          <span className="text-xs text-app-text-mute">
            {filtered.length}件
          </span>
        </div>

        {/* ── テーブル ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 text-app-gold animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-app-text-fade">
              売上がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app-line">
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">日付</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">ステータス</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">取引先</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">事業</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">契約区分</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">収益タイプ</th>
                    <th className="text-left px-4 py-3 text-xs text-app-text-mute font-normal">PJ</th>
                    <th className="text-right px-4 py-3 text-xs text-app-text-mute font-normal">金額</th>
                    <th className="text-right px-4 py-3 text-xs text-app-text-mute font-normal w-20">操作</th>
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
                      <tr key={tx.id} className="border-b border-app-line hover:bg-app-surface-alt/50 transition-colors">
                        <td className="px-4 py-3 font-['Saira_Condensed'] text-xs text-app-text-mute tabular-nums">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {getStatusLabel(tx.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-app-text">{tx.store || '—'}</div>
                          {tx.description && (
                            <div className="text-xs text-app-text-mute mt-0.5">{tx.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {div ? (
                            <span className="inline-flex items-center gap-1 text-xs text-app-text-sub">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: div.color }}
                              />
                              {div.label}
                            </span>
                          ) : (
                            <span className="text-xs text-app-text-mute">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-app-text-sub">{ctName}</td>
                        <td className="px-4 py-3 text-xs text-app-text-sub">{rtName}</td>
                        <td className="px-4 py-3 text-xs text-app-text-sub max-w-[120px] truncate" title={pjName !== '—' ? pjName : undefined}>{pjName}</td>
                        <td className="px-4 py-3 text-right font-['Saira_Condensed'] tabular-nums text-app-green">
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setEditTarget(tx); setModalOpen(true); }}
                              className="p-1.5 hover:bg-black/5 rounded-md transition-colors"
                              title="編集"
                            >
                              <Pencil className="w-3.5 h-3.5 text-app-text-mute" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(tx.id)}
                              className="p-1.5 hover:bg-app-red/10 rounded-md transition-colors"
                              title="削除"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-app-text-mute" />
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
              <div className="flex items-center justify-end gap-4 px-4 py-3 border-t border-app-line bg-app-surface-alt/50">
                {forecastSum > 0 && (
                  <div className="text-xs">
                    <span className="text-app-text-mute">見込み: </span>
                    <span className="font-['Saira_Condensed'] text-app-text-mute tabular-nums">{formatAmount(forecastSum)}</span>
                  </div>
                )}
                {otherSum > 0 && (
                  <div className="text-xs">
                    <span className="text-app-text-mute">確定未入金: </span>
                    <span className="font-['Saira_Condensed'] text-app-gold tabular-nums">{formatAmount(otherSum)}</span>
                  </div>
                )}
                {settledSum > 0 && (
                  <div className="text-xs">
                    <span className="text-app-text-mute">入金済: </span>
                    <span className="font-['Saira_Condensed'] text-app-green tabular-nums">{formatAmount(settledSum)}</span>
                  </div>
                )}
                <div className="text-xs">
                  <span className="text-app-text-mute">合計: </span>
                  <span className="font-['Saira_Condensed'] text-app-green tabular-nums font-medium">{formatAmount(revenueSum)}</span>
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
            <p className="text-sm text-app-text mb-4">この売上を削除しますか？</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-app-text-mute bg-app-surface-alt rounded-lg hover:bg-app-surface-hover transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-app-red rounded-lg hover:bg-app-red-hover transition-colors"
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
    new_project_invoice_display_name: '', // 旧v0.5.4フィールド（後方互換・未使用）
    invoice_display_name_input: editData?.project_id
      ? (projects.find(p => p.id === editData.project_id)?.invoice_display_name || '')
      : '', // v0.5.6: 請求書の件名（既存案件選択時は既存値をロード・編集可能）
    business_domain: (editData as any)?.business_domain || '',
    contract_type_id: editData?.contract_type_id || '',
    revenue_type: editData?.revenue_type || '',
    owner: editData?.owner || defaultOwner,
    description: editData?.description || '',
    item_description: (editData as any)?.item_description || '', // 品名・摘要（v0.5.4追加・UI必須）
    status: editData?.status || 'forecast',
    expected_payment_date: editData?.expected_payment_date || '',
    actual_payment_date: editData?.actual_payment_date || '',
    issue_invoice: false, // 請求書発行トグル（新規作成時のみ有効）
  });

  // 新規案件作成時の「詳細オプション」折りたたみ表示
  const [showNewProjectDetails, setShowNewProjectDetails] = useState(false);

  // 品名・摘要サジェスト（選択中案件の直近3件）
  const [itemDescSuggestions, setItemDescSuggestions] = useState<string[]>([]);

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
      // v0.5.6: 既存案件の請求書の件名を自動ロード
      invoice_display_name_input: (project as any).invoice_display_name || '',
    }));
    setProjectSuggestions([]);
    setShowSuggestions(false);
  };

  // 案件選択時：その案件の過去 item_description を直近3件サジェストとして取得
  useEffect(() => {
    if (!supabase || !form.project_id) {
      setItemDescSuggestions([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase!
        .from('transactions')
        .select('item_description, date')
        .eq('project_id', form.project_id)
        .not('item_description', 'is', null)
        .order('date', { ascending: false })
        .limit(10);
      if (!active) return;
      const uniq: string[] = [];
      (data || []).forEach((row: any) => {
        const d = (row.item_description || '').trim();
        if (d && !uniq.includes(d)) uniq.push(d);
      });
      setItemDescSuggestions(uniq.slice(0, 3));
    })();
    return () => { active = false; };
  }, [form.project_id]);

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
      setError('案件管理名を入力してください');
      return;
    }

    // 部門（DIVISIONS）も必須
    if (!form.division) {
      setError('部門を選んでください');
      return;
    }

    // 品名・摘要も必須（UIレベル・v0.5.4追加）
    if (!form.item_description.trim()) {
      setError('品名・摘要を入力してください（請求書明細にそのまま使われます）');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 案件の解決：既存サジェスト選択済 or 完全一致既存 or 新規作成
      let projectId: string | null = form.project_id || null;
      const trimmedName = form.project_name_input.trim();
      const trimmedInvName = form.invoice_display_name_input.trim();

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
            // v0.5.6: 既存案件のinvoice_display_nameが変更されていれば更新
            if (trimmedInvName !== ((exactMatch as any).invoice_display_name || '')) {
              await supabase.from('projects').update({ invoice_display_name: trimmedInvName || null } as any).eq('id', exactMatch.id);
            }
          } else {
            // 新規作成（別案件として）
            const { data: newProject, error: pjErr } = await supabase
              .from('projects')
              .insert({
                name: trimmedName,
                invoice_display_name: trimmedInvName || null,
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
              invoice_display_name: trimmedInvName || null,
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
        // v0.5.6: 既存案件紐付け時、invoice_display_nameが変更されていれば案件側を更新
        const existingProject = projects.find(p => p.id === projectId);
        if (existingProject && trimmedInvName !== ((existingProject as any).invoice_display_name || '')) {
          await supabase.from('projects').update({ invoice_display_name: trimmedInvName || null } as any).eq('id', projectId);
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
        description: (form.description && form.description.trim()) || form.item_description.trim() || null,
        item_description: form.item_description.trim() || null,
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-line">
          <h2 className="text-sm font-medium text-app-text">
            {editData ? '売上を編集' : '売上を入力'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <X className="w-4 h-4 text-app-text-mute" />
          </button>
        </div>

        {/* フォーム */}
        <div className="px-5 py-4 space-y-4">
          {/* ステータス */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">ステータス</label>
            <select
              value={form.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            >
              {Object.entries(TRANSACTION_STATUS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* 計上日（PL） */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">計上日（納品日・役務提供日）</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange('date', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            />
          </div>

          {/* 入金予定日 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">入金予定日（任意）</label>
            <input
              type="date"
              value={form.expected_payment_date}
              onChange={(e) => handleChange('expected_payment_date', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            />
          </div>

          {/* 入金日（settledの場合のみ表示） */}
          {form.status === 'settled' && (
            <div>
              <label className="block text-xs text-app-text-mute mb-1">入金日</label>
              <input
                type="date"
                value={form.actual_payment_date}
                onChange={(e) => handleChange('actual_payment_date', e.target.value)}
                className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
              />
            </div>
          )}

          {/* 金額 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">金額（円）</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.amount ? Number(form.amount).toLocaleString('ja-JP') : ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, '');
                handleChange('amount', raw);
              }}
              placeholder="0"
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 font-['Saira_Condensed'] tabular-nums"
            />
          </div>

          {/* 取引先 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">取引先</label>
            <select
              value={form.client_id}
              onChange={(e) => handleChange('client_id', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
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
                className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 mt-2"
              />
            )}
          </div>

          {/* 事業（部門） */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">部門 <span className="text-app-red">*</span></label>
            <select
              value={form.division}
              onChange={(e) => handleChange('division', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            >
              <option value="">未選択</option>
              {DIVISION_OPTIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* ─── 分類（経営分析用）ディバイダ ─── */}
          <div className="pt-1">
            <div className="text-[10px] font-medium tracking-widest text-app-text-fade mb-2 border-t border-app-line pt-3">
              分類（経営分析用）
            </div>
          </div>

          {/* 契約形態（軸A・必須） */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">契約形態 <span className="text-app-red">*</span></label>
            <select
              value={form.contract_type_id}
              onChange={(e) => handleChange('contract_type_id', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            >
              <option value="">選択してください</option>
              {contractTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>{ct.name}</option>
              ))}
            </select>
          </div>

          {/* 事業領域（軸B・必須） */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">事業領域 <span className="text-app-red">*</span></label>
            <select
              value={form.business_domain}
              onChange={(e) => handleChange('business_domain', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            >
              <option value="">選択してください</option>
              {businessDomains.map((bd) => (
                <option key={bd.id} value={bd.id}>{bd.name}</option>
              ))}
            </select>
          </div>

          {/* 案件管理名（軸C・必須・サジェスト） */}
          <div className="relative">
            <label className="block text-xs text-app-text-mute mb-1">
              案件管理名（内部管理用） <span className="text-app-red">*</span>
              {form.project_id && (
                <span className="ml-2 text-[10px] text-app-green">（既存案件に紐付け済）</span>
              )}
            </label>
            <input
              type="text"
              value={form.project_name_input}
              onChange={(e) => handleProjectNameInput(e.target.value)}
              onFocus={() => { if (projectSuggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowSuggestions(false), 150); }}
              placeholder="例: KKDAY_自治体DMO関連事業支援_2026Q2"
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
              autoComplete="off"
            />
            {showSuggestions && projectSuggestions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-app-line overflow-hidden">
                {projectSuggestions.map((pj) => (
                  <button
                    key={pj.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(pj); }}
                    className="w-full px-3 py-2 text-left text-xs text-app-text-strong hover:bg-app-surface-alt border-b border-app-line last:border-b-0"
                  >
                    {pj.name}
                    <span className="ml-2 text-[10px] text-app-text-mute">
                      {DIVISIONS[pj.division as keyof typeof DIVISIONS]?.label || pj.division}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!form.project_id && form.project_name_input.trim() && projectSuggestions.length === 0 && (
              <p className="text-[10px] text-app-text-fade mt-1">＋ 新しい案件として登録されます</p>
            )}
          </div>

          {/* 請求書の件名（v0.5.6: インライン編集可能・既存案件も新規案件も統一UI） */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">
              請求書の件名（先方が見る表記・任意）
            </label>
            <input
              type="text"
              value={form.invoice_display_name_input}
              onChange={(e) => handleChange('invoice_display_name_input', e.target.value)}
              placeholder="例: 自治体DMO関連事業支援（空欄なら案件管理名を使用）"
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            />
            <p className="text-[10px] text-app-text-fade mt-1">
              {form.project_id
                ? '※ この案件の全ての売上・請求書に反映されます（案件単位で保存）'
                : '請求書を発行しない場合は空欄で構いません'}
            </p>
          </div>

          {/* 品名・摘要（v0.5.4追加・常に必須） */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">
              品名・摘要（個別売上・請求書明細） <span className="text-app-red">*</span>
              {editData && !(editData as any).item_description && (
                <span className="ml-2 text-[10px] text-app-gold bg-app-gold/10 px-1.5 py-0.5 rounded">摘要未記入</span>
              )}
            </label>
            <input
              type="text"
              value={form.item_description}
              onChange={(e) => handleChange('item_description', e.target.value)}
              placeholder="例: 2026年4月度 業務委託報酬（4/1〜4/30）"
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            />
            <p className="text-[10px] text-app-text-mute mt-1">請求書の明細行にそのまま使われます</p>
            {/* サジェスト（案件選択時のみ、直近3件） */}
            {form.project_id && itemDescSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {itemDescSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleChange('item_description', s)}
                    className="text-[10px] text-app-text-sub bg-app-surface-alt hover:bg-app-gold/10 hover:text-app-gold px-2 py-1 rounded-full border border-app-line transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 収益タイプ（任意・マスタ空時は無効化） */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">収益タイプ（任意）</label>
            <select
              value={form.revenue_type}
              onChange={(e) => handleChange('revenue_type', e.target.value)}
              disabled={revenueTypes.length === 0}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50 disabled:opacity-50"
            >
              <option value="">{revenueTypes.length === 0 ? '（未登録）' : '未選択'}</option>
              {filteredRT.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          </div>

          {/* 担当者 */}
          <div>
            <label className="block text-xs text-app-text-mute mb-1">担当者</label>
            <select
              value={form.owner}
              onChange={(e) => handleChange('owner', e.target.value)}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-app-gold/50"
            >
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>

          {/* 摘要（旧フィールド・UIから削除・v0.5.5）
              DBのtransactions.descriptionカラムは後方互換のため残置、
              新規保存時はitem_descriptionと同値を自動セットする */}

          {/* 請求書発行トグル（新規作成時のみ） */}
          {!editData && (
            <div className="flex items-center gap-2 p-3 bg-app-surface-alt rounded-lg">
              <input
                type="checkbox"
                id="issue_invoice"
                checked={form.issue_invoice}
                onChange={(e) => handleChange('issue_invoice', e.target.checked)}
                className="w-4 h-4 accent-app-gold cursor-pointer"
              />
              <label htmlFor="issue_invoice" className="text-xs text-app-text cursor-pointer flex-1">
                この売上の請求書を発行する
                <span className="block text-[10px] text-app-text-mute mt-0.5">
                  登録後、請求書作成画面に移動します
                </span>
              </label>
            </div>
          )}

          {/* エラー */}
          {error && (
            <p className="text-xs text-app-red">{error}</p>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-app-line flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs text-app-text-mute bg-app-surface-alt rounded-lg hover:bg-app-surface-hover transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-xs text-white bg-app-button rounded-lg hover:bg-app-button-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {editData ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
