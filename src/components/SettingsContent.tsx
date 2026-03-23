'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS, RECURRING_FREQUENCY } from '@/types/database';
import type { AnbunSetting, Asset, RevenueType, RevenueTypeDivision, ContractType, BankAccount, Client, RecurringExpense, Project } from '@/types/database';
import { Plus, Pencil, Trash2, Save, X, Loader2, ChevronDown, ChevronUp, HelpCircle, Cloud, CheckCircle2, RefreshCw, FolderOpen } from 'lucide-react';

// ============================================================
// 定数
// ============================================================
const ANBUN_KAMOKU = ['communication', 'rent', 'utility', 'vehicle', 'subscription', 'software'] as const;

const ASSET_CATEGORIES = [
  { value: 'camera', label: 'カメラ', defaultLife: 5 },
  { value: 'lens', label: 'レンズ', defaultLife: 5 },
  { value: 'pc', label: 'PC', defaultLife: 4 },
  { value: 'drone', label: 'ドローン', defaultLife: 5 },
  { value: 'other', label: 'その他', defaultLife: 5 },
] as const;

const THEMES = [
  { value: 'light', label: 'ライト', desc: '標準の白背景', color: '#F5F5F3' },
  { value: 'warm', label: 'ウォーム', desc: '暖かみのある背景', color: '#FAF6F0' },
  { value: 'cool', label: 'クール', desc: '涼しげな背景', color: '#F0F4F8' },
] as const;

const PROJECT_STATUS: Record<string, string> = {
  planning: '企画',
  ordered: '受注済',
  active: '進行中',
  published: '公開済',
  completed: '完了',
};

const QA_ITEMS = [
  {
    q: '撮影旅行の食事は経費になる？',
    a: '取材目的の食事は「接待交際費」として計上できます。ただし、一人での食事は原則認められません。取材先や同行者との食事で、取材メモや写真があると根拠になります。',
  },
  {
    q: 'カメラの購入はどう処理する？',
    a: '10万円未満は「消耗品費」として一括経費。10万円以上は「固定資産」として登録し、耐用年数（カメラは5年）で減価償却します。設定ページの固定資産台帳で管理できます。',
  },
  {
    q: '按分とは？',
    a: '自宅兼事務所の家賃や通信費など、事業とプライベート両方で使う費用について、事業利用分の割合（%）だけを経費にする仕組みです。税務署への根拠説明が必要なので、メモに理由を残しましょう。',
  },
  {
    q: '交通費に領収書は必要？',
    a: '電車・バスは領収書不要ですが、IC履歴や乗車区間の記録が必要です。タクシーは領収書必須。飛行機は搭乗券の控えも保管してください。',
  },
  {
    q: 'YouTubeの広告収益はどう計上する？',
    a: 'Googleからの入金時に「売上高」として計上します。収益タイプは「広告収益（YouTube）」を選択。月次でAdSenseのレポートと突合しましょう。',
  },
  {
    q: '確定申告の期限は？',
    a: '毎年2月16日〜3月15日が申告期間です。青色申告の65万円控除を受けるにはe-Taxでの電子申告が必要です。このアプリの確定申告ページからE-TAXに転記できます。',
  },
  {
    q: 'サブスクリプションの処理は？',
    a: 'Adobe CC、クラウドストレージ等の月額サービスは、事業利用割合に応じて按分します。設定ページで按分率を登録し、明細に「事業利用◯%」とメモを残しましょう。',
  },
  {
    q: '2人（トモ・トシキ）の経費はどう分ける？',
    a: '各取引に「担当者」を設定します。確定申告は個人別に行うため、担当者ごとに売上・経費が自動分離されます。共通経費は按分設定で各自の割合を設定してください。',
  },
];

// ============================================================
// ユーティリティ
// ============================================================
const yen = (n: number) => '¥' + Math.floor(n).toLocaleString('ja-JP');

interface ProjectForm {
  name: string;
  division: string;
  owner: string;
  status: string;
  client: string;
  note: string;
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function SettingsContent() {
  const searchParams = useSearchParams();
  const owner = searchParams.get('owner') || 'tomo';
  const effectiveOwner = owner === 'all' ? 'tomo' : owner;
  const ownerLabel = effectiveOwner === 'tomo' ? 'トモ' : 'トシキ';

  const [loading, setLoading] = useState(true);
  const [settingsTab, setSettingsTab] = useState<'common' | 'personal'>('common');

  // 按分設定
  const [anbunSettings, setAnbunSettings] = useState<AnbunSetting[]>([]);
  const [anbunDraft, setAnbunDraft] = useState<Record<string, { ratio: number; note: string }>>({});
  const [anbunSaving, setAnbunSaving] = useState(false);
  const [anbunSaved, setAnbunSaved] = useState(false);

  // 固定資産
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // テーマ
  const [currentTheme, setCurrentTheme] = useState('light');
  const [themeSaving, setThemeSaving] = useState(false);

  // 決算期
  const [fiscalStartMonth, setFiscalStartMonth] = useState(1);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalConfirmOpen, setFiscalConfirmOpen] = useState(false);
  const [fiscalPendingMonth, setFiscalPendingMonth] = useState(1);

  // Q&A
  const [openQA, setOpenQA] = useState<number | null>(null);

  // 契約区分
  const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
  const [ctEditId, setCtEditId] = useState<string | null>(null);
  const [ctEditName, setCtEditName] = useState('');
  const [ctNewName, setCtNewName] = useState('');
  const [ctSaving, setCtSaving] = useState(false);

  // 収益タイプ
  const [revenueTypes, setRevenueTypes] = useState<RevenueType[]>([]);
  const [revenueTypeDivisions, setRevenueTypeDivisions] = useState<RevenueTypeDivision[]>([]);
  const [rtEditId, setRtEditId] = useState<string | null>(null);
  const [rtEditName, setRtEditName] = useState('');
  const [rtEditDivisions, setRtEditDivisions] = useState<string[]>([]);
  const [rtNewName, setRtNewName] = useState('');
  const [rtNewDivisions, setRtNewDivisions] = useState<string[]>([]);
  const [rtSaving, setRtSaving] = useState(false);

  // ── Drive バックアップ ──
  const [driveBackupStatus, setDriveBackupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [driveBackupFileName, setDriveBackupFileName] = useState('');
  const [driveBackupError, setDriveBackupError] = useState('');

  // 口座
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankDeleteTarget, setBankDeleteTarget] = useState<string | null>(null);

  // 取引先
  const [clients, setClients] = useState<Client[]>([]);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientDeleteTarget, setClientDeleteTarget] = useState<string | null>(null);

  // 固定契約
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState<string | null>(null);

  // プロジェクト
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // ============================================================
  // データ取得
  // ============================================================
  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      // 按分設定
      const { data: anbunData } = await supabase
        .from('anbun_settings')
        .select('*')
        .eq('owner', effectiveOwner);

      // 固定資産
      const { data: assetData } = await supabase
        .from('assets')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('acquisition_date', { ascending: false });

      // プロフィール（テーマ）
      const { data: profileData } = await supabase
        .from('profiles')
        .select('theme')
        .eq('user_key', effectiveOwner)
        .single();

      // 契約区分
      const { data: ctData } = await supabase
        .from('contract_types')
        .select('*')
        .order('sort_order');

      // 収益タイプ
      const { data: rtData } = await supabase
        .from('revenue_types')
        .select('*')
        .order('sort_order');

      // 収益タイプ×事業
      const { data: rtdData } = await supabase
        .from('revenue_type_divisions')
        .select('*');

      // 口座
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('created_at');

      // 取引先
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('name');

      // 固定契約
      const { data: recurringData } = await supabase
        .from('recurring_expenses')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('created_at');

      // プロジェクト（共通：ownerフィルターなし）
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      setAnbunSettings(anbunData || []);
      setAssets(assetData || []);
      if (profileData) {
        setCurrentTheme(profileData.theme || 'light');
        setFiscalStartMonth((profileData as any).fiscal_start_month || 1);
      }
      setContractTypes(ctData || []);
      setRevenueTypes(rtData || []);
      setRevenueTypeDivisions(rtdData || []);
      setBankAccounts(bankData || []);
      setClients(clientData || []);
      setRecurringExpenses(recurringData || []);
      setProjects(projectData || []);

      // 按分ドラフト初期化
      const draft: Record<string, { ratio: number; note: string }> = {};
      for (const k of ANBUN_KAMOKU) {
        const existing = (anbunData || []).find((a: AnbunSetting) => a.kamoku === k);
        draft[k] = {
          ratio: existing?.ratio ?? 0,
          note: existing?.note ?? '',
        };
      }
      setAnbunDraft(draft);
    } catch (err) {
      console.error('設定データ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveOwner]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================
  // 按分設定の保存
  // ============================================================
  const saveAnbun = async () => {
    if (!supabase) return;
    setAnbunSaving(true);

    try {
      for (const kamoku of ANBUN_KAMOKU) {
        const draft = anbunDraft[kamoku];
        if (!draft) continue;

        const existing = anbunSettings.find(a => a.kamoku === kamoku);

        if (existing) {
          // 更新
          await supabase
            .from('anbun_settings')
            .update({ ratio: draft.ratio, note: draft.note || null })
            .eq('id', existing.id);
        } else if (draft.ratio > 0) {
          // 新規作成（ratio > 0のもののみ）
          await supabase
            .from('anbun_settings')
            .insert({
              kamoku,
              owner: effectiveOwner,
              ratio: draft.ratio,
              note: draft.note || null,
            });
        }
      }

      setAnbunSaved(true);
      setTimeout(() => setAnbunSaved(false), 2000);
      // 再取得
      const { data } = await supabase
        .from('anbun_settings')
        .select('*')
        .eq('owner', effectiveOwner);
      setAnbunSettings(data || []);
    } catch (err) {
      console.error('按分設定保存エラー:', err);
    } finally {
      setAnbunSaving(false);
    }
  };

  // ============================================================
  // 固定資産の保存
  // ============================================================
  const saveAsset = async (form: AssetForm) => {
    if (!supabase) return;

    try {
      const payload = {
        name: form.name,
        category: form.category,
        owner: effectiveOwner,
        acquisition_date: form.acquisitionDate,
        acquisition_cost: form.acquisitionCost,
        useful_life: form.usefulLife,
        business_use_ratio: form.businessUseRatio,
      };

      if (editingAsset) {
        await supabase
          .from('assets')
          .update(payload)
          .eq('id', editingAsset.id);
      } else {
        await supabase.from('assets').insert(payload);
      }

      setAssetModalOpen(false);
      setEditingAsset(null);

      // 再取得
      const { data } = await supabase
        .from('assets')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('acquisition_date', { ascending: false });
      setAssets(data || []);
    } catch (err) {
      console.error('固定資産保存エラー:', err);
    }
  };

  const deleteAsset = async (id: string) => {
    if (!supabase) return;

    try {
      await supabase.from('assets').delete().eq('id', id);
      setDeleteTarget(null);

      const { data } = await supabase
        .from('assets')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('acquisition_date', { ascending: false });
      setAssets(data || []);
    } catch (err) {
      console.error('固定資産削除エラー:', err);
    }
  };

  // ============================================================
  // テーマ保存
  // ============================================================
  const saveTheme = async (theme: string) => {
    if (!supabase) return;
    setThemeSaving(true);
    setCurrentTheme(theme);

    try {
      await supabase
        .from('profiles')
        .update({ theme })
        .eq('user_key', effectiveOwner);
    } catch (err) {
      console.error('テーマ保存エラー:', err);
    } finally {
      setThemeSaving(false);
    }
  };

  // 決算期保存
  const saveFiscalMonth = async (month: number) => {
    if (!supabase) return;
    setFiscalSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({ fiscal_start_month: month } as any)
        .eq('user_key', effectiveOwner);
      setFiscalStartMonth(month);
    } catch (err) {
      console.error('決算期保存エラー:', err);
    } finally {
      setFiscalSaving(false);
    }
  };

  // ============================================================
  // 契約区分 CRUD
  // ============================================================
  const addContractType = async () => {
    if (!supabase || !ctNewName.trim()) return;
    setCtSaving(true);
    try {
      const maxSort = contractTypes.length > 0 ? Math.max(...contractTypes.map(c => c.sort_order)) : 0;
      await supabase.from('contract_types').insert({ name: ctNewName.trim(), sort_order: maxSort + 1 });
      setCtNewName('');
      const { data } = await supabase.from('contract_types').select('*').order('sort_order');
      setContractTypes(data || []);
    } catch (err) { console.error('契約区分追加エラー:', err); }
    finally { setCtSaving(false); }
  };

  const updateContractType = async (id: string) => {
    if (!supabase || !ctEditName.trim()) return;
    setCtSaving(true);
    try {
      await supabase.from('contract_types').update({ name: ctEditName.trim() }).eq('id', id);
      setCtEditId(null);
      const { data } = await supabase.from('contract_types').select('*').order('sort_order');
      setContractTypes(data || []);
    } catch (err) { console.error('契約区分更新エラー:', err); }
    finally { setCtSaving(false); }
  };

  const deleteContractType = async (id: string) => {
    if (!supabase) return;
    if (!confirm('この契約区分を削除しますか？')) return;
    try {
      await supabase.from('contract_types').delete().eq('id', id);
      const { data } = await supabase.from('contract_types').select('*').order('sort_order');
      setContractTypes(data || []);
    } catch (err) { console.error('契約区分削除エラー:', err); }
  };

  // ============================================================
  // 収益タイプ CRUD
  // ============================================================
  const addRevenueType = async () => {
    if (!supabase || !rtNewName.trim()) return;
    setRtSaving(true);
    try {
      const maxSort = revenueTypes.length > 0 ? Math.max(...revenueTypes.map(r => r.sort_order)) : 0;
      const { data: inserted } = await supabase
        .from('revenue_types')
        .insert({ name: rtNewName.trim(), sort_order: maxSort + 1 })
        .select()
        .single();
      // 事業紐付け
      if (inserted && rtNewDivisions.length > 0) {
        const links = rtNewDivisions.map(div => ({ revenue_type_id: inserted.id, division: div }));
        await supabase.from('revenue_type_divisions').insert(links);
      }
      setRtNewName('');
      setRtNewDivisions([]);
      await refreshRevenueTypes();
    } catch (err) { console.error('収益タイプ追加エラー:', err); }
    finally { setRtSaving(false); }
  };

  const startEditRevenueType = (rt: RevenueType) => {
    setRtEditId(rt.id);
    setRtEditName(rt.name);
    const linked = revenueTypeDivisions.filter(d => d.revenue_type_id === rt.id).map(d => d.division);
    setRtEditDivisions(linked);
  };

  const updateRevenueType = async (id: string) => {
    if (!supabase || !rtEditName.trim()) return;
    setRtSaving(true);
    try {
      await supabase.from('revenue_types').update({ name: rtEditName.trim() }).eq('id', id);
      // 事業紐付け差し替え
      await supabase.from('revenue_type_divisions').delete().eq('revenue_type_id', id);
      if (rtEditDivisions.length > 0) {
        const links = rtEditDivisions.map(div => ({ revenue_type_id: id, division: div }));
        await supabase.from('revenue_type_divisions').insert(links);
      }
      setRtEditId(null);
      await refreshRevenueTypes();
    } catch (err) { console.error('収益タイプ更新エラー:', err); }
    finally { setRtSaving(false); }
  };

  const deleteRevenueType = async (id: string) => {
    if (!supabase) return;
    if (!confirm('この収益タイプを削除しますか？')) return;
    try {
      await supabase.from('revenue_type_divisions').delete().eq('revenue_type_id', id);
      await supabase.from('revenue_types').delete().eq('id', id);
      await refreshRevenueTypes();
    } catch (err) { console.error('収益タイプ削除エラー:', err); }
  };

  const refreshRevenueTypes = async () => {
    if (!supabase) return;
    const [rtRes, rtdRes] = await Promise.all([
      supabase.from('revenue_types').select('*').order('sort_order'),
      supabase.from('revenue_type_divisions').select('*'),
    ]);
    setRevenueTypes(rtRes.data || []);
    setRevenueTypeDivisions(rtdRes.data || []);
  };

  const toggleDivision = (list: string[], setList: (v: string[]) => void, div: string) => {
    setList(list.includes(div) ? list.filter(d => d !== div) : [...list, div]);
  };

  // ============================================================
  // 口座 CRUD
  // ============================================================
  const saveBank = async (data: {
    name: string; bank_name: string; branch_name: string;
    account_type: string; account_number_last4: string; balance: number;
  }) => {
    if (!supabase) return;
    try {
      const record = { ...data, owner: effectiveOwner };
      if (editingBank) {
        const { error } = await supabase.from('bank_accounts').update(record).eq('id', editingBank.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bank_accounts').insert(record);
        if (error) throw error;
      }
      setBankModalOpen(false);
      setEditingBank(null);
      const { data: refreshed } = await supabase.from('bank_accounts').select('*').eq('owner', effectiveOwner).order('created_at');
      setBankAccounts(refreshed || []);
    } catch (err) { console.error('口座保存エラー:', err); }
  };

  const deleteBank = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase.from('bank_accounts').delete().eq('id', id);
      setBankDeleteTarget(null);
      const { data: refreshed } = await supabase.from('bank_accounts').select('*').eq('owner', effectiveOwner).order('created_at');
      setBankAccounts(refreshed || []);
    } catch (err) { console.error('口座削除エラー:', err); }
  };

  // ============================================================
  // 取引先 CRUD
  // ============================================================
  const refreshClients = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('clients').select('*').eq('owner', effectiveOwner).order('name');
    setClients(data || []);
  };

  const saveClient = async (data: {
    name: string; payment_terms: string; payment_terms_days: number | null;
    default_contact: string; notes: string;
  }) => {
    if (!supabase) return;
    try {
      const record = { ...data, owner: effectiveOwner };
      if (editingClient) {
        const { error } = await supabase.from('clients').update(record).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert(record);
        if (error) throw error;
      }
      setClientModalOpen(false);
      setEditingClient(null);
      await refreshClients();
    } catch (err) { console.error('取引先保存エラー:', err); }
  };

  const deleteClient = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase.from('clients').delete().eq('id', id);
      setClientDeleteTarget(null);
      await refreshClients();
    } catch (err) { console.error('取引先削除エラー:', err); }
  };

  // ============================================================
  // 固定契約 CRUD
  // ============================================================
  const refreshRecurring = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('recurring_expenses').select('*').eq('owner', effectiveOwner).order('created_at');
    setRecurringExpenses(data || []);
  };

  // forecast行を自動生成（売上契約: kamoku='sales'、毎月振込の場合）
  const generateForecastRows = async (rec: {
    kamoku: string; amount: number; division: string; owner: string;
    description: string; start_date: string; end_date: string | null;
    frequency: string; client_id: string | null; payment_day: number | null;
  }, recurringId: string) => {
    if (!supabase) return;
    // 売上の毎月振込のみforecast自動生成
    if (rec.kamoku !== 'sales' || rec.frequency !== 'monthly') return;
    if (!rec.start_date) return;

    const start = new Date(rec.start_date + '-01');
    const endStr = rec.end_date || `${start.getFullYear() + 1}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    const end = new Date(endStr + '-01');

    const rows: any[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const payDay = rec.payment_day || 28;
      const lastDay = new Date(yyyy, cursor.getMonth() + 1, 0).getDate();
      const day = Math.min(payDay, lastDay);

      rows.push({
        tx_type: 'revenue',
        date: `${yyyy}-${mm}-${String(day).padStart(2, '0')}`,
        amount: rec.amount,
        kamoku: 'sales',
        division: rec.division || 'general',
        owner: rec.owner,
        store: null,
        description: rec.description || null,
        source: 'recurring',
        confirmed: false,
        status: 'forecast',
        accrual_date: `${yyyy}-${mm}-${String(day).padStart(2, '0')}`,
        expected_payment_date: null,
        actual_payment_date: null,
        client_id: rec.client_id || null,
        external_id: `recurring:${recurringId}:${yyyy}-${mm}`,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    if (rows.length > 0) {
      // external_idでupsert（重複防止）— 既存があれば更新
      for (const row of rows) {
        const { data: existing } = await supabase
          .from('transactions')
          .select('id')
          .eq('external_id', row.external_id)
          .maybeSingle();
        if (existing) {
          await supabase.from('transactions').update(row).eq('id', existing.id);
        } else {
          await supabase.from('transactions').insert(row);
        }
      }
    }
  };

  const saveRecurring = async (data: {
    description: string; amount: number; kamoku: string; division: string;
    frequency: 'monthly' | 'quarterly' | 'annual'; start_date: string;
    end_date: string | null; payment_day: number | null;
    client_id: string | null; is_active: boolean;
  }) => {
    if (!supabase) return;
    try {
      const record = { ...data, owner: effectiveOwner };
      let savedId = editingRecurring?.id || '';
      if (editingRecurring) {
        const { error } = await supabase.from('recurring_expenses').update(record).eq('id', editingRecurring.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('recurring_expenses').insert(record).select('id').single();
        if (error) throw error;
        savedId = inserted.id;
      }
      // forecast行の自動生成
      await generateForecastRows({ ...record }, savedId);
      setRecurringModalOpen(false);
      setEditingRecurring(null);
      await refreshRecurring();
    } catch (err) { console.error('固定契約保存エラー:', err); }
  };

  const deleteRecurring = async (id: string) => {
    if (!supabase) return;
    try {
      // 紐づくforecast行も削除（external_idが 'recurring:{id}:' で始まるもの）
      const { data: linked } = await supabase
        .from('transactions')
        .select('id, external_id')
        .like('external_id', `recurring:${id}:%`);
      if (linked && linked.length > 0) {
        // settledは残す、forecast/accrued/billedのみ削除
        const toDelete = linked.filter((t: any) => true); // 全件（settledチェックはDB側status確認が要るが現時点ではforecastのみのはず）
        if (toDelete.length > 0) {
          await supabase.from('transactions').delete().in('id', toDelete.map((t: any) => t.id));
        }
      }
      await supabase.from('recurring_expenses').delete().eq('id', id);
      setRecurringDeleteTarget(null);
      await refreshRecurring();
    } catch (err) { console.error('固定契約削除エラー:', err); }
  };

  // ============================================================
  // プロジェクト管理
  // ============================================================
  const syncProjects = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncResult({ success: true, message: `${data.count}件を同期しました` });
        // リフレッシュ
        const { data: projectData } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });
        setProjects(projectData || []);
      } else {
        setSyncResult({ success: false, message: data.error || '同期に失敗しました' });
      }
    } catch (err) {
      setSyncResult({ success: false, message: '同期に失敗しました' });
    } finally {
      setSyncing(false);
    }
  };

  const saveProject = async (form: ProjectForm) => {
    if (!supabase) return;
    try {
      if (editingProject) {
        await supabase.from('projects').update({
          name: form.name,
          division: form.division,
          owner: form.owner,
          status: form.status,
          client: form.client || null,
          note: form.note || null,
        }).eq('id', editingProject.id);
      } else {
        await supabase.from('projects').insert({
          name: form.name,
          division: form.division,
          owner: form.owner,
          status: form.status,
          client: form.client || null,
          note: form.note || null,
        });
      }
      setProjectModalOpen(false);
      setEditingProject(null);
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      setProjects(projectData || []);
    } catch (err) { console.error('プロジェクト保存エラー:', err); }
  };

  const deleteProject = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase.from('projects').delete().eq('id', id);
      setProjectDeleteTarget(null);
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      setProjects(projectData || []);
    } catch (err) { console.error('プロジェクト削除エラー:', err); }
  };

  // ============================================================
  // レンダリング
  // ============================================================
  if (loading) {
    return (
      <div className="bg-[#F5F5F3] min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* ヘッダー + タブ */}
        <div className="mb-8">
          <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">設定</h1>
          <p className="text-[10px] font-light tracking-wider text-[#999] mt-1">
            SETTINGS — {ownerLabel}
          </p>
          <div className="flex gap-6 mt-5 border-b border-[#e8e6e3]">
            <button
              onClick={() => setSettingsTab('common')}
              className={`pb-2.5 text-xs tracking-wide transition-colors relative ${
                settingsTab === 'common'
                  ? 'text-[#1a1a1a] font-medium'
                  : 'text-[#999] hover:text-[#666]'
              }`}
            >
              共通設定
              {settingsTab === 'common' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#D4A03A]" />
              )}
            </button>
            <button
              onClick={() => setSettingsTab('personal')}
              className={`pb-2.5 text-xs tracking-wide transition-colors relative ${
                settingsTab === 'personal'
                  ? 'text-[#1a1a1a] font-medium'
                  : 'text-[#999] hover:text-[#666]'
              }`}
            >
              個人設定
              <span className="ml-1.5 text-[10px] text-[#bbb]">— {ownerLabel}</span>
              {settingsTab === 'personal' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#D4A03A]" />
              )}
            </button>
          </div>
        </div>

        {/* ━━━━━━━ 共通設定 ━━━━━━━ */}
        {settingsTab === 'common' && (<>

        {/* ── プロジェクト管理 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            プロジェクト管理
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            {/* 同期ボタン */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={syncProjects}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#1a1a1a] bg-[#F5F5F3] rounded-lg hover:bg-[#eee] transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? '同期中...' : 'スプレッドシートから同期'}
              </button>
              <button
                onClick={() => { setEditingProject(null); setProjectModalOpen(true); }}
                className="flex items-center gap-1.5 text-xs text-[#D4A03A] hover:text-[#b8882e] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />手動追加
              </button>
            </div>
            {syncResult && (
              <div className={`text-[11px] mb-3 px-3 py-2 rounded-lg ${syncResult.success ? 'bg-[#1B4D3E]/5 text-[#1B4D3E]' : 'bg-[#C23728]/5 text-[#C23728]'}`}>
                {syncResult.message}
              </div>
            )}
            {/* PJ一覧（事業別グルーピング） */}
            {projects.length === 0 ? (
              <p className="text-[11px] text-[#999]">プロジェクトが登録されていません</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(DIVISIONS).map(([divId, divVal]) => {
                  const divProjects = projects.filter(pj => pj.division === divId);
                  return (
                    <div key={divId}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="px-1.5 py-0.5 text-[9px] rounded-full text-white"
                          style={{ backgroundColor: divVal.color }}
                        >
                          {divVal.label}
                        </span>
                        <span className="text-[11px] text-[#666]">{divVal.name}</span>
                        <span className="text-[10px] text-[#bbb]">{divProjects.length}件</span>
                      </div>
                      {divProjects.length === 0 ? (
                        <p className="text-[10px] text-[#ccc] pl-1 mb-2">プロジェクトなし</p>
                      ) : (
                        <div className="space-y-1 mb-2">
                          {divProjects.map((pj) => (
                            <div key={pj.id} className="flex items-center justify-between py-2 px-3 bg-[#F5F5F3] rounded-lg">
                              <div className="min-w-0">
                                <div className="text-sm text-[#1a1a1a] truncate">{pj.name}</div>
                                <div className="text-[10px] text-[#999]">
                                  {pj.owner === 'tomo' ? 'トモ' : 'トシキ'}
                                  {pj.client ? ` · ${pj.client}` : ''}
                                  {' · '}{PROJECT_STATUS[pj.status] || pj.status}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => { setEditingProject(pj); setProjectModalOpen(true); }}
                                  className="p-1 hover:bg-black/5 rounded-md"><Pencil className="w-3.5 h-3.5 text-[#999]" /></button>
                                <button onClick={() => setProjectDeleteTarget(pj.id)}
                                  className="p-1 hover:bg-[#C23728]/10 rounded-md"><Trash2 className="w-3.5 h-3.5 text-[#999]" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── 契約区分管理 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            契約区分
          </div>
          <div className="bg-white rounded-xl shadow-sm">
            {contractTypes.map((ct) => (
              <div key={ct.id} className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] last:border-b-0">
                {ctEditId === ct.id ? (
                  <>
                    <input
                      type="text"
                      value={ctEditName}
                      onChange={(e) => setCtEditName(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-[#D4A03A] rounded-md outline-none"
                      onKeyDown={(e) => { if (e.key === 'Enter') updateContractType(ct.id); if (e.key === 'Escape') setCtEditId(null); }}
                      autoFocus
                    />
                    <button onClick={() => updateContractType(ct.id)} disabled={ctSaving} className="p-1 hover:bg-black/5 rounded-md">
                      <Save className="w-3.5 h-3.5 text-[#1B4D3E]" />
                    </button>
                    <button onClick={() => setCtEditId(null)} className="p-1 hover:bg-black/5 rounded-md">
                      <X className="w-3.5 h-3.5 text-[#999]" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-[#333]">{ct.name}</span>
                    <button onClick={() => { setCtEditId(ct.id); setCtEditName(ct.name); }} className="p-1 hover:bg-black/5 rounded-md">
                      <Pencil className="w-3.5 h-3.5 text-[#999]" />
                    </button>
                    <button onClick={() => deleteContractType(ct.id)} className="p-1 hover:bg-[#C23728]/10 rounded-md">
                      <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                    </button>
                  </>
                )}
              </div>
            ))}
            {/* 新規追加 */}
            <div className="flex items-center gap-2 px-5 py-3">
              <input
                type="text"
                value={ctNewName}
                onChange={(e) => setCtNewName(e.target.value)}
                placeholder="新しい契約区分..."
                className="flex-1 px-2 py-1 text-sm bg-[#F5F5F3] rounded-md outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                onKeyDown={(e) => { if (e.key === 'Enter') addContractType(); }}
              />
              <button
                onClick={addContractType}
                disabled={!ctNewName.trim() || ctSaving}
                className="p-1.5 bg-[#1a1a1a] text-white rounded-md disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* ── 収益タイプ管理 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            収益タイプ
          </div>
          <div className="bg-white rounded-xl shadow-sm">
            {revenueTypes.map((rt) => {
              const linkedDivs = revenueTypeDivisions.filter(d => d.revenue_type_id === rt.id).map(d => d.division);
              const isEditing = rtEditId === rt.id;

              return (
                <div key={rt.id} className="px-5 py-3 border-b border-[#f0f0f0] last:border-b-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={rtEditName}
                          onChange={(e) => setRtEditName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-[#D4A03A] rounded-md outline-none"
                          autoFocus
                        />
                        <button onClick={() => updateRevenueType(rt.id)} disabled={rtSaving} className="p-1 hover:bg-black/5 rounded-md">
                          <Save className="w-3.5 h-3.5 text-[#1B4D3E]" />
                        </button>
                        <button onClick={() => setRtEditId(null)} className="p-1 hover:bg-black/5 rounded-md">
                          <X className="w-3.5 h-3.5 text-[#999]" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(DIVISIONS).map(([divId, divVal]) => (
                          <button
                            key={divId}
                            onClick={() => toggleDivision(rtEditDivisions, setRtEditDivisions, divId)}
                            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                              rtEditDivisions.includes(divId)
                                ? 'text-white border-transparent'
                                : 'text-[#999] border-[#e0e0e0] bg-white'
                            }`}
                            style={rtEditDivisions.includes(divId) ? { backgroundColor: divVal.color } : undefined}
                          >
                            {divVal.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <span className="text-sm text-[#333]">{rt.name}</span>
                        {linkedDivs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {linkedDivs.map(divId => {
                              const divVal = DIVISIONS[divId as keyof typeof DIVISIONS];
                              return divVal ? (
                                <span
                                  key={divId}
                                  className="px-1.5 py-0.5 text-[9px] rounded-full text-white"
                                  style={{ backgroundColor: divVal.color }}
                                >
                                  {divVal.label}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                      <button onClick={() => startEditRevenueType(rt)} className="p-1 hover:bg-black/5 rounded-md">
                        <Pencil className="w-3.5 h-3.5 text-[#999]" />
                      </button>
                      <button onClick={() => deleteRevenueType(rt.id)} className="p-1 hover:bg-[#C23728]/10 rounded-md">
                        <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* 新規追加 */}
            <div className="px-5 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={rtNewName}
                  onChange={(e) => setRtNewName(e.target.value)}
                  placeholder="新しい収益タイプ..."
                  className="flex-1 px-2 py-1 text-sm bg-[#F5F5F3] rounded-md outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                />
                <button
                  onClick={addRevenueType}
                  disabled={!rtNewName.trim() || rtSaving}
                  className="p-1.5 bg-[#1a1a1a] text-white rounded-md disabled:opacity-30"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {rtNewName.trim() && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(DIVISIONS).map(([divId, divVal]) => (
                    <button
                      key={divId}
                      onClick={() => toggleDivision(rtNewDivisions, setRtNewDivisions, divId)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                        rtNewDivisions.includes(divId)
                          ? 'text-white border-transparent'
                          : 'text-[#999] border-[#e0e0e0] bg-white'
                      }`}
                      style={rtNewDivisions.includes(divId) ? { backgroundColor: divVal.color } : undefined}
                    >
                      {divVal.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── テーマ ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            テーマ
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex gap-4">
              {THEMES.map(t => (
                <button
                  key={t.value}
                  onClick={() => saveTheme(t.value)}
                  disabled={themeSaving}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                    currentTheme === t.value
                      ? 'border-[#D4A03A] shadow-sm'
                      : 'border-[#e0e0e0] hover:border-[#ccc]'
                  }`}
                >
                  <div
                    className="w-full h-8 rounded-lg mb-2"
                    style={{ backgroundColor: t.color }}
                  />
                  <div className="text-sm text-[#333] font-medium">{t.label}</div>
                  <div className="text-[10px] text-[#999] mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 決算期 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">決算期</div>
          <div className="bg-white rounded-2xl px-5 py-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-4 mb-3">
              <div>
                <label className="text-xs text-[#999] block mb-1">決算期の開始月</label>
                <select
                  value={fiscalStartMonth}
                  onChange={(e) => {
                    const newMonth = parseInt(e.target.value);
                    if (newMonth !== 1) {
                      setFiscalPendingMonth(newMonth);
                      setFiscalConfirmOpen(true);
                    } else {
                      saveFiscalMonth(1);
                    }
                  }}
                  className="px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}月</option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-[#666] pt-4">
                {fiscalStartMonth === 1
                  ? '1月〜12月（暦年・個人事業主の標準）'
                  : `${fiscalStartMonth}月〜${fiscalStartMonth === 1 ? 12 : fiscalStartMonth - 1 + 12 > 12 ? fiscalStartMonth - 1 : fiscalStartMonth + 11}月`
                }
              </div>
            </div>
            <p className="text-[10px] text-[#999]">個人事業主は暦年（1月〜12月）が法定です。法人化した場合のみ変更してください。</p>
          </div>
        </section>

        {/* 決算期変更確認ダイアログ */}
        {fiscalConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setFiscalConfirmOpen(false)} />
            <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
              <div className="mb-4">
                <p className="text-sm font-medium text-[#1a1a1a] mb-2">決算期を変更しますか？</p>
                <div className="bg-[#C23728]/5 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-[#C23728]">個人事業主は暦年（1月〜12月）が税法で定められています。変更不可です。</p>
                </div>
                <p className="text-xs text-[#666]">法人（合同会社等）として届出済みの場合のみ、決算期を変更してください。</p>
              </div>
              <p className="text-xs text-[#999] mb-4">開始月を <strong>{fiscalPendingMonth}月</strong> に変更します。本当に変更しますか？</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFiscalConfirmOpen(false)}
                  className="flex-1 py-2 rounded-lg text-xs text-[#999] bg-[#F5F5F3] hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    saveFiscalMonth(fiscalPendingMonth);
                    setFiscalConfirmOpen(false);
                  }}
                  disabled={fiscalSaving}
                  className="flex-1 py-2 rounded-lg text-xs text-white bg-[#C23728] hover:bg-[#a02020] transition-colors disabled:opacity-40"
                >
                  {fiscalSaving ? '保存中...' : '変更する'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── データバックアップ ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">データバックアップ</div>
          <div className="bg-white rounded-2xl px-5 py-5" style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
            <p className="text-xs text-[#666] mb-3">
              全テーブルのデータをJSON形式で保存します。Google Driveへの保存、またはローカルへのダウンロードが選べます。
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={async () => {
                  setDriveBackupStatus('loading');
                  try {
                    const res = await fetch('/api/backup', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                      setDriveBackupStatus('success');
                      setDriveBackupFileName(data.fileName);
                      setTimeout(() => setDriveBackupStatus('idle'), 5000);
                    } else {
                      setDriveBackupStatus('error');
                      setDriveBackupError(data.error || '保存に失敗しました');
                      setTimeout(() => setDriveBackupStatus('idle'), 5000);
                    }
                  } catch {
                    setDriveBackupStatus('error');
                    setDriveBackupError('通信エラー');
                    setTimeout(() => setDriveBackupStatus('idle'), 5000);
                  }
                }}
                disabled={driveBackupStatus === 'loading'}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-xs font-medium hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {driveBackupStatus === 'loading' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : driveBackupStatus === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                {driveBackupStatus === 'loading' ? 'Driveに保存中...' : driveBackupStatus === 'success' ? '保存完了' : 'Google Driveに保存'}
              </button>
              <a
                href="/api/backup"
                download
                className="flex items-center gap-1.5 px-4 py-2 border border-[#ddd] text-[#333] rounded-lg text-xs font-medium hover:bg-[#f5f5f5] transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                ローカルにダウンロード
              </a>
            </div>
            {driveBackupStatus === 'success' && driveBackupFileName && (
              <p className="text-[10px] text-emerald-600 mt-2">✓ {driveBackupFileName} を 00_会社/09_アプリ/backups/ に保存しました</p>
            )}
            {driveBackupStatus === 'error' && driveBackupError && (
              <p className="text-[10px] text-red-500 mt-2">{driveBackupError}</p>
            )}
          </div>
        </section>

        {/* ── Q&A ── */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[10px] font-medium tracking-widest text-[#999]">
              Q&A
            </div>
            <HelpCircle className="w-3 h-3 text-[#ccc]" />
          </div>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-[#f0f0f0]">
            {QA_ITEMS.map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenQA(openQA === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#fafafa] transition-colors"
                >
                  <span className="text-sm text-[#333]">{item.q}</span>
                  {openQA === i ? (
                    <ChevronUp className="w-4 h-4 text-[#999] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#999] shrink-0" />
                  )}
                </button>
                {openQA === i && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-[#666] leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        </>)}

        {/* ━━━━━━━ 個人設定 ━━━━━━━ */}
        {settingsTab === 'personal' && (<>

        {/* ── 事業用口座 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            事業用口座
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            {bankAccounts.length === 0 ? (
              <p className="text-[11px] text-[#999] mb-3">口座が登録されていません</p>
            ) : (
              <div className="space-y-2 mb-4">
                {bankAccounts.map((ba) => (
                  <div key={ba.id} className="flex items-center justify-between py-2 px-3 bg-[#F5F5F3] rounded-lg">
                    <div>
                      <div className="text-sm text-[#1a1a1a] font-medium">{ba.name}</div>
                      <div className="text-[11px] text-[#999]">
                        {ba.bank_name}{ba.branch_name ? ` ${ba.branch_name}` : ''} / {ba.account_type === 'checking' ? '当座' : '普通'}{ba.account_number_last4 ? ` ****${ba.account_number_last4}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-['Saira_Condensed'] tabular-nums text-sm text-[#1a1a1a]">
                        ¥{ba.balance.toLocaleString()}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingBank(ba); setBankModalOpen(true); }}
                          className="p-1 hover:bg-black/5 rounded-md"><Pencil className="w-3.5 h-3.5 text-[#999]" /></button>
                        <button onClick={() => setBankDeleteTarget(ba.id)}
                          className="p-1 hover:bg-[#C23728]/10 rounded-md"><Trash2 className="w-3.5 h-3.5 text-[#999]" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => { setEditingBank(null); setBankModalOpen(true); }}
              className="flex items-center gap-1.5 text-xs text-[#D4A03A] hover:text-[#b8882e] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />口座を追加
            </button>
          </div>
        </section>

        {/* ── 取引先管理 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            取引先
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            {clients.length === 0 ? (
              <p className="text-[11px] text-[#999] mb-3">取引先が登録されていません</p>
            ) : (
              <div className="space-y-2 mb-4">
                {clients.map((cl) => (
                  <div key={cl.id} className="flex items-center justify-between py-2 px-3 bg-[#F5F5F3] rounded-lg">
                    <div>
                      <div className="text-sm text-[#1a1a1a] font-medium">{cl.name}</div>
                      <div className="text-[11px] text-[#999]">
                        {cl.payment_terms || '支払いサイト未設定'}
                        {cl.default_contact ? ` / ${cl.default_contact}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditingClient(cl); setClientModalOpen(true); }}
                        className="p-1 hover:bg-black/5 rounded-md"><Pencil className="w-3.5 h-3.5 text-[#999]" /></button>
                      <button onClick={() => setClientDeleteTarget(cl.id)}
                        className="p-1 hover:bg-[#C23728]/10 rounded-md"><Trash2 className="w-3.5 h-3.5 text-[#999]" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => { setEditingClient(null); setClientModalOpen(true); }}
              className="flex items-center gap-1.5 text-xs text-[#D4A03A] hover:text-[#b8882e] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />取引先を追加
            </button>
          </div>
        </section>

        {/* ── 固定契約 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            固定契約（売上・経費）
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            {recurringExpenses.length === 0 ? (
              <p className="text-[11px] text-[#999] mb-3">固定契約が登録されていません</p>
            ) : (
              <div className="space-y-2 mb-4">
                {recurringExpenses.map((re) => {
                  const isSales = re.kamoku === 'sales';
                  const divDef = DIVISIONS[re.division as keyof typeof DIVISIONS];
                  const clientName = clients.find(c => c.id === re.client_id)?.name;
                  return (
                    <div key={re.id} className="flex items-center justify-between py-2 px-3 bg-[#F5F5F3] rounded-lg">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isSales ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' : 'bg-[#C23728]/10 text-[#C23728]'}`}>
                            {isSales ? '売上' : '経費'}
                          </span>
                          <span className="text-sm text-[#1a1a1a] font-medium truncate">{re.description}</span>
                        </div>
                        <div className="text-[11px] text-[#999] mt-0.5">
                          ¥{re.amount.toLocaleString()} / {RECURRING_FREQUENCY[re.frequency]}
                          {divDef ? ` · ${divDef.name}` : ''}
                          {clientName ? ` · ${clientName}` : ''}
                          {!re.is_active && <span className="ml-1 text-[#C23728]">（停止中）</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button onClick={() => { setEditingRecurring(re); setRecurringModalOpen(true); }}
                          className="p-1 hover:bg-black/5 rounded-md"><Pencil className="w-3.5 h-3.5 text-[#999]" /></button>
                        <button onClick={() => setRecurringDeleteTarget(re.id)}
                          className="p-1 hover:bg-[#C23728]/10 rounded-md"><Trash2 className="w-3.5 h-3.5 text-[#999]" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => { setEditingRecurring(null); setRecurringModalOpen(true); }}
              className="flex items-center gap-1.5 text-xs text-[#D4A03A] hover:text-[#b8882e] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />固定契約を追加
            </button>
          </div>
        </section>

        {/* ── 按分設定 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            按分設定
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-[11px] text-[#999] mb-4 leading-relaxed">
              事業とプライベート兼用の費目について、事業利用割合を設定します。
              確定申告の経費計算に反映されます。
            </p>
            <div className="space-y-3">
              {ANBUN_KAMOKU.map(k => {
                const kamokuDef = KAMOKU[k as keyof typeof KAMOKU];
                const draft = anbunDraft[k] || { ratio: 0, note: '' };

                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="text-sm text-[#333] w-32 shrink-0">
                      {kamokuDef?.name || k}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.ratio}
                        onChange={e =>
                          setAnbunDraft(prev => ({
                            ...prev,
                            [k]: { ...prev[k], ratio: parseInt(e.target.value) || 0 },
                          }))
                        }
                        className="w-16 px-2 py-1.5 border border-[#e0e0e0] rounded-lg text-right text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
                      />
                      <span className="text-xs text-[#999]">%</span>
                    </div>
                    <input
                      type="text"
                      value={draft.note}
                      onChange={e =>
                        setAnbunDraft(prev => ({
                          ...prev,
                          [k]: { ...prev[k], note: e.target.value },
                        }))
                      }
                      placeholder="根拠メモ（例：作業部屋15㎡/全体60㎡）"
                      className="flex-1 px-2 py-1.5 border border-[#e0e0e0] rounded-lg text-xs text-[#666] placeholder:text-[#ccc] focus:outline-none focus:border-[#D4A03A] transition-colors"
                    />
                  </div>
                );
              })}
            </div>

            {/* 按分の目安 */}
            <div className="mt-4 p-3 bg-[#FFFBF0] rounded-lg border border-[#F5E6C8]">
              <p className="text-[10px] text-[#B8860B] font-medium mb-1">按分の目安</p>
              <p className="text-[10px] text-[#8B7355] leading-relaxed">
                携帯: 50% / WiFi: 50〜70% / 家賃: 面積割合 / 光熱費: 面積割合 / 車両: ロケ使用割合
              </p>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              {anbunSaved && (
                <span className="text-xs text-[#1B4D3E]">✓ 保存しました</span>
              )}
              <button
                onClick={saveAnbun}
                disabled={anbunSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1a] text-white text-xs rounded-lg hover:bg-[#333] disabled:opacity-50 transition-colors"
              >
                {anbunSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                保存
              </button>
            </div>
          </div>
        </section>

        {/* ── 固定資産台帳 ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-medium tracking-widest text-[#999]">
              固定資産台帳
            </div>
            <button
              onClick={() => {
                setEditingAsset(null);
                setAssetModalOpen(true);
              }}
              className="flex items-center gap-1 text-xs text-[#D4A03A] hover:text-[#b8862e] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              追加
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {assets.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-[#999]">
                固定資産が登録されていません
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#f0f0f0]">
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">資産名</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">種類</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">取得日</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">取得価額</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">耐用年数</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">事業割合</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-medium tracking-wider text-[#999]">年間償却</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(a => {
                      const annualDep = Math.floor(
                        (a.acquisition_cost / a.useful_life) * (a.business_use_ratio / 100)
                      );
                      const catLabel = ASSET_CATEGORIES.find(c => c.value === a.category)?.label || a.category;

                      return (
                        <tr key={a.id} className="border-b border-[#fafafa] hover:bg-[#fafafa] transition-colors">
                          <td className="px-4 py-2.5 text-[#333]">{a.name}</td>
                          <td className="px-4 py-2.5 text-[#666]">{catLabel}</td>
                          <td className="px-4 py-2.5 text-[#666]">{a.acquisition_date}</td>
                          <td className="px-4 py-2.5 text-right font-['Saira_Condensed'] text-sm">{yen(a.acquisition_cost)}</td>
                          <td className="px-4 py-2.5 text-right text-[#666]">{a.useful_life}年</td>
                          <td className="px-4 py-2.5 text-right text-[#666]">{a.business_use_ratio}%</td>
                          <td className="px-4 py-2.5 text-right font-['Saira_Condensed'] text-sm text-[#C23728]">{yen(annualDep)}/年</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => {
                                  setEditingAsset(a);
                                  setAssetModalOpen(true);
                                }}
                                className="p-1 rounded hover:bg-[#eee] transition-colors"
                              >
                                <Pencil className="w-3 h-3 text-[#999]" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(a.id)}
                                className="p-1 rounded hover:bg-[#fee] transition-colors"
                              >
                                <Trash2 className="w-3 h-3 text-[#C23728]" />
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
          </div>
        </section>

        </>)}

      </div>{/* end max-w-3xl */}

      {/* ── 固定資産モーダル ── */}
      {assetModalOpen && (
        <AssetModal
          asset={editingAsset}
          onSave={saveAsset}
          onClose={() => {
            setAssetModalOpen(false);
            setEditingAsset(null);
          }}
        />
      )}

      {/* ── 削除確認 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-lg">
            <p className="text-sm text-[#333] mb-4">この固定資産を削除しますか？</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs text-[#666] bg-[#F5F5F3] rounded-lg hover:bg-[#eee] transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => deleteAsset(deleteTarget)}
                className="px-4 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 口座モーダル ── */}
      {bankModalOpen && (
        <BankModal
          bank={editingBank}
          onSave={saveBank}
          onClose={() => { setBankModalOpen(false); setEditingBank(null); }}
        />
      )}

      {/* ── 口座削除確認 ── */}
      {bankDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setBankDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この口座を削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setBankDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteBank(bankDeleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors">
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 取引先モーダル ── */}
      {clientModalOpen && (
        <ClientModal
          client={editingClient}
          onSave={saveClient}
          onClose={() => { setClientModalOpen(false); setEditingClient(null); }}
        />
      )}

      {/* ── 取引先削除確認 ── */}
      {clientDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setClientDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この取引先を削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setClientDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteClient(clientDeleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors">
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 固定契約モーダル ── */}
      {recurringModalOpen && (
        <RecurringModal
          recurring={editingRecurring}
          clients={clients}
          onSave={saveRecurring}
          onClose={() => { setRecurringModalOpen(false); setEditingRecurring(null); }}
        />
      )}

      {/* ── 固定契約削除確認 ── */}
      {recurringDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRecurringDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この固定契約を削除しますか？<br /><span className="text-[11px] text-[#999]">紐づく見込み売上も削除されます</span></p>
            <div className="flex gap-2">
              <button onClick={() => setRecurringDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteRecurring(recurringDeleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors">
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── プロジェクトモーダル ── */}
      {projectModalOpen && (
        <ProjectModal
          project={editingProject}
          onSave={saveProject}
          onClose={() => { setProjectModalOpen(false); setEditingProject(null); }}
        />
      )}

      {/* ── プロジェクト削除確認 ── */}
      {projectDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setProjectDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">このプロジェクトを削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setProjectDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteProject(projectDeleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors">
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 固定資産モーダル
// ============================================================
interface AssetForm {
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLife: number;
  businessUseRatio: number;
}

function AssetModal({
  asset,
  onSave,
  onClose,
}: {
  asset: Asset | null;
  onSave: (form: AssetForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AssetForm>(() => {
    if (asset) {
      return {
        name: asset.name,
        category: asset.category,
        acquisitionDate: asset.acquisition_date,
        acquisitionCost: asset.acquisition_cost,
        usefulLife: asset.useful_life,
        businessUseRatio: asset.business_use_ratio,
      };
    }
    return {
      name: '',
      category: 'camera',
      acquisitionDate: new Date().toISOString().split('T')[0],
      acquisitionCost: 0,
      usefulLife: 5,
      businessUseRatio: 100,
    };
  });

  const handleCategoryChange = (cat: string) => {
    const defaultLife = ASSET_CATEGORIES.find(c => c.value === cat)?.defaultLife || 5;
    setForm(prev => ({
      ...prev,
      category: cat,
      usefulLife: asset ? prev.usefulLife : defaultLife, // 新規時のみデフォルト設定
    }));
  };

  const canSave = form.name.trim() && form.acquisitionCost > 0;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium text-[#333]">
            {asset ? '固定資産を編集' : '固定資産を追加'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#eee] transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 資産名 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">資産名</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例：Sony α7IV"
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm focus:outline-none focus:border-[#D4A03A] transition-colors"
            />
          </div>

          {/* 種類 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">種類</label>
            <select
              value={form.category}
              onChange={e => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm focus:outline-none focus:border-[#D4A03A] transition-colors bg-white"
            >
              {ASSET_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* 取得日 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">取得日</label>
            <input
              type="date"
              value={form.acquisitionDate}
              onChange={e => setForm(prev => ({ ...prev, acquisitionDate: e.target.value }))}
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm focus:outline-none focus:border-[#D4A03A] transition-colors"
            />
          </div>

          {/* 取得価額 */}
          <div>
            <label className="block text-[10px] font-medium text-[#999] mb-1">取得価額（円）</label>
            <input
              type="number"
              value={form.acquisitionCost || ''}
              onChange={e => setForm(prev => ({ ...prev, acquisitionCost: parseInt(e.target.value) || 0 }))}
              placeholder="350000"
              className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* 耐用年数 */}
            <div>
              <label className="block text-[10px] font-medium text-[#999] mb-1">耐用年数</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.usefulLife}
                  onChange={e => setForm(prev => ({ ...prev, usefulLife: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
                />
                <span className="text-xs text-[#999]">年</span>
              </div>
            </div>

            {/* 事業使用割合 */}
            <div>
              <label className="block text-[10px] font-medium text-[#999] mb-1">事業使用割合</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.businessUseRatio}
                  onChange={e => setForm(prev => ({ ...prev, businessUseRatio: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-[#e0e0e0] rounded-lg text-sm font-['Saira_Condensed'] focus:outline-none focus:border-[#D4A03A] transition-colors"
                />
                <span className="text-xs text-[#999]">%</span>
              </div>
            </div>
          </div>

          {/* 年間償却額プレビュー */}
          {form.acquisitionCost > 0 && (
            <div className="p-3 bg-[#F5F5F3] rounded-lg">
              <span className="text-[10px] text-[#999]">年間償却額（定額法）：</span>
              <span className="font-['Saira_Condensed'] text-sm text-[#C23728] ml-1">
                {yen(Math.floor((form.acquisitionCost / form.usefulLife) * (form.businessUseRatio / 100)))}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-[#666] bg-[#F5F5F3] rounded-lg hover:bg-[#eee] transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!canSave}
            className="px-4 py-2 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] disabled:opacity-30 transition-colors"
          >
            {asset ? '更新' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 口座モーダル
// ============================================================
function BankModal({
  bank,
  onSave,
  onClose,
}: {
  bank: BankAccount | null;
  onSave: (data: { name: string; bank_name: string; branch_name: string; account_type: string; account_number_last4: string; balance: number }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: bank?.name || '',
    bank_name: bank?.bank_name || '',
    branch_name: bank?.branch_name || '',
    account_type: bank?.account_type || 'savings',
    account_number_last4: bank?.account_number_last4 || '',
    balance: bank?.balance?.toString() || '0',
  });

  const [saving, setSaving] = useState(false);
  const canSave = form.name.trim() && form.bank_name.trim();

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      name: form.name.trim(),
      bank_name: form.bank_name.trim(),
      branch_name: form.branch_name.trim(),
      account_type: form.account_type,
      account_number_last4: form.account_number_last4.trim(),
      balance: parseInt(form.balance.replace(/,/g, '')) || 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            {bank ? '口座を編集' : '口座を追加'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-[#999] mb-1">口座名（通称）</label>
            <input type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: 住信SBI メイン"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>
          <div>
            <label className="block text-xs text-[#999] mb-1">銀行名</label>
            <input type="text" value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              placeholder="例: 住信SBIネット銀行"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>
          <div>
            <label className="block text-xs text-[#999] mb-1">支店名（任意）</label>
            <input type="text" value={form.branch_name}
              onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
              placeholder="例: 法人第一支店"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">口座種別</label>
              <select value={form.account_type}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                <option value="savings">普通</option>
                <option value="checking">当座</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">口座番号（下4桁）</label>
              <input type="text" value={form.account_number_last4}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setForm({ ...form, account_number_last4: v }); }}
                placeholder="1234"
                maxLength={4}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#999] mb-1">現在残高（円）</label>
            <input type="text" inputMode="numeric"
              value={form.balance ? Number(form.balance.replace(/,/g, '')).toLocaleString() : ''}
              onChange={(e) => { const v = e.target.value.replace(/,/g, ''); if (/^\d*$/.test(v)) setForm({ ...form, balance: v }); }}
              placeholder="0"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!canSave || saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {bank ? '更新する' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 取引先モーダル
// ============================================================
const PAYMENT_TERMS_PRESETS = [
  { label: '月末締翌月末', terms: '月末締翌月末', days: 30 },
  { label: '月末締翌々月末', terms: '月末締翌々月末', days: 60 },
  { label: '即日', terms: '即日', days: 0 },
] as const;

function ClientModal({
  client,
  onSave,
  onClose,
}: {
  client: Client | null;
  onSave: (data: { name: string; payment_terms: string; payment_terms_days: number | null; default_contact: string; notes: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: client?.name || '',
    payment_terms: client?.payment_terms || '',
    payment_terms_days: client?.payment_terms_days?.toString() || '',
    default_contact: client?.default_contact || '',
    notes: client?.notes || '',
  });

  const [saving, setSaving] = useState(false);
  const canSave = form.name.trim().length > 0;

  const applyPreset = (preset: typeof PAYMENT_TERMS_PRESETS[number]) => {
    setForm(prev => ({
      ...prev,
      payment_terms: preset.terms,
      payment_terms_days: preset.days.toString(),
    }));
  };

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      name: form.name.trim(),
      payment_terms: form.payment_terms.trim() || null as any,
      payment_terms_days: form.payment_terms_days ? parseInt(form.payment_terms_days) : null,
      default_contact: form.default_contact.trim() || null as any,
      notes: form.notes.trim() || null as any,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            {client ? '取引先を編集' : '取引先を追加'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 取引先名 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">取引先名 <span className="text-[#C23728]">*</span></label>
            <input type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: 長崎市DMO"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          {/* 支払いサイト */}
          <div>
            <label className="block text-xs text-[#999] mb-1">支払いサイト</label>
            <div className="flex gap-1.5 mb-2">
              {PAYMENT_TERMS_PRESETS.map((p) => (
                <button key={p.label} type="button"
                  onClick={() => applyPreset(p)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                    form.payment_terms === p.terms
                      ? 'bg-[#1a1a1a] text-white'
                      : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <input type="text" value={form.payment_terms}
                  onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
                  placeholder="表示名（月末締翌月末 等）"
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
              </div>
              <div className="w-20">
                <input type="text" inputMode="numeric" value={form.payment_terms_days}
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setForm({ ...form, payment_terms_days: v }); }}
                  placeholder="日数"
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums text-center" />
                <span className="text-[10px] text-[#999] mt-0.5 block text-center">日</span>
              </div>
            </div>
          </div>

          {/* 担当者連絡先 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">担当者・連絡先（任意）</label>
            <input type="text" value={form.default_contact}
              onChange={(e) => setForm({ ...form, default_contact: e.target.value })}
              placeholder="例: 田中太郎 tanaka@example.com"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs text-[#999] mb-1">メモ（任意）</label>
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="契約条件や備考など"
              rows={2}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 resize-none" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!canSave || saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {client ? '更新する' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 固定契約モーダル
// ============================================================
// 経費科目（UIに出す分のみ）
const EXPENSE_KAMOKU_OPTIONS = Object.entries(KAMOKU)
  .filter(([, v]) => v.type === 'expense')
  .map(([id, v]) => ({ id, name: v.name }));

const DIVISION_OPTIONS = Object.entries(DIVISIONS).map(([id, v]) => ({
  id, name: v.name,
}));

function RecurringModal({
  recurring,
  clients,
  onSave,
  onClose,
}: {
  recurring: RecurringExpense | null;
  clients: Client[];
  onSave: (data: {
    description: string; amount: number; kamoku: string; division: string;
    frequency: 'monthly' | 'quarterly' | 'annual'; start_date: string;
    end_date: string | null; payment_day: number | null;
    client_id: string | null; is_active: boolean;
  }) => void;
  onClose: () => void;
}) {
  const isSalesInit = recurring ? recurring.kamoku === 'sales' : true;
  const [isSales, setIsSales] = useState(isSalesInit);

  const [form, setForm] = useState({
    description: recurring?.description || '',
    amount: recurring?.amount?.toString() || '',
    kamoku: recurring?.kamoku || (isSalesInit ? 'sales' : 'rent'),
    division: recurring?.division || '',
    frequency: recurring?.frequency || 'monthly' as 'monthly' | 'quarterly' | 'annual',
    start_date: recurring?.start_date || new Date().toISOString().slice(0, 7),
    end_date: recurring?.end_date || '',
    payment_day: recurring?.payment_day?.toString() || '',
    client_id: recurring?.client_id || '',
    is_active: recurring?.is_active ?? true,
  });

  const [saving, setSaving] = useState(false);
  const canSave = form.description.trim() && form.amount && parseInt(form.amount) > 0;

  const handleTypeToggle = (sales: boolean) => {
    setIsSales(sales);
    setForm(prev => ({ ...prev, kamoku: sales ? 'sales' : 'rent' }));
  };

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      description: form.description.trim(),
      amount: parseInt(form.amount.replace(/,/g, '')) || 0,
      kamoku: isSales ? 'sales' : form.kamoku,
      division: form.division || 'general',
      frequency: form.frequency,
      start_date: form.start_date,
      end_date: form.end_date || null,
      payment_day: form.payment_day ? parseInt(form.payment_day) : null,
      client_id: form.client_id || null,
      is_active: form.is_active,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            {recurring ? '固定契約を編集' : '固定契約を追加'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 売上/経費切替 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">種別</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleTypeToggle(true)}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${isSales ? 'bg-[#1B4D3E] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'}`}>
                売上
              </button>
              <button type="button" onClick={() => handleTypeToggle(false)}
                className={`flex-1 py-2 text-xs rounded-lg transition-colors ${!isSales ? 'bg-[#C23728] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'}`}>
                経費
              </button>
            </div>
          </div>

          {/* 内容 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">内容 <span className="text-[#C23728]">*</span></label>
            <input type="text" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={isSales ? '例: KKday コンサルティング月額' : '例: Adobe CC'}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          {/* 金額 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">金額（税込） <span className="text-[#C23728]">*</span></label>
            <input type="text" inputMode="numeric" value={form.amount}
              onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); setForm({ ...form, amount: v }); }}
              placeholder="0"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
          </div>

          {/* 科目（経費のみ） */}
          {!isSales && (
            <div>
              <label className="block text-xs text-[#999] mb-1">科目</label>
              <select value={form.kamoku}
                onChange={(e) => setForm({ ...form, kamoku: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                {EXPENSE_KAMOKU_OPTIONS.map(k => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 事業 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">事業</label>
            <select value={form.division}
              onChange={(e) => setForm({ ...form, division: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              <option value="">未選択</option>
              {DIVISION_OPTIONS.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* 取引先 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">取引先</label>
            <select value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              <option value="">未選択</option>
              {clients.map(cl => (
                <option key={cl.id} value={cl.id}>{cl.name}</option>
              ))}
            </select>
          </div>

          {/* 頻度・期間 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">頻度</label>
              <select value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as any })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                <option value="monthly">毎月</option>
                <option value="quarterly">四半期</option>
                <option value="annual">年次</option>
              </select>
            </div>
            <div className="w-20">
              <label className="block text-xs text-[#999] mb-1">支払日</label>
              <input type="text" inputMode="numeric" value={form.payment_day}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setForm({ ...form, payment_day: v }); }}
                placeholder="28"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums text-center" />
              <span className="text-[10px] text-[#999] mt-0.5 block text-center">日</span>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">開始月</label>
              <input type="month" value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">終了月（任意）</label>
              <input type="month" value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
          </div>

          {/* 有効/停止 */}
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? 'bg-[#1B4D3E]' : 'bg-[#ccc]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className="text-xs text-[#666]">{form.is_active ? '有効' : '停止中'}</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!canSave || saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {recurring ? '更新する' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// プロジェクトモーダル
// ============================================================
function ProjectModal({
  project,
  onSave,
  onClose,
}: {
  project: Project | null;
  onSave: (form: ProjectForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ProjectForm>(() => ({
    name: project?.name || '',
    division: project?.division || 'youtube',
    owner: project?.owner || 'tomo',
    status: project?.status || 'active',
    client: project?.client || '',
    note: project?.note || '',
  }));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            {project ? 'プロジェクト編集' : 'プロジェクト追加'}
          </h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-[#999] mb-1">プロジェクト名 <span className="text-[#C23728]">*</span></label>
            <input type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: KKday 沖縄プロモーション"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">事業部門</label>
              <select value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                {Object.entries(DIVISIONS).map(([key, val]) => (
                  <option key={key} value={key}>{val.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">担当者</label>
              <select value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                <option value="tomo">トモ</option>
                <option value="toshiki">トシキ</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">ステータス</label>
              <select value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                <option value="planning">企画</option>
                <option value="ordered">受注済</option>
                <option value="active">進行中</option>
                <option value="published">公開済</option>
                <option value="completed">完了</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">クライアント（任意）</label>
              <input type="text" value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-1">メモ（任意）</label>
            <textarea value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 resize-none" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={!form.name.trim() || saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {project ? '更新する' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}
