'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS, RECURRING_FREQUENCY, UNASSIGNED_PROJECT_LABEL } from '@/types/database';
import type { AnbunSetting, Asset, RevenueType, RevenueTypeDivision, ContractType, BusinessDomain, BankAccount, Client, RecurringExpense, Project, EquipmentItem, SyncSource, ExpenseTemplate, RouteLeg, TemplateAllocation, RouteTemplate } from '@/types/database';
import { Plus, Pencil, Trash2, Save, X, Loader2, ChevronDown, ChevronUp, HelpCircle, Cloud, CheckCircle2, RefreshCw, FolderOpen, Camera, StickyNote } from 'lucide-react';
import { OWNER_COLOR_PRESETS } from './HeaderControls';
import TransportFields, { EMPTY_TRANSPORT } from '@/components/TransportFields';
import type { TransportData } from '@/components/TransportFields';
import InvoiceTemplateModal from '@/components/InvoiceTemplateModal';
import RenameReceiptsSection from '@/components/RenameReceiptsSection';

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

const EQUIPMENT_CATEGORIES: Record<string, string> = {
  pc: 'PC',
  camera: 'カメラ',
  lens: 'レンズ',
  audio: '音響',
  monitor: 'モニター',
  furniture: '家具',
  other: 'その他',
};

const EQUIPMENT_STATUS: Record<string, string> = {
  active: '使用中',
  disposed: '廃棄済',
  transferred: '譲渡済',
};

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

// クライアントサイド画像リサイズ（長辺maxPx）
function resizeImage(file: File, maxPx: number): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxPx && height <= maxPx) { resolve(file); return; }
      const scale = maxPx / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(new File([blob!], file.name, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    };
    img.src = URL.createObjectURL(file);
  });
}

interface ProjectForm {
  name: string;
  invoice_display_name: string;
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
  const owner = searchParams.get('owner') || (typeof window !== 'undefined' ? localStorage.getItem('komu10_owner') : null) || 'tomo';
  const effectiveOwner = owner === 'all' ? 'tomo' : owner;
  const ownerLabel = effectiveOwner === 'tomo' ? 'トモ' : 'トシキ';

  const [loading, setLoading] = useState(true);
  const [settingsTab, setSettingsTab] = useState<'common' | 'personal'>('common');
  const [pjOpenDivisions, setPjOpenDivisions] = useState<string[]>([]);
  const [pjVisibleCount, setPjVisibleCount] = useState<Record<string, number>>({});
  const [pjStatusFilter, setPjStatusFilter] = useState<string>('all');
  const PJ_PAGE_SIZE = 5;
  const [ownerColor, setOwnerColor] = useState<string>('');
  const [ownerColorSaving, setOwnerColorSaving] = useState(false);

  // 請求元情報
  const [billingName, setBillingName] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [billingPhone, setBillingPhone] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingSaving, setBillingSaving] = useState(false);

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

  // 事業領域（軸B）— 初期3区分（branding/consulting/own_business）は削除不可
  const [businessDomains, setBusinessDomains] = useState<BusinessDomain[]>([]);
  const [bdEditId, setBdEditId] = useState<string | null>(null);
  const [bdEditName, setBdEditName] = useState('');
  const [bdNewName, setBdNewName] = useState('');
  const [bdNewId, setBdNewId] = useState(''); // 英字ID（自動生成後編集可）
  const [bdSaving, setBdSaving] = useState(false);

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
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null); // v0.6.1: メモ展開
  const [seedLoading, setSeedLoading] = useState(false); // v0.6.1: シードAPI実行中
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [developerOpen, setDeveloperOpen] = useState(false);
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

  // 備品台帳
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [eqFilter, setEqFilter] = useState<'all' | '10000' | '50000'>('all');
  const [eqCatFilter, setEqCatFilter] = useState<string>('all');
  const [eqDeleteTarget, setEqDeleteTarget] = useState<string | null>(null);
  const [eqEditModal, setEqEditModal] = useState<EquipmentItem | null>(null);
  const [eqEditModalOpen, setEqEditModalOpen] = useState(false);

  // 同期ソース
  const [syncSources, setSyncSources] = useState<SyncSource[]>([]);

  // 交通費テンプレート
  const [expenseTemplates, setExpenseTemplates] = useState<ExpenseTemplate[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState<false | 'transport' | 'general'>(false);
  const [editingTemplate, setEditingTemplate] = useState<ExpenseTemplate | null>(null);
  const [templateDeleteTarget, setTemplateDeleteTarget] = useState<string | null>(null);

  // v0.7: ルートテンプレート（交通費の物理経路を独立管理）
  const [routeTemplates, setRouteTemplates] = useState<RouteTemplate[]>([]);
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteTemplate | null>(null);
  const [routeDeleteTarget, setRouteDeleteTarget] = useState<string | null>(null);
  // v0.14.0 Phase 5-C: パッケージ専用モーダル
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  // v0.14.0 Phase 5-E: アーカイブ済みルートテンプレの表示・復元
  const [showArchivedRoutes, setShowArchivedRoutes] = useState(false);
  const [archivedRouteTemplates, setArchivedRouteTemplates] = useState<RouteTemplate[]>([]);
  // v0.14.1: フラッシュメッセージ（保存成功/失敗/重複警告の即時フィードバック）
  const [flash, setFlash] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlash = useCallback((type: 'success' | 'error' | 'warning', message: string) => {
    setFlash({ type, message });
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 2500);
  }, []);
  // v0.14.1: ルート保存の連打ガード（state更新遅延の隙間を埋める）
  const routeSaveInProgressRef = useRef(false);

  // v0.7: 交通費目的マスタ（テンプレ・経費登録で共通利用）
  const [transportPurposes, setTransportPurposes] = useState<{ id: string; name: string }[]>([]);

  // v0.15.0: 内訳タグマスタ（制作費・取材費の内訳）
  const [subCategories, setSubCategories] = useState<{ id: string; key: string; label: string; parent_kamoku: string; display_order: number; is_active: boolean; is_system: boolean }[]>([]);
  const [subCatEditTarget, setSubCatEditTarget] = useState<{ id: string; label: string } | null>(null);
  const [subCatDeleteTarget, setSubCatDeleteTarget] = useState<{ id: string; label: string; is_system: boolean } | null>(null);
  const [subCatAddingFor, setSubCatAddingFor] = useState<'production' | 'torizai' | null>(null);
  const [subCatInputValue, setSubCatInputValue] = useState('');
  // v0.15.5: 削除時の移行付きダイアログ用
  //   usageCount = その項目を使っている取引の件数
  //   mode = 'existing' (既存項目に移行) or 'new' (新規項目作成して移行)
  //   targetKey = 移行先の既存項目key (modeが'existing'時)
  //   newLabel = 新規作成する項目名 (modeが'new'時)
  const [subCatDeleteUsageCount, setSubCatDeleteUsageCount] = useState<number | null>(null);
  const [subCatMigrateMode, setSubCatMigrateMode] = useState<'existing' | 'new'>('existing');
  const [subCatMigrateTargetKey, setSubCatMigrateTargetKey] = useState<string>('');
  const [subCatMigrateNewLabel, setSubCatMigrateNewLabel] = useState<string>('');
  const [subCatDeleteInProgress, setSubCatDeleteInProgress] = useState(false);

  // v0.8: 請求書汎用テンプレ
  const [invoiceTemplates, setInvoiceTemplates] = useState<any[]>([]);
  const [invoiceTemplateItems, setInvoiceTemplateItems] = useState<Record<string, any[]>>({});
  const [invTplModalOpen, setInvTplModalOpen] = useState(false);
  const [editingInvTpl, setEditingInvTpl] = useState<any | null>(null);
  const [invTplDeleteTarget, setInvTplDeleteTarget] = useState<string | null>(null);

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

      // プロフィール（テーマ + 背景色 + 請求元情報）
      const { data: profileData } = await supabase
        .from('profiles')
        .select('theme, fiscal_start_month, owner_color, business_name, postal_code, address, phone, email')
        .eq('user_key', effectiveOwner)
        .single();

      // 契約区分
      const { data: ctData } = await supabase
        .from('contract_types')
        .select('*')
        .order('sort_order');

      // 事業領域（軸B）
      const { data: bdData } = await supabase
        .from('business_domains')
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
        .order('client_number');

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

      // 備品台帳
      const { data: eqData } = await supabase
        .from('equipment_items')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('created_at', { ascending: false });

      // 同期ソース
      const { data: ssData } = await supabase
        .from('sync_sources')
        .select('*')
        .order('created_at');

      // 交通費テンプレート
      const { data: tmplData } = await supabase
        .from('expense_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('use_count', { ascending: false });

      // v0.7: ルートテンプレート
      // v0.14.0: archived_at IS NULL のみ取得（Phase 5 でアーカイブ表示トグル実装予定）
      const { data: routeData } = await supabase
        .from('route_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .is('archived_at', null)
        .order('use_count', { ascending: false });

      // v0.7: 交通費目的マスタ
      const { data: purposeData } = await supabase
        .from('transport_purposes')
        .select('id, name')
        .order('sort_order');

      // v0.15.0: 内訳タグマスタ（制作費・取材費の内訳）
      const { data: subCatData } = await supabase
        .from('sub_categories' as any)
        .select('*')
        .order('display_order', { ascending: true });

      // v0.8: 請求書汎用テンプレ + 明細
      const { data: invTplData } = await supabase
        .from('invoice_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('use_count', { ascending: false });
      const invTplIds = (invTplData || []).map((t: any) => t.id);
      const { data: invTplItemsData } = invTplIds.length > 0
        ? await supabase
            .from('invoice_template_items')
            .select('*')
            .in('template_id', invTplIds)
            .order('sort_order')
        : { data: [] as any[] };
      const itemsMap: Record<string, any[]> = {};
      for (const it of (invTplItemsData || [])) {
        if (!itemsMap[it.template_id]) itemsMap[it.template_id] = [];
        itemsMap[it.template_id].push(it);
      }

      setAnbunSettings(anbunData || []);
      setAssets(assetData || []);
      if (profileData) {
        setCurrentTheme(profileData.theme || 'light');
        setFiscalStartMonth((profileData as any).fiscal_start_month || 1);
        setOwnerColor((profileData as any).owner_color || '');
        setBillingName((profileData as any).business_name || '');
        setBillingPostalCode((profileData as any).postal_code || '');
        setBillingAddress((profileData as any).address || '');
        setBillingPhone((profileData as any).phone || '');
        setBillingEmail((profileData as any).email || '');
      }
      setContractTypes(ctData || []);
      setBusinessDomains(bdData || []);
      setRevenueTypes(rtData || []);
      setRevenueTypeDivisions(rtdData || []);
      setBankAccounts(bankData || []);
      setClients(clientData || []);
      setRecurringExpenses(recurringData || []);
      setProjects(projectData || []);
      setEquipmentItems(eqData || []);
      setSyncSources(ssData || []);
      setExpenseTemplates((tmplData || []).map((t: any) => ({
        ...t,
        route_legs: Array.isArray(t.route_legs) ? t.route_legs : [],
      })));
      setRouteTemplates((routeData || []).map((r: any) => ({
        ...r,
        route_legs: Array.isArray(r.route_legs) ? r.route_legs : [],
      })));
      setTransportPurposes(purposeData || []);
      setSubCategories((subCatData as any) || []);
      setInvoiceTemplates(invTplData || []);
      setInvoiceTemplateItems(itemsMap);

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

  // v0.14.0 Phase 5-E: アーカイブ表示ON時、またはオーナー切替時にアーカイブ一覧を取得
  useEffect(() => {
    if (showArchivedRoutes) {
      fetchArchivedRoutes();
    } else {
      setArchivedRouteTemplates([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedRoutes, effectiveOwner]);

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
  // 事業領域（軸B） CRUD
  // - 初期3区分（branding/consulting/own_business）は削除不可
  // - 新規追加時はID自動連番（domain_N）+ ユーザー編集可
  // ============================================================
  const PROTECTED_DOMAIN_IDS = ['branding', 'consulting', 'own_business'] as const;
  const isProtectedDomain = (id: string) => (PROTECTED_DOMAIN_IDS as readonly string[]).includes(id);

  // 連番ID提案（domain_4, domain_5, ...）
  const suggestNextDomainId = (): string => {
    const existingNumbers = businessDomains
      .map(bd => bd.id.match(/^domain_(\d+)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map(m => parseInt(m[1], 10));
    // 初期3区分（branding/consulting/own_business）を含めて4から開始
    const baseCount = businessDomains.length + 1;
    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    return `domain_${Math.max(baseCount, maxNumber + 1)}`;
  };

  // 新規追加フォームを開く時にID自動セット
  const openBdNewForm = () => {
    if (!bdNewId) {
      setBdNewId(suggestNextDomainId());
    }
  };

  const addBusinessDomain = async () => {
    if (!supabase) return;
    const name = bdNewName.trim();
    const id = bdNewId.trim();
    if (!name || !id) return;
    // ID形式チェック（英数字とアンダースコアのみ）
    if (!/^[a-z0-9_]+$/i.test(id)) {
      alert('IDは英数字とアンダースコアのみ使えます（例: marketing_support）');
      return;
    }
    // 重複チェック
    if (businessDomains.some(bd => bd.id === id)) {
      alert(`ID「${id}」は既に使われています。別のIDにしてください。`);
      return;
    }
    setBdSaving(true);
    try {
      const maxSort = businessDomains.length > 0 ? Math.max(...businessDomains.map(b => b.sort_order)) : 0;
      await supabase.from('business_domains').insert({
        id,
        name,
        sort_order: maxSort + 1,
      });
      setBdNewName('');
      setBdNewId('');
      const { data } = await supabase.from('business_domains').select('*').order('sort_order');
      setBusinessDomains(data || []);
    } catch (err) {
      console.error('事業領域追加エラー:', err);
      alert('事業領域の追加に失敗しました');
    } finally {
      setBdSaving(false);
    }
  };

  const startEditBusinessDomain = (bd: BusinessDomain) => {
    setBdEditId(bd.id);
    setBdEditName(bd.name);
  };

  const updateBusinessDomain = async (id: string) => {
    if (!supabase || !bdEditName.trim()) return;
    setBdSaving(true);
    try {
      await supabase.from('business_domains').update({ name: bdEditName.trim() }).eq('id', id);
      setBdEditId(null);
      const { data } = await supabase.from('business_domains').select('*').order('sort_order');
      setBusinessDomains(data || []);
    } catch (err) { console.error('事業領域更新エラー:', err); }
    finally { setBdSaving(false); }
  };

  const deleteBusinessDomain = async (id: string) => {
    if (!supabase) return;
    if (isProtectedDomain(id)) {
      alert('初期3区分は削除できません（名前の編集のみ可能）');
      return;
    }
    if (!confirm('この事業領域を削除しますか？\n（紐付いた売上の事業領域は空欄になります）')) return;
    try {
      await supabase.from('business_domains').delete().eq('id', id);
      const { data } = await supabase.from('business_domains').select('*').order('sort_order');
      setBusinessDomains(data || []);
    } catch (err) { console.error('事業領域削除エラー:', err); }
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
    name: string; bank_name: string; bank_code: string; branch_name: string; branch_code: string;
    account_type: string; account_number: string; account_number_last4: string;
    account_holder_name: string; account_holder_kana: string; balance: number;
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
  const refreshEquipmentItems = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('equipment_items').select('*').eq('owner', effectiveOwner).order('created_at', { ascending: false });
    setEquipmentItems(data || []);
  };

  const saveEquipmentEdit = async (id: string, updates: { category?: string; maker?: string; serial?: string; business_ratio?: number; warranty_date?: string | null; note?: string | null; status?: string }) => {
    if (!supabase) return;
    try {
      await supabase.from('equipment_items').update(updates).eq('id', id);
      await refreshEquipmentItems();
      setEqEditModalOpen(false);
      setEqEditModal(null);
    } catch (err) { console.error('備品更新エラー:', err); }
  };

  const deleteEquipmentItem = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase.from('equipment_items').delete().eq('id', id);
      setEqDeleteTarget(null);
      await refreshEquipmentItems();
    } catch (err) { console.error('備品削除エラー:', err); }
  };

  const refreshClients = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('clients').select('*').eq('owner', effectiveOwner).order('client_number');
    setClients(data || []);
  };

  const saveClient = async (data: {
    name: string; short_name: string | null; postal_code: string | null;
    address: string | null; contact_name: string | null; contact_email: string | null;
    payment_terms: string | null; notes: string | null; is_active: boolean;
    // v0.6.0 請求書管理v2
    withholding_tax: boolean;
    withholding_basis: string;
    header_amount_type: string;
    fee_burden: string;
    payment_terms_type: string;
    client_number?: string;
  }) => {
    if (!supabase) return;
    try {
      if (editingClient) {
        const { client_number: _cn, ...updateData } = data;
        const { error } = await supabase.from('clients').update(updateData).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        // 新規: client_number自動採番（オーナー内最大+1、3桁ゼロ埋め）
        const { data: existing } = await supabase
          .from('clients').select('client_number').eq('owner', effectiveOwner)
          .order('client_number', { ascending: false }).limit(1);
        const maxNum = existing?.[0] ? parseInt(existing[0].client_number) : 0;
        const nextNum = String(maxNum + 1).padStart(3, '0');
        const { error } = await supabase.from('clients').insert({
          ...data, owner: effectiveOwner, client_number: nextNum,
        });
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

  // v0.15.0: 内訳タグ CRUD
  const refreshSubCategories = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('sub_categories' as any)
      .select('*')
      .order('display_order', { ascending: true });
    setSubCategories((data as any) || []);
  };

  const handleSubCatAdd = async (parent: 'production' | 'torizai', rawLabel: string) => {
    if (!supabase) return;
    const label = rawLabel.trim();
    if (!label) return;
    if (label.length > 20) { alert('20文字以内で入力してください'); return; }
    const dup = subCategories.find(s => s.parent_kamoku === parent && s.label === label);
    if (dup) { alert(`「${label}」と同じ名前の項目が既にあります`); return; }
    const prefix = parent === 'production' ? 'prod_custom_' : 'tori_custom_';
    const newKey = prefix + Date.now().toString().slice(-8);
    const sameGroup = subCategories.filter(s => s.parent_kamoku === parent);
    const maxUserOrder = Math.max(
      0,
      ...sameGroup.filter(s => s.display_order < 999).map(s => s.display_order)
    );
    const newOrder = maxUserOrder + 10;
    const { error } = await supabase
      .from('sub_categories' as any)
      .insert({
        key: newKey,
        label,
        parent_kamoku: parent,
        display_order: newOrder,
        is_active: true,
        is_system: false,
      });
    if (error) { alert('追加に失敗しました: ' + error.message); return; }
    await refreshSubCategories();
    setSubCatAddingFor(null);
    setSubCatInputValue('');
  };

  const handleSubCatRename = async (id: string, rawLabel: string) => {
    if (!supabase) return;
    const label = rawLabel.trim();
    if (!label) return;
    if (label.length > 20) { alert('20文字以内で入力してください'); return; }
    const target = subCategories.find(s => s.id === id);
    if (!target) return;
    const dup = subCategories.find(
      s => s.id !== id && s.parent_kamoku === target.parent_kamoku && s.label === label
    );
    if (dup) { alert(`「${label}」と同じ名前の項目が既にあります`); return; }
    const { error } = await supabase
      .from('sub_categories' as any)
      .update({ label })
      .eq('id', id);
    if (error) { alert('更新に失敗しました: ' + error.message); return; }
    await refreshSubCategories();
    setSubCatEditTarget(null);
  };

  // v0.15.5: 削除アイコン押下時のハンドラ。件数カウント→適切なダイアログ表示へ
  const handleSubCatDeleteClick = async (id: string, label: string, is_system: boolean) => {
    if (!supabase) return;
    const target = subCategories.find(s => s.id === id);
    if (!target) return;
    // 該当 key を使っている transactions の件数をカウント
    const { count, error } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('sub_category', target.key);
    if (error) {
      alert('使用状況の確認に失敗しました: ' + error.message);
      return;
    }
    const usageCount = count ?? 0;
    // 移行先の初期選択（同じ parent_kamoku の他のactive項目の先頭）
    const candidates = subCategories.filter(
      s => s.parent_kamoku === target.parent_kamoku && s.id !== id && s.is_active
    );
    setSubCatMigrateTargetKey(candidates[0]?.key ?? '');
    setSubCatMigrateMode('existing');
    setSubCatMigrateNewLabel('');
    setSubCatDeleteUsageCount(usageCount);
    setSubCatDeleteTarget({ id, label, is_system });
  };

  // v0.15.5: 0件削除 or 移行付き削除を実行
  const handleSubCatDeleteConfirm = async () => {
    if (!supabase || !subCatDeleteTarget) return;
    const target = subCategories.find(s => s.id === subCatDeleteTarget.id);
    if (!target) return;
    setSubCatDeleteInProgress(true);
    try {
      const usageCount = subCatDeleteUsageCount ?? 0;

      if (usageCount === 0) {
        // 0件時: そのまま論理削除
        const { error } = await supabase
          .from('sub_categories' as any)
          .update({ is_active: false })
          .eq('id', target.id);
        if (error) throw new Error('削除に失敗しました: ' + error.message);
      } else {
        // 1件以上: 移行処理
        let destKey: string;

        if (subCatMigrateMode === 'existing') {
          if (!subCatMigrateTargetKey) {
            throw new Error('移行先の項目を選択してください');
          }
          destKey = subCatMigrateTargetKey;
        } else {
          // 新規項目を作って移行
          const newLabel = subCatMigrateNewLabel.trim();
          if (!newLabel) { throw new Error('新しい項目名を入力してください'); }
          if (newLabel.length > 20) { throw new Error('20文字以内で入力してください'); }
          const dup = subCategories.find(
            s => s.parent_kamoku === target.parent_kamoku && s.label === newLabel && s.is_active
          );
          if (dup) {
            throw new Error(`「${newLabel}」と同じ名前の項目が既にあります`);
          }
          const prefix = target.parent_kamoku === 'production' ? 'prod_custom_' : 'tori_custom_';
          const newKey = prefix + Date.now().toString().slice(-8);
          const sameGroup = subCategories.filter(s => s.parent_kamoku === target.parent_kamoku);
          const maxUserOrder = Math.max(
            0,
            ...sameGroup.filter(s => s.display_order < 999).map(s => s.display_order)
          );
          const newOrder = maxUserOrder + 10;
          const { error: insertErr } = await supabase
            .from('sub_categories' as any)
            .insert({
              key: newKey,
              label: newLabel,
              parent_kamoku: target.parent_kamoku,
              display_order: newOrder,
              is_active: true,
              is_system: false,
            });
          if (insertErr) throw new Error('新項目の作成に失敗しました: ' + insertErr.message);
          destKey = newKey;
        }

        // transactions の sub_category を一括UPDATE
        const { error: updateErr } = await supabase
          .from('transactions')
          .update({ sub_category: destKey } as any)
          .eq('sub_category', target.key);
        if (updateErr) throw new Error('既存取引の移行に失敗しました: ' + updateErr.message);

        // 元の項目を論理削除
        const { error: deleteErr } = await supabase
          .from('sub_categories' as any)
          .update({ is_active: false })
          .eq('id', target.id);
        if (deleteErr) throw new Error('項目の削除に失敗しました: ' + deleteErr.message);
      }

      await refreshSubCategories();
      setSubCatDeleteTarget(null);
      setSubCatDeleteUsageCount(null);
      setSubCatMigrateTargetKey('');
      setSubCatMigrateNewLabel('');
      setSubCatMigrateMode('existing');
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSubCatDeleteInProgress(false);
    }
  };

  const handleSubCatRestore = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase
      .from('sub_categories' as any)
      .update({ is_active: true })
      .eq('id', id);
    if (error) { alert('復元に失敗しました: ' + error.message); return; }
    await refreshSubCategories();
  };

  // v0.6.1: シードデータ投入/削除
  const handleSeedInsert = async () => {
    if (seedLoading) return;
    if (!confirm('検証用のダミー取引先2件・請求書2件を投入します。既存のシードデータは上書きされます。よろしいですか？')) return;
    setSeedLoading(true);
    setSeedMsg(null);
    try {
      const res = await fetch('/api/dev/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: effectiveOwner }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '投入失敗');
      setSeedMsg(`✓ 投入完了: 取引先${data.summary.clients}件・請求書${data.summary.invoices}件・明細${data.summary.invoice_items}件`);
      await refreshClients();
    } catch (err) {
      setSeedMsg(`✕ 失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSeedLoading(false);
    }
  };

  const handleSeedDelete = async () => {
    if (seedLoading) return;
    if (!confirm('シードタグ __SEED__ が付いた取引先・請求書・明細・関連仕訳を全て削除します。本番データは影響を受けません。実行しますか？')) return;
    setSeedLoading(true);
    setSeedMsg(null);
    try {
      const res = await fetch('/api/dev/seed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: effectiveOwner }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '削除失敗');
      setSeedMsg(`✓ 削除完了: 取引先${data.summary.clients}件・請求書${data.summary.invoices}件・明細${data.summary.invoice_items}件・関連仕訳${data.summary.transactions}件`);
      await refreshClients();
    } catch (err) {
      setSeedMsg(`✕ 失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSeedLoading(false);
    }
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
          invoice_display_name: form.invoice_display_name.trim() || null,
          division: form.division,
          owner: form.owner,
          status: form.status,
          client: form.client || null,
          note: form.note || null,
        }).eq('id', editingProject.id);
      } else {
        await supabase.from('projects').insert({
          name: form.name,
          invoice_display_name: form.invoice_display_name.trim() || null,
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

  const saveTemplate = async (form: {
    name: string;
    template_type: 'transport' | 'general';
    kamoku?: string;
    store?: string;
    description?: string;
    amount?: number;
    payment_method?: string;
    transport_purpose?: string | null;
    allocations: TemplateAllocation[];
  }) => {
    if (!supabase) return;
    try {
      if (form.template_type === 'transport') {
        // v0.7: 業務メタのみ保存（区間は route_templates で独立管理）
        if (editingTemplate) {
          await supabase.from('expense_templates').update({
            name: form.name,
            description: form.description || '',
            payment_method: form.payment_method || 'personal',
            transport_purpose: form.transport_purpose || null,
            allocations: form.allocations,
            updated_at: new Date().toISOString(),
          }).eq('id', editingTemplate.id);
        } else {
          await supabase.from('expense_templates').insert({
            owner: effectiveOwner,
            name: form.name,
            template_type: 'transport',
            kamoku: 'transport',
            description: form.description || '',
            route_legs: [],
            green_amount: 0,
            amount: 0,
            payment_method: form.payment_method || 'personal',
            transport_purpose: form.transport_purpose || null,
            allocations: form.allocations,
            use_count: 0,
          });
        }
      } else {
        // 汎用テンプレート
        if (editingTemplate) {
          await supabase.from('expense_templates').update({
            name: form.name,
            kamoku: form.kamoku || 'misc',
            store: form.store || '',
            description: form.description || '',
            amount: form.amount || 0,
            payment_method: form.payment_method || 'personal',
            allocations: form.allocations,
            updated_at: new Date().toISOString(),
          }).eq('id', editingTemplate.id);
        } else {
          await supabase.from('expense_templates').insert({
            owner: effectiveOwner,
            name: form.name,
            template_type: 'general',
            kamoku: form.kamoku || 'misc',
            store: form.store || '',
            description: form.description || '',
            amount: form.amount || 0,
            route_legs: [],
            green_amount: 0,
            payment_method: form.payment_method || 'personal',
            allocations: form.allocations,
            use_count: 0,
          });
        }
      }
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      const { data: tmplData } = await supabase
        .from('expense_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('use_count', { ascending: false });
      setExpenseTemplates((tmplData || []).map((t: any) => ({
        ...t,
        route_legs: Array.isArray(t.route_legs) ? t.route_legs : [],
      })));
    } catch (err) { console.error('テンプレート保存エラー:', err); }
  };

  const deleteTemplate = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase.from('expense_templates').delete().eq('id', id);
      setTemplateDeleteTarget(null);
      const { data: tmplData } = await supabase
        .from('expense_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .order('use_count', { ascending: false });
      setExpenseTemplates((tmplData || []).map((t: any) => ({
        ...t,
        route_legs: Array.isArray(t.route_legs) ? t.route_legs : [],
      })));
    } catch (err) { console.error('テンプレート削除エラー:', err); }
  };

  // v0.7: ルートテンプレート CRUD
  const saveRouteTemplate = async (form: {
    name: string;
    direction: 'bidirectional' | 'oneway_only';
    route_legs: RouteLeg[];
  }) => {
    if (!supabase) return;
    // v0.14.1: 連打ガード（state更新遅延の隙間を埋める）
    if (routeSaveInProgressRef.current) return;
    routeSaveInProgressRef.current = true;
    try {
      const total = form.route_legs.reduce((s, l) => s + (l.amount || 0), 0);
      // v0.14.1: 中身が同じレコードの重複チェック（新規作成時 / 編集時ともに）
      // legs を正規化して JSON 比較（編集時は自分自身を除外）
      // v0.14.5: RouteLeg 型が database.ts と TransportFields.tsx で二重定義されており、
      // carrier/green は後者のみ。ここは実行時の中身をそのまま見るため any 経由で扱う
      const normalizeLegs = (legs: any[]) =>
        (legs || []).map((l: any) => ({
          from: (l.from || '').trim(),
          to: (l.to || '').trim(),
          method: l.method || '電車',
          carrier: (l.carrier || '').trim(),
          amount: Number(l.amount) || 0,
          green: !!l.green,
        }));
      const candidateNormalized = JSON.stringify(normalizeLegs(form.route_legs));
      const candidateName = form.name.trim();
      const duplicate = routeTemplates.find(r => {
        if (r.template_kind === 'roundtrip_package') return false; // パッケージは別扱い
        if (editingRoute && r.id === editingRoute.id) return false; // 編集中の自分を除外
        // 片道テンプレの paired_reverse 相手は内容が"逆順"なので正規化すれば違う → 重複判定対象外
        const existingNormalized = JSON.stringify(normalizeLegs(r.route_legs || []));
        return r.name.trim() === candidateName && existingNormalized === candidateNormalized;
      });
      if (duplicate) {
        showFlash('warning', '同じ名前・同じ内容のルートが既にあります');
        return;
      }

      if (editingRoute) {
        // 編集時: 既存の template_kind / paired_reverse_id を維持
        await supabase.from('route_templates').update({
          name: form.name,
          direction: form.direction, // DEPRECATED だが互換のため保持
          route_legs: form.route_legs,
          amount: total, // DEPRECATED だが互換のため保持
          updated_at: new Date().toISOString(),
        }).eq('id', editingRoute.id);

        // v0.14.0 Phase 5-D: ペア同期ロジック
        // 片道テンプレ編集時、paired_reverse_id で紐づくペアBの legs を自動逆順同期
        // （名前は独立・同期しない —— session36 仕様）
        if (editingRoute.template_kind !== 'roundtrip_package' && editingRoute.paired_reverse_id) {
          const reversedLegs = form.route_legs
            .slice()
            .reverse()
            .map((l: any) => ({
              from: l.to || '',
              to: l.from || '',
              method: l.method || '電車',
              carrier: l.carrier || '',
              amount: Number(l.amount) || 0,
              green: !!l.green,
            }));
          const reverseTotal = reversedLegs.reduce((s: number, l: any) => s + (l.amount || 0), 0);
          await supabase.from('route_templates').update({
            route_legs: reversedLegs,
            amount: reverseTotal, // DEPRECATED
            updated_at: new Date().toISOString(),
          }).eq('id', editingRoute.paired_reverse_id);
        }
      } else {
        // 新規作成: v0.14.0 仕様D で template_kind='oneway' 明示
        await supabase.from('route_templates').insert({
          owner: effectiveOwner,
          name: form.name,
          direction: form.direction, // DEPRECATED
          route_legs: form.route_legs,
          amount: total, // DEPRECATED
          use_count: 0,
          sort_order: 0,
          template_kind: 'oneway',
        });
      }
      setRouteModalOpen(false);
      setEditingRoute(null);
      const { data: routeData } = await supabase
        .from('route_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .is('archived_at', null)
        .order('use_count', { ascending: false });
      setRouteTemplates((routeData || []).map((r: any) => ({
        ...r,
        route_legs: Array.isArray(r.route_legs) ? r.route_legs : [],
      })));
      // v0.14.1: 成功フラッシュ
      showFlash('success', editingRoute ? 'ルートを更新しました' : 'ルートを登録しました');
    } catch (err) {
      console.error('ルートテンプレート保存エラー:', err);
      showFlash('error', '保存に失敗しました');
    } finally {
      routeSaveInProgressRef.current = false;
    }
  };

  // v0.14.0 Phase 5-B: 既存片道テンプレに逆順ペアを作成（救済ボタン）
  const createReversePair = async (route: RouteTemplate) => {
    if (!supabase || route.template_kind === 'roundtrip_package') return;
    if (route.paired_reverse_id) {
      // 既にペアあり → スキップ
      console.warn('このテンプレは既にペアを持っています:', route.id);
      return;
    }
    try {
      // 逆順legs生成
      const reversedLegs = (route.route_legs || [])
        .slice()
        .reverse()
        .map((l: any) => ({
          from: l.to || '',
          to: l.from || '',
          method: l.method || '電車',
          carrier: l.carrier || '',
          amount: Number(l.amount) || 0,
          green: !!l.green,
        }));
      // 逆順名生成（A→B → B→A、括弧補足保持）
      const generateReverseName = (name: string): string => {
        const match = name.match(/^(.+?)([\s　]*[（(].+[）)])?$/);
        const base = match?.[1] || name;
        const suffix = match?.[2] || '';
        const separators = /(→|->|⇒|⇄|⇔)/;
        const parts = base.split(separators);
        if (parts.length === 3) {
          const [from, sep, to] = parts;
          return `${to.trim()}${sep}${from.trim()}${suffix}`;
        }
        return `逆順 ${name}`;
      };
      const reverseName = generateReverseName(route.name);
      const reverseTotal = reversedLegs.reduce((s: number, l: any) => s + (l.amount || 0), 0);

      // ペアBを insert
      const { data: bData, error: bErr } = await supabase
        .from('route_templates')
        .insert({
          owner: route.owner,
          name: reverseName,
          direction: 'oneway_only',
          route_legs: reversedLegs,
          amount: reverseTotal,
          use_count: 0,
          sort_order: 0,
          template_kind: 'oneway',
          paired_reverse_id: route.id,
        })
        .select('id')
        .single();
      if (bErr || !bData) {
        console.error('逆順ペア作成エラー:', bErr);
        return;
      }
      // A の paired_reverse_id も更新
      await supabase
        .from('route_templates')
        .update({ paired_reverse_id: bData.id })
        .eq('id', route.id);

      // 一覧再取得
      const { data: routeData } = await supabase
        .from('route_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .is('archived_at', null)
        .order('use_count', { ascending: false });
      setRouteTemplates((routeData || []).map((r: any) => ({
        ...r,
        route_legs: Array.isArray(r.route_legs) ? r.route_legs : [],
      })));
    } catch (err) { console.error('逆順ペア作成エラー:', err); }
  };

  // v0.14.0 Phase 5-C: パッケージテンプレ保存（新規 or 編集）
  const savePackageTemplate = async (form: {
    name: string;
    outbound_route_id: string;
    return_route_id: string;
  }): Promise<boolean> => {
    if (!supabase) return false;
    if (!form.name.trim() || !form.outbound_route_id || !form.return_route_id) return false;
    // v0.14.1: 連打ガード
    if (routeSaveInProgressRef.current) return false;
    routeSaveInProgressRef.current = true;
    try {
      // v0.14.1: 重複チェック（同じ往路・復路の組み合わせ+同名称のパッケージ）
      const candidateName = form.name.trim();
      const duplicate = routeTemplates.find(r => {
        if (r.template_kind !== 'roundtrip_package') return false;
        if (editingRoute && r.id === editingRoute.id) return false; // 自分自身除外
        return r.name.trim() === candidateName
          && r.outbound_route_id === form.outbound_route_id
          && r.return_route_id === form.return_route_id;
      });
      if (duplicate) {
        showFlash('warning', '同じ名前・同じ往路復路のパッケージが既にあります');
        return false;
      }

      if (editingRoute && editingRoute.template_kind === 'roundtrip_package') {
        // 編集
        await supabase.from('route_templates').update({
          name: form.name.trim(),
          outbound_route_id: form.outbound_route_id,
          return_route_id: form.return_route_id,
          updated_at: new Date().toISOString(),
        }).eq('id', editingRoute.id);
      } else {
        // 新規
        await supabase.from('route_templates').insert({
          owner: effectiveOwner,
          name: form.name.trim(),
          direction: 'bidirectional', // DEPRECATED
          route_legs: [],
          amount: 0, // DEPRECATED
          use_count: 0,
          sort_order: 0,
          template_kind: 'roundtrip_package',
          outbound_route_id: form.outbound_route_id,
          return_route_id: form.return_route_id,
        });
      }
      setPackageModalOpen(false);
      setEditingRoute(null);
      const { data: routeData } = await supabase
        .from('route_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .is('archived_at', null)
        .order('use_count', { ascending: false });
      setRouteTemplates((routeData || []).map((r: any) => ({
        ...r,
        route_legs: Array.isArray(r.route_legs) ? r.route_legs : [],
      })));
      // v0.14.1: 成功フラッシュ
      showFlash('success', editingRoute && editingRoute.template_kind === 'roundtrip_package'
        ? 'パッケージを更新しました'
        : 'パッケージを登録しました');
      return true;
    } catch (err) {
      console.error('パッケージテンプレ保存エラー:', err);
      showFlash('error', '保存に失敗しました');
      return false;
    } finally {
      routeSaveInProgressRef.current = false;
    }
  };

  const deleteRouteTemplate = async (id: string) => {
    if (!supabase) return;
    try {
      // v0.14.0: 物理削除から論理削除（アーカイブ）に変更
      // archived_at に現在時刻をセットすることで一覧・セレクトから非表示
      // パッケージで参照中でも問題なし（参照先がアーカイブ済みの場合、パッケージ編集時に警告表示される：Phase 5）
      await supabase
        .from('route_templates')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      setRouteDeleteTarget(null);
      const { data: routeData } = await supabase
        .from('route_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .is('archived_at', null)
        .order('use_count', { ascending: false });
      setRouteTemplates((routeData || []).map((r: any) => ({
        ...r,
        route_legs: Array.isArray(r.route_legs) ? r.route_legs : [],
      })));
      // v0.14.0 Phase 5-E: アーカイブ一覧が開いていれば再取得
      if (showArchivedRoutes) {
        await fetchArchivedRoutes();
      }
    } catch (err) { console.error('ルートテンプレートアーカイブエラー:', err); }
  };

  // v0.14.0 Phase 5-E: アーカイブ済みルートテンプレの取得
  const fetchArchivedRoutes = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('route_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });
      setArchivedRouteTemplates((data || []).map((r: any) => ({
        ...r,
        route_legs: Array.isArray(r.route_legs) ? r.route_legs : [],
      })));
    } catch (err) { console.error('アーカイブ取得エラー:', err); }
  };

  // v0.14.0 Phase 5-E: アーカイブ済みルートテンプレを復元（archived_at を NULL に戻す）
  const restoreRouteTemplate = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase
        .from('route_templates')
        .update({ archived_at: null })
        .eq('id', id);
      // アクティブ一覧を再取得
      const { data: routeData } = await supabase
        .from('route_templates')
        .select('*')
        .eq('owner', effectiveOwner)
        .is('archived_at', null)
        .order('use_count', { ascending: false });
      setRouteTemplates((routeData || []).map((r: any) => ({
        ...r,
        route_legs: Array.isArray(r.route_legs) ? r.route_legs : [],
      })));
      // アーカイブ一覧も再取得
      await fetchArchivedRoutes();
    } catch (err) { console.error('ルートテンプレート復元エラー:', err); }
  };

  // v0.8: 請求書汎用テンプレ CRUD
  const saveInvoiceTemplate = async (form: {
    id?: string;
    name: string;
    subject: string;
    payment_terms: string;
    notes: string;
    bank_account_id: string | null;
    withholding_tax: boolean;
    withholding_basis: string;
    header_amount_type: string;
    fee_burden: string;
    items: Array<{ id?: string; description: string; quantity: number; unit_price: number; sort_order: number }>;
  }) => {
    if (!supabase || !form.name.trim()) return;
    try {
      let templateId = form.id;
      const payload: any = {
        owner: effectiveOwner,
        name: form.name.trim(),
        subject: form.subject || null,
        payment_terms: form.payment_terms || null,
        notes: form.notes || null,
        bank_account_id: form.bank_account_id || null,
        withholding_tax: form.withholding_tax,
        withholding_basis: form.withholding_basis,
        header_amount_type: form.header_amount_type,
        fee_burden: form.fee_burden,
      };
      if (templateId) {
        await supabase.from('invoice_templates').update({
          ...payload,
          updated_at: new Date().toISOString(),
        }).eq('id', templateId);
        await supabase.from('invoice_template_items').delete().eq('template_id', templateId);
      } else {
        const { data: inserted } = await supabase
          .from('invoice_templates')
          .insert(payload)
          .select('id')
          .single();
        templateId = inserted?.id;
      }
      if (templateId) {
        const itemsToInsert = form.items
          .filter(it => it.description.trim() || it.unit_price > 0)
          .map((it, idx) => ({
            template_id: templateId,
            description: it.description,
            quantity: it.quantity || 1,
            unit_price: it.unit_price || 0,
            tax_rate: 0.10,
            amount: Math.round((it.quantity || 1) * (it.unit_price || 0)),
            sort_order: idx,
          }));
        if (itemsToInsert.length > 0) {
          await supabase.from('invoice_template_items').insert(itemsToInsert);
        }
      }
      setInvTplModalOpen(false);
      setEditingInvTpl(null);
      await fetchData();
    } catch (err) { console.error('請求書テンプレ保存エラー:', err); }
  };

  const deleteInvoiceTemplate = async (id: string) => {
    if (!supabase) return;
    try {
      await supabase.from('invoice_templates').delete().eq('id', id);
      setInvTplDeleteTarget(null);
      await fetchData();
    } catch (err) { console.error('請求書テンプレ削除エラー:', err); }
  };

  // ============================================================
  // レンダリング
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#D4A03A] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* v0.14.1: フラッシュメッセージ（保存成功/失敗/重複の即時フィードバック） */}
      {flash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] pointer-events-none">
          <div
            className={`px-4 py-2.5 rounded-xl text-xs shadow-lg flex items-center gap-2 ${
              flash.type === 'success'
                ? 'bg-[#1B4D3E] text-white'
                : flash.type === 'warning'
                ? 'bg-[#D4A03A] text-white'
                : 'bg-[#C23728] text-white'
            }`}
            style={{ minWidth: '220px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
          >
            {flash.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{flash.message}</span>
          </div>
        </div>
      )}
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
            {/* 接続済みソース */}
            {syncSources.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-[#999] mb-2">接続済みソース</p>
                <div className="space-y-1.5">
                  {syncSources.map(ss => (
                    <div key={ss.id} className="flex items-center justify-between py-1.5 px-3 bg-[#F5F5F3] rounded-lg">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-3.5 h-3.5 text-[#D4A03A]" />
                        <span className="text-xs text-[#1a1a1a]">{ss.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${ss.is_active ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' : 'bg-[#999]/10 text-[#999]'}`}>
                          {ss.is_active ? '有効' : '無効'}
                        </span>
                      </div>
                      {ss.last_synced_at && (
                        <span className="text-[9px] text-[#999]">
                          最終: {new Date(ss.last_synced_at).toLocaleDateString('ja-JP')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            {/* PJステータスフィルター */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {[{ key: 'all', label: '全件' }, ...Object.entries(PROJECT_STATUS).map(([k, v]) => ({ key: k, label: v }))].map(f => (
                <button
                  key={f.key}
                  onClick={() => setPjStatusFilter(f.key)}
                  className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                    pjStatusFilter === f.key
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'text-[#999] border-[#e0e0e0] hover:border-[#bbb]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* PJ一覧（事業別アコーディオン） */}
            {projects.length === 0 ? (
              <p className="text-[11px] text-[#999]">プロジェクトが登録されていません</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(DIVISIONS).map(([divId, divVal]) => {
                  const allDivProjects = projects.filter(pj => pj.division === divId);
                  const filteredProjects = pjStatusFilter === 'all'
                    ? allDivProjects
                    : allDivProjects.filter(pj => pj.status === pjStatusFilter);
                  const isOpen = pjOpenDivisions.includes(divId);
                  const visibleCount = pjVisibleCount[divId] || PJ_PAGE_SIZE;
                  const visibleProjects = filteredProjects.slice(0, visibleCount);
                  const hasMore = filteredProjects.length > visibleCount;

                  return (
                    <div key={divId} className="border border-[#f0f0f0] rounded-lg overflow-hidden">
                      <button
                        onClick={() => {
                          setPjOpenDivisions(prev =>
                            prev.includes(divId) ? prev.filter(d => d !== divId) : [...prev, divId]
                          );
                          if (!pjVisibleCount[divId]) {
                            setPjVisibleCount(prev => ({ ...prev, [divId]: PJ_PAGE_SIZE }));
                          }
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#fafafa] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="px-1.5 py-0.5 text-[9px] rounded-full text-white"
                            style={{ backgroundColor: divVal.color }}
                          >
                            {divVal.label}
                          </span>
                          <span className="text-[11px] text-[#666]">{divVal.name}</span>
                          <span className="text-[10px] text-[#bbb]">
                            {filteredProjects.length}{pjStatusFilter !== 'all' ? `/${allDivProjects.length}` : ''}件
                          </span>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="w-3.5 h-3.5 text-[#ccc]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#ccc]" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="border-t border-[#f0f0f0]">
                          {filteredProjects.length === 0 ? (
                            <p className="text-[10px] text-[#ccc] px-3 py-3">
                              {pjStatusFilter !== 'all' ? `${PROJECT_STATUS[pjStatusFilter]}のプロジェクトなし` : 'プロジェクトなし'}
                            </p>
                          ) : (
                            <>
                              <div className="divide-y divide-[#f5f5f3]">
                                {visibleProjects.map((pj) => (
                                  <div key={pj.id} className="flex items-center justify-between py-2 px-3">
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
                              {hasMore && (
                                <button
                                  onClick={() => setPjVisibleCount(prev => ({ ...prev, [divId]: visibleCount + PJ_PAGE_SIZE }))}
                                  className="w-full py-2 text-[10px] text-[#D4A03A] hover:text-[#b8882e] hover:bg-[#fafafa] transition-colors border-t border-[#f0f0f0]"
                                >
                                  さらに{Math.min(PJ_PAGE_SIZE, filteredProjects.length - visibleCount)}件表示
                                </button>
                              )}
                            </>
                          )}
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

        {/* ── 事業領域管理（軸B） ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            事業領域
          </div>
          <div className="text-[11px] text-[#999] mb-3 leading-relaxed">
            売上を「ブランディング受託 / 経営マーケ受託 / 自主事業」で分類するための軸です。初期3区分は削除できません（名前の編集のみ可能）。
          </div>
          <div className="bg-white rounded-xl shadow-sm">
            {businessDomains.map((bd) => {
              const protectedFlag = isProtectedDomain(bd.id);
              return (
                <div key={bd.id} className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] last:border-b-0">
                  {bdEditId === bd.id ? (
                    <>
                      <input
                        type="text"
                        value={bdEditName}
                        onChange={(e) => setBdEditName(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border border-[#D4A03A] rounded-md outline-none"
                        onKeyDown={(e) => { if (e.key === 'Enter') updateBusinessDomain(bd.id); if (e.key === 'Escape') setBdEditId(null); }}
                        autoFocus
                      />
                      <button onClick={() => updateBusinessDomain(bd.id)} disabled={bdSaving} className="p-1 hover:bg-black/5 rounded-md">
                        <Save className="w-3.5 h-3.5 text-[#1B4D3E]" />
                      </button>
                      <button onClick={() => setBdEditId(null)} className="p-1 hover:bg-black/5 rounded-md">
                        <X className="w-3.5 h-3.5 text-[#999]" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-[#333]">{bd.name}</span>
                      <span className="text-[10px] text-[#bbb] font-mono mr-1">{bd.id}</span>
                      <button onClick={() => startEditBusinessDomain(bd)} className="p-1 hover:bg-black/5 rounded-md">
                        <Pencil className="w-3.5 h-3.5 text-[#999]" />
                      </button>
                      {protectedFlag ? (
                        <span className="p-1 opacity-30 cursor-not-allowed" title="初期3区分は削除できません">
                          <Trash2 className="w-3.5 h-3.5 text-[#ccc]" />
                        </span>
                      ) : (
                        <button onClick={() => deleteBusinessDomain(bd.id)} className="p-1 hover:bg-[#C23728]/10 rounded-md">
                          <Trash2 className="w-3.5 h-3.5 text-[#999]" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {/* 新規追加 */}
            <div className="px-5 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bdNewName}
                  onChange={(e) => setBdNewName(e.target.value)}
                  onFocus={openBdNewForm}
                  placeholder="新しい事業領域の名前..."
                  className="flex-1 px-2 py-1 text-sm bg-[#F5F5F3] rounded-md outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                  onKeyDown={(e) => { if (e.key === 'Enter') addBusinessDomain(); }}
                />
                <button
                  onClick={addBusinessDomain}
                  disabled={!bdNewName.trim() || !bdNewId.trim() || bdSaving}
                  className="p-1.5 bg-[#1a1a1a] text-white rounded-md disabled:opacity-30"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {bdNewName.trim() && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#999] font-mono w-10 shrink-0">ID:</span>
                  <input
                    type="text"
                    value={bdNewId}
                    onChange={(e) => setBdNewId(e.target.value)}
                    placeholder="domain_4"
                    className="flex-1 px-2 py-1 text-xs font-mono bg-[#F5F5F3] rounded-md outline-none focus:ring-1 focus:ring-[#D4A03A]/50"
                  />
                  <span className="text-[10px] text-[#bbb]">英数字・_のみ</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 収益タイプ管理 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            収益タイプ
          </div>
          <div className="bg-white rounded-xl shadow-sm">
            {revenueTypes.length === 0 && (
              <div className="px-5 py-4 text-xs text-[#999] italic leading-relaxed">
                収益タイプはまだ登録されていません。運用の中で必要性が見えてから追加してください。
              </div>
            )}
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

        {/* ── 既存領収書ファイル一括リネーム（v0.12.0 Sprint 3） ── */}
        <RenameReceiptsSection />

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

        {/* ── 請求元情報 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            請求元情報
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-[11px] text-[#999] mb-4">
              請求書に印字される{ownerLabel}の情報です。
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#999] mb-1">屋号・名前</label>
                <input type="text" value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  placeholder="例: komu10"
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
              </div>
              <div className="flex gap-3">
                <div className="w-28">
                  <label className="block text-xs text-[#999] mb-1">郵便番号</label>
                  <input type="text" value={billingPostalCode}
                    onChange={(e) => setBillingPostalCode(e.target.value)}
                    placeholder="000-0000"
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-[#999] mb-1">住所</label>
                  <input type="text" value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    placeholder="東京都渋谷区…"
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-[#999] mb-1">電話番号</label>
                  <input type="tel" value={billingPhone}
                    onChange={(e) => setBillingPhone(e.target.value)}
                    placeholder="090-0000-0000"
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-[#999] mb-1">メールアドレス</label>
                  <input type="email" value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder="tomo@komu10.jp"
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
                </div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!supabase) return;
                setBillingSaving(true);
                try {
                  await supabase.from('profiles').update({
                    business_name: billingName.trim() || null,
                    postal_code: billingPostalCode.trim() || null,
                    address: billingAddress.trim() || null,
                    phone: billingPhone.trim() || null,
                    email: billingEmail.trim() || null,
                  } as any).eq('user_key', effectiveOwner);
                } catch (err) { console.error('請求元情報保存エラー:', err); }
                finally { setBillingSaving(false); }
              }}
              disabled={billingSaving}
              className="mt-4 px-4 py-2 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {billingSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              保存する
            </button>
          </div>
        </section>

        {/* ── 背景色 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            背景色
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-[11px] text-[#999] mb-3">
              {ownerLabel}のページ背景色を選択します。担当者切替で自動的に反映されます。
            </p>
            <div className="flex gap-3 mb-4">
              {(OWNER_COLOR_PRESETS[effectiveOwner] || []).map((preset) => {
                const isSelected = ownerColor === preset.value;
                const isDark = (() => {
                  const hex = preset.value.replace('#', '');
                  const r = parseInt(hex.substring(0, 2), 16);
                  const g = parseInt(hex.substring(2, 4), 16);
                  const b = parseInt(hex.substring(4, 6), 16);
                  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
                })();
                return (
                  <button
                    key={preset.value}
                    onClick={async () => {
                      if (!supabase) return;
                      setOwnerColorSaving(true);
                      setOwnerColor(preset.value);
                      await supabase.from('profiles').update({ owner_color: preset.value }).eq('user_key', effectiveOwner);
                      document.documentElement.style.setProperty('--owner-bg', preset.value);
                      document.body.style.backgroundColor = preset.value;
                      if (isDark) {
                        document.documentElement.classList.add('dark-owner');
                      } else {
                        document.documentElement.classList.remove('dark-owner');
                      }
                      setOwnerColorSaving(false);
                      window.dispatchEvent(new Event('ownerColorChanged'));
                    }}
                    disabled={ownerColorSaving}
                    className={`flex-1 p-3 rounded-xl border-2 transition-all ${
                      isSelected ? 'border-[#D4A03A] shadow-sm' : 'border-[#e0e0e0] hover:border-[#ccc]'
                    }`}
                  >
                    <div
                      className="w-full h-10 rounded-lg mb-2 border border-black/5"
                      style={{ backgroundColor: preset.value }}
                    />
                    <div className={`text-[11px] font-medium ${isDark ? 'text-[#666]' : 'text-[#333]'}`}>
                      {preset.label}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* カスタムカラー */}
            <div className="pt-3 border-t border-gray-100">
              <p className="text-[10px] text-[#999] mb-2">カスタムカラー</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={ownerColor || '#F5F5F3'}
                  onChange={(e) => setOwnerColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-black/10 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={ownerColor || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(v) || v === '') setOwnerColor(v);
                  }}
                  className="w-28 px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm font-['Saira_Condensed'] tabular-nums border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                  placeholder="#F5F5F3"
                />
                <button
                  onClick={async () => {
                    if (!supabase || !ownerColor || !/^#[0-9A-Fa-f]{6}$/.test(ownerColor)) return;
                    setOwnerColorSaving(true);
                    await supabase.from('profiles').update({ owner_color: ownerColor }).eq('user_key', effectiveOwner);
                    document.documentElement.style.setProperty('--owner-bg', ownerColor);
                    document.body.style.backgroundColor = ownerColor;
                    const hex = ownerColor.replace('#', '');
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    if ((r * 299 + g * 587 + b * 114) / 1000 < 128) {
                      document.documentElement.classList.add('dark-owner');
                    } else {
                      document.documentElement.classList.remove('dark-owner');
                    }
                    setOwnerColorSaving(false);
                    window.dispatchEvent(new Event('ownerColorChanged'));
                  }}
                  disabled={ownerColorSaving || !ownerColor || !/^#[0-9A-Fa-f]{6}$/.test(ownerColor)}
                  className="px-3 py-2 bg-[#1a1a1a] text-white rounded-lg text-[10px] font-medium hover:bg-[#333] disabled:opacity-40 transition-colors"
                >
                  適用
                </button>
                {/* 初期色に戻す */}
                {ownerColor && !(OWNER_COLOR_PRESETS[effectiveOwner] || []).some(p => p.value === ownerColor) && (
                  <button
                    onClick={() => {
                      const presets = OWNER_COLOR_PRESETS[effectiveOwner] || [];
                      if (presets.length > 0) {
                        const firstPreset = presets[0];
                        setOwnerColor(firstPreset.value);
                      }
                    }}
                    className="text-[10px] text-[#999] hover:text-[#666] underline"
                  >
                    初期色に戻す
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

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
                {clients.map((cl) => {
                  const hasNote = !!(cl.notes && cl.notes.trim());
                  const isExpanded = expandedClientId === cl.id;
                  return (
                    <div key={cl.id}>
                      <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${cl.is_active ? 'bg-[#F5F5F3]' : 'bg-[#F5F5F3]/50 opacity-60'}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-['Saira_Condensed'] text-[#999] tabular-nums">{cl.client_number}</span>
                            <span className="text-sm text-[#1a1a1a] font-medium">{cl.name}</span>
                            {cl.short_name && <span className="text-[11px] text-[#999]">({cl.short_name})</span>}
                            {!cl.is_active && <span className="text-[9px] bg-[#999] text-white px-1.5 py-0.5 rounded">停止</span>}
                          </div>
                          <div className="text-[11px] text-[#999]">
                            {cl.payment_terms || '支払いサイト未設定'}
                            {cl.contact_name ? ` / ${cl.contact_name}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {hasNote && (
                            <button
                              onClick={() => setExpandedClientId(isExpanded ? null : cl.id)}
                              className={`p-1 rounded-md transition-colors ${isExpanded ? 'bg-[#D4A03A]/15' : 'hover:bg-black/5'}`}
                              title="メモを表示">
                              <StickyNote className={`w-3.5 h-3.5 ${isExpanded ? 'text-[#D4A03A]' : 'text-[#999]'}`} />
                            </button>
                          )}
                          <button onClick={() => { setEditingClient(cl); setClientModalOpen(true); }}
                            className="p-1 hover:bg-black/5 rounded-md"><Pencil className="w-3.5 h-3.5 text-[#999]" /></button>
                          <button onClick={() => setClientDeleteTarget(cl.id)}
                            className="p-1 hover:bg-[#C23728]/10 rounded-md"><Trash2 className="w-3.5 h-3.5 text-[#999]" /></button>
                        </div>
                      </div>
                      {isExpanded && hasNote && (
                        <div className="mt-1 mx-3 px-3 py-2 bg-[#FAFAF8] border-l-2 border-[#D4A03A]/40 rounded-r-md">
                          <div className="text-[10px] text-[#bbb] mb-1 tracking-wider">MEMO</div>
                          <p className="text-[12px] text-[#333] whitespace-pre-wrap leading-relaxed">{cl.notes}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
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

        {/* ── 開発者メニュー（v0.6.1: シードデータ操作） ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            開発者メニュー
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <button
              onClick={() => setDeveloperOpen(v => !v)}
              className="w-full flex items-center justify-between text-left">
              <span className="text-xs text-[#666]">
                検証用ダミーデータの投入・削除
                <span className="text-[#bbb] ml-2">（本番データに影響なし）</span>
              </span>
              <span className="text-[#999] text-xs">{developerOpen ? '閉じる' : '開く'}</span>
            </button>
            {developerOpen && (
              <div className="mt-4 space-y-3">
                <p className="text-[11px] text-[#999] leading-relaxed">
                  検証用のダミー取引先（源泉あり／源泉なし各1件）と請求書（各1件）を一括投入します。
                  全データに識別子 <code className="bg-[#F5F5F3] px-1 rounded text-[10px]">__SEED__</code> が付与され、
                  削除時は識別子で厳密マッチするため本番データは影響を受けません。
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleSeedInsert}
                    disabled={seedLoading}
                    className="flex items-center gap-1.5 px-3 py-2 text-[11px] bg-[#1B4D3E] text-white rounded-lg hover:bg-[#1a3d32] transition-colors disabled:opacity-50">
                    {seedLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    シードデータを投入
                  </button>
                  <button
                    onClick={handleSeedDelete}
                    disabled={seedLoading}
                    className="flex items-center gap-1.5 px-3 py-2 text-[11px] bg-[#C23728] text-white rounded-lg hover:bg-[#a92e22] transition-colors disabled:opacity-50">
                    {seedLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    シードデータを削除
                  </button>
                </div>
                {seedMsg && (
                  <p className={`text-[11px] ${seedMsg.startsWith('✓') ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>
                    {seedMsg}
                  </p>
                )}
              </div>
            )}
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

        {/* ── 備品台帳 ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            備品台帳
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            {/* フィルター */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {[
                { key: 'all', label: '全件' },
                { key: '10000', label: '¥10,000+' },
                { key: '50000', label: '¥50,000+' },
              ].map(f => (
                <button key={f.key} onClick={() => setEqFilter(f.key as typeof eqFilter)}
                  className={`px-3 py-1 rounded-full text-[10px] transition-colors ${eqFilter === f.key ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'}`}>
                  {f.label}
                </button>
              ))}
              <select value={eqCatFilter} onChange={(e) => setEqCatFilter(e.target.value)}
                className="ml-auto px-2 py-1 bg-[#F5F5F3] rounded-lg text-[10px] border-0 outline-none">
                <option value="all">全カテゴリ</option>
                {Object.entries(EQUIPMENT_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {(() => {
              let filtered = equipmentItems;
              if (eqFilter === '10000') filtered = filtered.filter(eq => {
                // transaction金額チェックは後で — ここではequipment_items全件表示
                return true; // 1万円以上で登録されるので全件がフィルタ対象
              });
              if (eqFilter === '50000') filtered = filtered.filter(() => true);
              if (eqCatFilter !== 'all') filtered = filtered.filter(eq => eq.category === eqCatFilter);

              return filtered.length === 0 ? (
                <p className="text-[11px] text-[#999] py-4 text-center">
                  備品が登録されていません。経費登録時に消耗品費（¥10,000以上）を入力すると自動追加されます。
                </p>
              ) : (
                <div className="space-y-2">
                  {filtered.map(eq => (
                    <div key={eq.id} className="flex items-center justify-between py-2.5 px-3 bg-[#F5F5F3] rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#1a1a1a] font-medium truncate">{eq.name}</span>
                          {eq.category && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full shrink-0">
                              {EQUIPMENT_CATEGORIES[eq.category] || eq.category}
                            </span>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                            eq.status === 'active' ? 'bg-[#1B4D3E]/10 text-[#1B4D3E]' :
                            eq.status === 'disposed' ? 'bg-[#C23728]/10 text-[#C23728]' :
                            'bg-[#999]/10 text-[#999]'
                          }`}>
                            {EQUIPMENT_STATUS[eq.status] || eq.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#999] mt-0.5 flex items-center gap-3">
                          {eq.maker && <span>{eq.maker}</span>}
                          {eq.serial && <span>S/N: {eq.serial}</span>}
                          {eq.business_ratio < 100 && <span>事業{eq.business_ratio}%</span>}
                          {eq.warranty_date && <span>保証: {eq.warranty_date}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button onClick={() => { setEqEditModal(eq); setEqEditModalOpen(true); }}
                          className="p-1 hover:bg-black/5 rounded-md"><Pencil className="w-3.5 h-3.5 text-[#999]" /></button>
                        <button onClick={() => setEqDeleteTarget(eq.id)}
                          className="p-1 hover:bg-[#C23728]/10 rounded-md"><Trash2 className="w-3.5 h-3.5 text-[#999]" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
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

        {/* ── 経費テンプレート ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            経費テンプレート
          </div>

          {/* 交通費テンプレート（業務メタ） */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-[#1a1a1a] mb-0.5">交通費（業務）</p>
                <p className="text-[10px] text-[#999]">目的・摘要・事業PJをまとめた業務シーン</p>
              </div>
              <button
                onClick={() => { setEditingTemplate(null); setTemplateModalOpen('transport'); }}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors whitespace-nowrap ml-3"
              >
                <Plus className="w-3.5 h-3.5" />追加
              </button>
            </div>
            {expenseTemplates.filter(t => t.template_type === 'transport').length === 0 ? (
              <p className="text-xs text-[#bbb] text-center py-4">交通費テンプレートがまだありません</p>
            ) : (
              <div className="space-y-3">
                {expenseTemplates.filter(t => t.template_type === 'transport').map(tmpl => {
                  const purposeLabel = tmpl.transport_purpose || '';
                  const descLabel = tmpl.description || '';
                  return (
                    <div key={tmpl.id} className="flex items-start justify-between py-3 px-4 bg-[#F5F5F3] rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-medium text-[#1a1a1a]">{tmpl.name}</span>
                          {purposeLabel && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#1a1a1a]/5 text-[#666] rounded-full">{purposeLabel}</span>
                          )}
                          {tmpl.use_count > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full">{tmpl.use_count}回使用</span>
                          )}
                        </div>
                        {descLabel && (
                          <p className="text-[10px] text-[#999] truncate mt-1">{descLabel}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => { setEditingTemplate(tmpl); setTemplateModalOpen('transport'); }}
                          className="p-1.5 rounded-lg hover:bg-[#eee] transition-colors"
                        >
                          <Pencil className="w-3 h-3 text-[#999]" />
                        </button>
                        <button
                          onClick={() => setTemplateDeleteTarget(tmpl.id)}
                          className="p-1.5 rounded-lg hover:bg-[#fee] transition-colors"
                        >
                          <Trash2 className="w-3 h-3 text-[#C23728]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* v0.7: ルートテンプレート（物理経路） */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[#1a1a1a] mb-0.5">ルート</p>
                <p className="text-[10px] text-[#999]">片道＋逆順ペアの基本単位、または往復パッケージ</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => { setEditingRoute(null); setRouteModalOpen(true); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors whitespace-nowrap"
                  title="片道テンプレを追加"
                >
                  <Plus className="w-3 h-3" />片道
                </button>
                <button
                  onClick={() => { setEditingRoute(null); setPackageModalOpen(true); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-[#1a1a1a] bg-[#D4A03A]/15 border border-[#D4A03A]/30 rounded-lg hover:bg-[#D4A03A]/25 transition-colors whitespace-nowrap"
                  title="往復パッケージを追加（片道テンプレを2つ組み合わせ）"
                >
                  <Plus className="w-3 h-3" />パッケージ
                </button>
              </div>
            </div>
            {routeTemplates.length === 0 ? (
              <p className="text-xs text-[#bbb] text-center py-4">ルートテンプレートがまだありません</p>
            ) : (() => {
              // v0.14.0 Phase 5-A: パッケージと片道を分離表示
              const packages = routeTemplates.filter(r => r.template_kind === 'roundtrip_package');
              const oneways = routeTemplates.filter(r => r.template_kind !== 'roundtrip_package');
              const onewayById = new Map(oneways.map(r => [r.id, r]));
              return (
                <div className="space-y-5">
                  {/* ── 往復パッケージ ── */}
                  {packages.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#999] font-medium tracking-wide uppercase mb-2">往復パッケージ</p>
                      <div className="space-y-3">
                        {packages.map(pkg => {
                          const outbound = pkg.outbound_route_id ? onewayById.get(pkg.outbound_route_id) : null;
                          const ret = pkg.return_route_id ? onewayById.get(pkg.return_route_id) : null;
                          const outboundTotal = outbound ? (outbound.route_legs || []).reduce((s, l) => s + (l.amount || 0), 0) : 0;
                          const returnTotal = ret ? (ret.route_legs || []).reduce((s, l) => s + (l.amount || 0), 0) : 0;
                          const total = outboundTotal + returnTotal;
                          const outboundLabel = outbound ? (outbound.route_legs || []).map(l => l.from).concat((outbound.route_legs || []).slice(-1).map(l => l.to)).filter(Boolean).join(' → ') : '';
                          const returnLabel = ret ? (ret.route_legs || []).map(l => l.from).concat((ret.route_legs || []).slice(-1).map(l => l.to)).filter(Boolean).join(' → ') : '';
                          const brokenRef = !outbound || !ret;
                          return (
                            <div key={pkg.id} className={`flex items-start justify-between py-3 px-4 rounded-xl ${brokenRef ? 'bg-[#FEF5E7]' : 'bg-[#F5F5F3]'}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs font-medium text-[#1a1a1a]">{pkg.name}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full">往復パッケージ</span>
                                  {pkg.use_count > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full">{pkg.use_count}回使用</span>
                                  )}
                                  {brokenRef && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-[#C23728]/10 text-[#C23728] rounded-full">参照先アーカイブ</span>
                                  )}
                                </div>
                                {outbound && outboundLabel && (
                                  <p className="text-[10px] text-[#999] truncate">往路: {outboundLabel}</p>
                                )}
                                {ret && returnLabel && (
                                  <p className="text-[10px] text-[#999] truncate">復路: {returnLabel}</p>
                                )}
                                {!outbound && (
                                  <p className="text-[10px] text-[#C23728]">往路テンプレが見つかりません</p>
                                )}
                                {!ret && (
                                  <p className="text-[10px] text-[#C23728]">復路テンプレが見つかりません</p>
                                )}
                                {!brokenRef && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[11px] font-medium text-[#1a1a1a]">¥{total.toLocaleString()}</span>
                                    <span className="text-[9px] text-[#bbb]">往復合計</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 ml-3">
                                <button
                                  onClick={() => { setEditingRoute(pkg); setPackageModalOpen(true); }}
                                  className="p-1.5 rounded-lg hover:bg-[#eee] transition-colors"
                                >
                                  <Pencil className="w-3 h-3 text-[#999]" />
                                </button>
                                <button
                                  onClick={() => setRouteDeleteTarget(pkg.id)}
                                  className="p-1.5 rounded-lg hover:bg-[#fee] transition-colors"
                                >
                                  <Trash2 className="w-3 h-3 text-[#C23728]" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── 片道 ── */}
                  {oneways.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[#999] font-medium tracking-wide uppercase mb-2">片道</p>
                      <div className="space-y-3">
                        {oneways.map(route => {
                          const total = (route.route_legs || []).reduce((s, l) => s + (l.amount || 0), 0);
                          const routeLabel = route.route_legs && route.route_legs.length > 0
                            ? (route.route_legs[0]?.from || '') + ' → ' + (route.route_legs[route.route_legs.length - 1]?.to || '')
                            : '';
                          const pair = route.paired_reverse_id ? onewayById.get(route.paired_reverse_id) : null;
                          return (
                            <div key={route.id} className="flex items-start justify-between py-3 px-4 bg-[#F5F5F3] rounded-xl">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="text-xs font-medium text-[#1a1a1a]">{route.name}</span>
                                  {pair ? (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-[#1B4D3E]/10 text-[#1B4D3E] rounded-full">⇔ ペアあり</span>
                                  ) : (
                                    <button
                                      onClick={() => createReversePair(route)}
                                      className="text-[9px] px-1.5 py-0.5 bg-[#999]/10 text-[#666] rounded-full hover:bg-[#D4A03A]/20 hover:text-[#D4A03A] transition-colors"
                                      title="逆順ペアを作成"
                                    >
                                      ＋ ペアを作成
                                    </button>
                                  )}
                                  {route.use_count > 0 && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full">{route.use_count}回使用</span>
                                  )}
                                </div>
                                {routeLabel && (
                                  <p className="text-[10px] text-[#999] truncate">{routeLabel}</p>
                                )}
                                {pair && (
                                  <p className="text-[10px] text-[#1B4D3E]/70 truncate">ペア: {pair.name}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[11px] font-medium text-[#1a1a1a]">¥{total.toLocaleString()}</span>
                                  <span className="text-[9px] text-[#bbb]">{(route.route_legs || []).length}区間</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 ml-3">
                                <button
                                  onClick={() => { setEditingRoute(route); setRouteModalOpen(true); }}
                                  className="p-1.5 rounded-lg hover:bg-[#eee] transition-colors"
                                >
                                  <Pencil className="w-3 h-3 text-[#999]" />
                                </button>
                                <button
                                  onClick={() => setRouteDeleteTarget(route.id)}
                                  className="p-1.5 rounded-lg hover:bg-[#fee] transition-colors"
                                >
                                  <Trash2 className="w-3 h-3 text-[#C23728]" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* v0.14.0 Phase 5-E: アーカイブ済みテンプレの表示・復元 */}
                  <div className="mt-5 pt-4 border-t border-[#f0f0f0]">
                    <button
                      onClick={() => setShowArchivedRoutes(!showArchivedRoutes)}
                      className="text-[10px] text-[#999] hover:text-[#1a1a1a] transition-colors"
                    >
                      {showArchivedRoutes ? '▼' : '▶'} アーカイブ済みを表示
                      {showArchivedRoutes && archivedRouteTemplates.length > 0 && (
                        <span className="ml-1 text-[#bbb]">({archivedRouteTemplates.length})</span>
                      )}
                    </button>
                    {showArchivedRoutes && (
                      <div className="mt-3 space-y-2">
                        {archivedRouteTemplates.length === 0 ? (
                          <p className="text-[10px] text-[#bbb] text-center py-3">アーカイブ済みのルートテンプレはありません</p>
                        ) : (
                          archivedRouteTemplates.map(route => {
                            const isPackage = route.template_kind === 'roundtrip_package';
                            const total = (route.route_legs || []).reduce((s, l) => s + (l.amount || 0), 0);
                            const routeLabel = route.route_legs && route.route_legs.length > 0
                              ? (route.route_legs[0]?.from || '') + ' → ' + (route.route_legs[route.route_legs.length - 1]?.to || '')
                              : '';
                            return (
                              <div key={route.id} className="flex items-start justify-between py-2.5 px-3 bg-[#F5F5F3]/60 rounded-lg opacity-60">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                    <span className="text-[11px] text-[#999] line-through">{route.name}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 bg-[#999]/10 text-[#666] rounded-full">
                                      {isPackage ? 'パッケージ' : '片道'}
                                    </span>
                                  </div>
                                  {!isPackage && routeLabel && (
                                    <p className="text-[10px] text-[#bbb] truncate line-through">{routeLabel}</p>
                                  )}
                                  {!isPackage && total > 0 && (
                                    <span className="text-[10px] text-[#bbb]">¥{total.toLocaleString()}</span>
                                  )}
                                </div>
                                <button
                                  onClick={() => restoreRouteTemplate(route.id)}
                                  className="ml-3 px-2.5 py-1 text-[10px] text-[#1a1a1a] bg-white border border-[#e8e8e8] rounded-lg hover:bg-[#F5F5F3] transition-colors whitespace-nowrap"
                                >
                                  復元
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 汎用テンプレート */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-[#1a1a1a] mb-0.5">汎用</p>
                <p className="text-[10px] text-[#999]">よく使う経費パターンを登録→科目選択時にチップ表示</p>
              </div>
              <button
                onClick={() => { setEditingTemplate(null); setTemplateModalOpen('general'); }}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors whitespace-nowrap ml-3"
              >
                <Plus className="w-3.5 h-3.5" />追加
              </button>
            </div>
            {expenseTemplates.filter(t => t.template_type === 'general').length === 0 ? (
              <p className="text-xs text-[#bbb] text-center py-4">汎用テンプレートがまだありません</p>
            ) : (
              <div className="space-y-3">
                {expenseTemplates.filter(t => t.template_type === 'general').map(tmpl => {
                  const kamokuName = tmpl.kamoku ? (KAMOKU[tmpl.kamoku as keyof typeof KAMOKU]?.name || tmpl.kamoku) : '—';
                  return (
                    <div key={tmpl.id} className="flex items-start justify-between py-3 px-4 bg-[#F5F5F3] rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[#1a1a1a]">{tmpl.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#eee] text-[#999] rounded-full">{kamokuName}</span>
                          {tmpl.use_count > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full">{tmpl.use_count}回使用</span>
                          )}
                        </div>
                        {tmpl.store && (
                          <p className="text-[10px] text-[#999] truncate">{tmpl.store}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-medium text-[#1a1a1a]">¥{(tmpl.amount || 0).toLocaleString()}</span>
                          <span className="text-[9px] text-[#bbb]">{tmpl.payment_method === 'bank_account' ? '口座' : '個人'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => { setEditingTemplate(tmpl); setTemplateModalOpen('general'); }}
                          className="p-1.5 rounded-lg hover:bg-[#eee] transition-colors"
                        >
                          <Pencil className="w-3 h-3 text-[#999]" />
                        </button>
                        <button
                          onClick={() => setTemplateDeleteTarget(tmpl.id)}
                          className="p-1.5 rounded-lg hover:bg-[#fee] transition-colors"
                        >
                          <Trash2 className="w-3 h-3 text-[#C23728]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── v0.8: 請求書テンプレ ── */}
        <section className="mb-10">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            請求書テンプレ
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-medium text-[#1a1a1a] mb-0.5">汎用</p>
                <p className="text-[10px] text-[#999]">請求書新規作成時に呼び出せる雛形（明細・備考・支払条件・源泉設定）</p>
              </div>
              <button
                onClick={() => { setEditingInvTpl(null); setInvTplModalOpen(true); }}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors whitespace-nowrap ml-3"
              >
                <Plus className="w-3.5 h-3.5" />追加
              </button>
            </div>
            {invoiceTemplates.length === 0 ? (
              <p className="text-xs text-[#bbb] text-center py-4">請求書テンプレがまだありません</p>
            ) : (
              <div className="space-y-3">
                {invoiceTemplates.map(tmpl => {
                  const items = invoiceTemplateItems[tmpl.id] || [];
                  const subtotal = items.reduce((s: number, it: any) => s + Number(it.amount || 0), 0);
                  return (
                    <div key={tmpl.id} className="flex items-start justify-between py-3 px-4 bg-[#F5F5F3] rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[#1a1a1a]">{tmpl.name}</span>
                          {tmpl.withholding_tax && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full">源泉あり</span>
                          )}
                          {tmpl.use_count > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#eee] text-[#999] rounded-full">{tmpl.use_count}回使用</span>
                          )}
                        </div>
                        {tmpl.subject && (
                          <p className="text-[10px] text-[#999] truncate">{tmpl.subject}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-medium text-[#1a1a1a]">¥{subtotal.toLocaleString()}</span>
                          <span className="text-[9px] text-[#bbb]">{items.length}明細</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button
                          onClick={() => { setEditingInvTpl(tmpl); setInvTplModalOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-[#eee] transition-colors"
                        >
                          <Pencil className="w-3 h-3 text-[#999]" />
                        </button>
                        <button
                          onClick={() => setInvTplDeleteTarget(tmpl.id)}
                          className="p-1.5 rounded-lg hover:bg-[#fee] transition-colors"
                        >
                          <Trash2 className="w-3 h-3 text-[#C23728]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        </>)}

        {/* v0.15.0: 内訳の項目管理（制作費・取材費） */}
        <section className="mb-6 mt-4">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            内訳の項目管理
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
            <p className="text-[11px] text-[#666] leading-relaxed">
              制作費・取材費を入力する際に選択する「内訳」を管理できます。<br />
              撮影・取材の実態に合わせて自由に項目を追加・編集してください。
            </p>
            <div className="bg-[#FFF9EA] border border-[#D4A03A]/30 rounded-lg px-3 py-2">
              <p className="text-[10px] text-[#8B6D1F] leading-relaxed">
                💡 <span className="font-medium">ラベルの編集について</span><br />
                日本語ラベルのみの変更です。内訳項目の意味合いや既存取引の集計・紐付けは維持されます。
              </p>
            </div>

            {(['production', 'torizai'] as const).map((parent) => {
              const parentLabel = parent === 'production' ? '制作費' : '取材費';
              const activeItems = subCategories.filter(s => s.parent_kamoku === parent && s.is_active);
              const archivedItems = subCategories.filter(s => s.parent_kamoku === parent && !s.is_active);
              return (
                <div key={parent} className="border border-[#EEE] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[12px] font-medium text-[#1a1a1a]">{parentLabel}の内訳</h3>
                    <span className="text-[10px] text-[#999]">{activeItems.length}件</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {activeItems.map((s) => {
                      const isEditing = subCatEditTarget?.id === s.id;
                      if (isEditing) {
                        return (
                          <div key={s.id} className="flex items-center gap-1 bg-[#FFF9EA] border border-[#D4A03A]/50 rounded-full px-2 py-0.5">
                            <input
                              type="text"
                              value={subCatEditTarget.label}
                              onChange={(e) => setSubCatEditTarget({ ...subCatEditTarget, label: e.target.value })}
                              className="bg-transparent outline-none text-[11px] w-24"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubCatRename(s.id, subCatEditTarget.label);
                                if (e.key === 'Escape') setSubCatEditTarget(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSubCatRename(s.id, subCatEditTarget.label)}
                              className="text-[10px] text-[#1B4D3E] px-1"
                            >保存</button>
                            <button
                              type="button"
                              onClick={() => setSubCatEditTarget(null)}
                              className="text-[10px] text-[#999] px-1"
                            >×</button>
                          </div>
                        );
                      }
                      return (
                        <div key={s.id} className="group relative flex items-center gap-1 bg-[#F5F5F3] rounded-full px-3 py-1 text-[11px]">
                          <span className="text-[#333]">{s.label}</span>
                          {s.is_system && (
                            <span className="text-[8px] text-[#999] bg-white rounded px-1">システム</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setSubCatEditTarget({ id: s.id, label: s.label })}
                            className="ml-1 text-[#999] hover:text-[#D4A03A]"
                            title="編集"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSubCatDeleteClick(s.id, s.label, s.is_system)}
                            className="text-[#999] hover:text-[#C23728]"
                            title="削除"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      );
                    })}

                    {subCatAddingFor === parent ? (
                      <div className="flex items-center gap-1 bg-white border border-dashed border-[#D4A03A]/60 rounded-full px-2 py-0.5">
                        <input
                          type="text"
                          value={subCatInputValue}
                          onChange={(e) => setSubCatInputValue(e.target.value)}
                          className="bg-transparent outline-none text-[11px] w-24"
                          placeholder="項目名"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSubCatAdd(parent, subCatInputValue);
                            if (e.key === 'Escape') {
                              setSubCatAddingFor(null);
                              setSubCatInputValue('');
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSubCatAdd(parent, subCatInputValue)}
                          className="text-[10px] text-[#1B4D3E] px-1"
                        >追加</button>
                        <button
                          type="button"
                          onClick={() => { setSubCatAddingFor(null); setSubCatInputValue(''); }}
                          className="text-[10px] text-[#999] px-1"
                        >×</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setSubCatAddingFor(parent); setSubCatInputValue(''); }}
                        className="px-3 py-1 rounded-full text-[11px] bg-white border border-dashed border-[#D4A03A]/60 text-[#D4A03A] hover:bg-[#FFF9EA]"
                      >
                        ＋ 新規追加
                      </button>
                    )}
                  </div>

                  {archivedItems.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-[10px] text-[#999] cursor-pointer">
                        削除済み（{archivedItems.length}件）
                      </summary>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {archivedItems.map((s) => (
                          <div key={s.id} className="flex items-center gap-1 bg-[#FAFAF8] rounded-full px-3 py-1 text-[11px] text-[#999]">
                            <span className="line-through">{s.label}</span>
                            <button
                              type="button"
                              onClick={() => handleSubCatRestore(s.id)}
                              className="text-[10px] text-[#1B4D3E] hover:underline"
                            >復元</button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* v0.15.5: 削除確認モーダル（0件時=シンプル / 1件以上時=移行付き） */}
        {subCatDeleteTarget && subCatDeleteUsageCount !== null && (() => {
          const targetParent = subCategories.find(s => s.id === subCatDeleteTarget.id)?.parent_kamoku;
          const migrationCandidates = subCategories.filter(
            s => s.parent_kamoku === targetParent && s.id !== subCatDeleteTarget.id && s.is_active
          );
          const usageCount = subCatDeleteUsageCount;

          const closeModal = () => {
            if (subCatDeleteInProgress) return;
            setSubCatDeleteTarget(null);
            setSubCatDeleteUsageCount(null);
            setSubCatMigrateTargetKey('');
            setSubCatMigrateNewLabel('');
            setSubCatMigrateMode('existing');
          };

          return (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={closeModal}
            >
              <div
                className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {usageCount === 0 ? (
                  /* 0件時: シンプル削除モーダル */
                  <>
                    <h3 className="text-[14px] font-medium text-[#1a1a1a] mb-3">
                      「<span className="text-[#1a1a1a]">{subCatDeleteTarget.label}</span>」を削除しますか？
                    </h3>
                    <p className="text-[11px] text-[#666] mb-4">
                      この項目を使っている取引はありません。
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={closeModal}
                        disabled={subCatDeleteInProgress}
                        className="px-3 py-1.5 text-[11px] text-[#666] hover:bg-[#F5F5F3] rounded-lg disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={handleSubCatDeleteConfirm}
                        disabled={subCatDeleteInProgress}
                        className="px-3 py-1.5 text-[11px] bg-[#C23728] text-white hover:bg-[#A82C1F] rounded-lg disabled:opacity-50"
                      >
                        {subCatDeleteInProgress ? '削除中…' : '削除する'}
                      </button>
                    </div>
                  </>
                ) : (
                  /* 1件以上時: 移行付き削除モーダル */
                  <>
                    <h3 className="text-[14px] font-medium text-[#1a1a1a] mb-3">
                      「<span className="text-[#1a1a1a]">{subCatDeleteTarget.label}</span>」を削除しますか？
                    </h3>
                    <p className="text-[11px] text-[#666] mb-3">
                      この項目で登録されている経費が <span className="font-medium text-[#C23728]">{usageCount}件</span> あります。<br />
                      削除する場合は別の項目への移行する必要があります。
                    </p>

                    {/* 移行先の選択 */}
                    <div className="space-y-3 mb-4">
                      {/* 既存項目に移行 */}
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="migrate_mode"
                          value="existing"
                          checked={subCatMigrateMode === 'existing'}
                          onChange={() => setSubCatMigrateMode('existing')}
                          className="mt-0.5"
                          disabled={migrationCandidates.length === 0 || subCatDeleteInProgress}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-[#333] mb-1">既存の項目に置き換え</div>
                          <select
                            value={subCatMigrateTargetKey}
                            onChange={(e) => {
                              setSubCatMigrateTargetKey(e.target.value);
                              setSubCatMigrateMode('existing');
                            }}
                            disabled={subCatMigrateMode !== 'existing' || migrationCandidates.length === 0 || subCatDeleteInProgress}
                            className="w-full px-2 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50 disabled:opacity-50"
                          >
                            {migrationCandidates.length === 0 ? (
                              <option value="">（他に項目がありません）</option>
                            ) : (
                              migrationCandidates.map(s => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                              ))
                            )}
                          </select>
                        </div>
                      </label>

                      {/* 新規項目を作って移行 */}
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="migrate_mode"
                          value="new"
                          checked={subCatMigrateMode === 'new'}
                          onChange={() => setSubCatMigrateMode('new')}
                          className="mt-0.5"
                          disabled={subCatDeleteInProgress}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-[#333] mb-1">新規項目を作成して置き換え</div>
                          <input
                            type="text"
                            value={subCatMigrateNewLabel}
                            onChange={(e) => {
                              setSubCatMigrateNewLabel(e.target.value);
                              setSubCatMigrateMode('new');
                            }}
                            disabled={subCatMigrateMode !== 'new' || subCatDeleteInProgress}
                            placeholder="項目名"
                            className="w-full px-2 py-1.5 bg-[#F5F5F3] rounded text-[11px] border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50 disabled:opacity-50"
                          />
                        </div>
                      </label>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={closeModal}
                        disabled={subCatDeleteInProgress}
                        className="px-3 py-1.5 text-[11px] text-[#666] hover:bg-[#F5F5F3] rounded-lg disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={handleSubCatDeleteConfirm}
                        disabled={subCatDeleteInProgress || (subCatMigrateMode === 'existing' && !subCatMigrateTargetKey) || (subCatMigrateMode === 'new' && !subCatMigrateNewLabel.trim())}
                        className="px-3 py-1.5 text-[11px] bg-[#C23728] text-white hover:bg-[#A82C1F] rounded-lg disabled:opacity-50"
                      >
                        {subCatDeleteInProgress ? '実行中…' : '移行して削除'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* リリースノート */}
        <section className="mb-6 mt-4">
          <div className="text-[10px] font-medium tracking-widest text-[#999] mb-3">
            リリースノート
          </div>
          <div className="space-y-3">
            {/* v0.15.5 */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.15.5</span>
                <span className="text-[9px] text-[#999]">2026.04.25</span>
                <span className="text-[8px] px-1.5 py-0.5 bg-[#D4A03A]/10 text-[#D4A03A] rounded-full font-medium">LATEST</span>
              </div>
              <ul className="space-y-1">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>内訳の項目を削除する際、使っている取引がある場合は移行先を選べるように変更</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>移行先は「既存の項目」または「新しく作る項目」から選択可能</li>
              </ul>
            </div>

            {/* v0.15.4 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.15.4</span>
                  <span className="text-[9px] text-[#999]">2026.04.25</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>AI領収書読み取り時、制作費・取材費に推定した場合は内訳の項目も自動選択</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>アナウンスバナーから制作費・取材費に変更した時も内訳の項目を自動反映</li>
                </ul>
              </div>
            </details>

            {/* v0.15.3 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.15.3</span>
                  <span className="text-[9px] text-[#999]">2026.04.25</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>AI領収書読み取りが一般科目に推定した時「制作費・取材費の可能性は？」とアナウンス</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>内訳の項目に「興行・観戦」「体験・施設」「季節イベント」を追加（制作費・取材費それぞれに）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>設定画面の内訳の項目管理セクションに「ラベル編集しても既存取引の集計は維持」アナウンス追加</li>
                </ul>
              </div>
            </details>

            {/* v0.15.2 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.15.2</span>
                  <span className="text-[9px] text-[#999]">2026.04.25</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>制作費・取材費の交通費詳細で「目的」プルダウンを非表示（案件で目的は明確なため）</li>
                </ul>
              </div>
            </details>

            {/* v0.15.1 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.15.1</span>
                  <span className="text-[9px] text-[#999]">2026.04.25</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>制作費・取材費も複数領収書OKに変更（トモが2人分決済等の実運用対応）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>1枚制限時の文言を「この勘定科目では領収書は1枚のみ添付できます」に修正</li>
                </ul>
              </div>
            </details>

            {/* v0.15.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.15.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.25</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>制作費・取材費に「内訳」機能を追加（移動/宿泊/飲食/衣装/小道具など）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>初期項目26種類を用意（制作費17種・取材費9種）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経費入力画面から「＋新規追加」で独自の項目を即時作成可能</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>設定画面に「内訳の項目管理」セクションを新設（追加・編集・削除・復元）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>制作費・取材費で交通費詳細フィールドを「内訳=移動」選択時のみ展開に変更</li>
                </ul>
              </div>
            </details>

            {/* v0.14.7 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.7</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>勘定科目のデフォルトを空に変更（雑費の誤保存防止・プレースホルダ表示）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>「トシキの定番」「トモの定番」セクションを追加（直近3ヶ月の使用頻度上位3件を自動表示）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>往路既存テンプレ＋自動逆順モードで「この往復をパッケージ保存?」を提案（2段構え）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>逆順片道テンプレがない場合、保存提案モーダル第1段で片道として保存可能に</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>保存提案モーダル全体を Yes/No ラジオボタンに統一（各項目を独立判断可能に）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>下部ボタン文言を「キャンセル / 登録を確定」に変更</li>
                </ul>
              </div>
            </details>

            {/* v0.14.6 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.6</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>既存パッケージ適用時の無駄な「この往復セットをパッケージ保存?」提案を削除</li>
                </ul>
              </div>
            </details>

            {/* v0.14.5 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.5</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#C23728]">!</span>Vercel本番ビルド失敗を修復（RouteLeg型の二重定義問題を解消）</li>
                </ul>
              </div>
            </details>

            {/* v0.14.4 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.4</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>TransactionModalに useRef 連打ガードを追加（モバイル二重タップ対策）</li>
                </ul>
              </div>
            </details>

            {/* v0.14.3 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.3</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>往復交通費を1レコード保存に統一（これまで往復別金額は2行に分かれていたが、1取引として合計金額表示に）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>transport_details テーブルに return_legs・return_amount 等の復路カラムを追加</li>
                </ul>
              </div>
            </details>

            {/* v0.14.2 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.2</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>ルート・パッケージ保存の連打による二重登録を防止（useRefベース連打ガード）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>同名・同内容のルートテンプレ重複作成をブロック（正規化チェック）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>フラッシュメッセージUI追加（保存成功=緑・警告=黄・エラー=赤、2.5秒自動消滅）</li>
                </ul>
              </div>
            </details>

            {/* v0.14.1 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.1</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>パッケージ追加ボタンを常時押下可能に(モーダル内で片道不足警告を表示)</li>
                </ul>
              </div>
            </details>

            {/* v0.14.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.14.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.24</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>ルートテンプレ体系を刷新：片道テンプレ＋往復パッケージの2層構造に</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>片道テンプレ保存時に逆順ペアを自動生成（次回復路として1タップ選択可能）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>往復パッケージ機能（往路＋復路の組合せを保存し、1クリックで適用）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>往復時の復路モード選択UI：自動逆順／別ルート／手入力の3択</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>保存提案モーダルで「往路・復路・パッケージ」を独立に保存可能</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>設定画面にアーカイブ復元UI追加（論理削除されたテンプレを薄字で表示・1タップ復元）</li>
                </ul>
              </div>
            </details>

            {/* v0.13.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.13.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.22</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
              <ul className="space-y-1">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>制作費・取材費でも交通費詳細フィールドを入力可能に（YouTube撮影移動・取材移動の証跡強化）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>制作費・取材費で内容・摘要を必須化（業務関連性の証跡担保）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>PJ選択に「{UNASSIGNED_PROJECT_LABEL}」選択肢を追加（企画段階の制作費・取材費でもPJ必須をクリア可能）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>記入ポイントガイドボックスに摘要必須アナウンス追加</li>
              </ul>
              </div>
            </details>

            {/* v0.12.1 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.12.1</span>
                  <span className="text-[9px] text-[#999]">2026.04.22</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
              <ul className="space-y-1">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>座席クラスに「プレミアムエコノミー」「クラスJ」を追加（旅費交通費）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>クラスJは国内線準上位席のため上位クラス理由入力を不要化</li>
              </ul>
              </div>
            </details>

            {/* v0.12.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.12.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.22</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
              <ul className="space-y-1">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>既存領収書ファイル一括リネーム機能（Sprint 3）：過去のlegacy_*.binファイルをv0.11.0命名規則に統一</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>ドライラン機能：変更前に旧名→新名の対応表を画面で確認可能</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>旧ファイル名のDB記録（old_filenameカラム）により復元可能性を担保</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>失敗スキップ続行＋詳細レポート表示（Drive API障害時も全体停止しない）</li>
              </ul>
              </div>
            </details>

            {/* v0.11.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.11.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.22</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>複数領収書添付機能（1経費に最大10枚・ラベル付与可）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>領収書ファイル名の自動命名ルール（日付_科目_支払先_担当者_摘要_連番_ラベル）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>Drive保存タイミングを「登録ボタン押下時」に変更（孤児ファイルゼロ化）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経費削除時、紐づく領収書をDriveのゴミ箱に自動移動（30日間復元可）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>領収書合計金額の自動合算＋経費金額セットボタン（差分1円以内=緑）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経費一覧に領収書件数バッジ（📎N）表示</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>編集モーダルで既存領収書の閲覧・ラベル変更・削除に対応</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>expense_receiptsテーブル新設＋既存データ自動マイグレ・監査ログ連動</li>
                </ul>
              </div>
            </details>

            {/* v0.10.2 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.10.2</span>
                  <span className="text-[9px] text-[#999]">2026.04.21</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>領収書AIをClaude Sonnet 4.6にアップグレード（最新世代・OCR精度さらに向上）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>AI会計相談をClaude Opus 4.7にアップグレード（最高位モデル・推論精度大幅向上）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>接待・会議・取材費の領収書から利用人数を自動入力</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>物品購入の領収書から型番を自動抽出し品名に併記</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>サブスク・通信費・ソフトウェアの領収書から請求期間を自動抽出し説明欄に追記</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>合計金額の優先順位を明文化（ご請求金額 &gt; 税込合計 &gt; 合計）</li>
                </ul>
              </div>
            </details>

            {/* v0.10.1 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.10.1</span>
                  <span className="text-[9px] text-[#999]">2026.04.21</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>領収書AI読み取りを強化。交通費（JR・新幹線・特急券・飛行機）の場合、出発地・到着地・往復区分・支払方法を自動入力</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>AIモデルをClaude Sonnet 4.5にアップグレード（OCR精度向上）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>プロンプト改善：「お預り・お釣り」と「合計金額」の取り違えを防止／和暦の自動正規化</li>
                </ul>
              </div>
            </details>

            {/* v0.10.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.10.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.21</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>AI会計相談機能を追加。経費入力画面の科目選択横と経費一覧の各行から呼び出し可能</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>相談時に同じ支払先の過去処理を自動参照。「この科目で確定」ワンタップで科目反映</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>相談履歴を経費に紐づけて保存（audit証跡）。再現性のためAIモデルバージョンも記録</li>
                </ul>
              </div>
            </details>

            {/* v0.9.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.9.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.21</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>領収書アップロードを経費入力画面に統合。ホームの「撮影/手入力」タブを廃止し「経費を追加」ボタンに一本化</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経費入力画面に領収書添付セクション追加（AI抽出＋Drive保存）。取材費・制作費も領収書経由で登録可能に</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経費一覧に「未紐付け」フィルター追加。取材費・制作費で案件タグ未付与の行をフラグ表示</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>Uploader画面を廃止（機能はTransactionModalに統合）</li>
                </ul>
              </div>
            </details>

            {/* v0.8.2 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.8.2</span>
                  <span className="text-[9px] text-[#999]">2026.04.21</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>取材費・制作費は案件タグ（PJ）必須化。未入力時はバリデーションエラー</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>取材費・制作費を選択した際、記入ポイント説明ボックスを表示</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>領収書アップロード画面では取材費・制作費を選択不可に変更（手入力画面で案件タグ付きで登録）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>次回リリース(v0.9.0)で領収書アップロードを手入力画面に統合予定</li>
                </ul>
              </div>
            </details>

            {/* v0.8.1 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.8.1</span>
                  <span className="text-[9px] text-[#999]">2026.04.21</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>勘定科目に「取材費」「制作費」「会議費」「福利厚生費」「研修費」「支払手数料」を追加</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>AI領収書抽出の勘定科目判定を新科目に対応（YT撮影関連の切り分け精度向上）</li>
                </ul>
              </div>
            </details>

            {/* v0.5.7 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.5.7</span>
                  <span className="text-[9px] text-[#999]">2026.04.19</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>請求書作成フロー全面刷新：テンプレスプシをコピーして値を流し込む方式に変更</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>「PDF & シート出力」ボタンを「請求書作成」に変更（デザイン崩れ撲滅）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>明細5行まで対応（6行以上はエラー表示）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>作成後、スプシを自動で新規タブで開く（プレビュー確認→PDFダウンロード運用）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>備考の固定2行（インボイス／振込手数料）はテンプレ側に書き込み、動的備考のみ入力可</li>
                </ul>
              </div>
            </details>

            {/* v0.5.6 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.5.6</span>
                  <span className="text-[9px] text-[#999]">2026.04.19</span>
                </div>
              </summary>
              <ul className="space-y-1 px-4 pb-4">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>売上モーダルの「請求書の件名」をインライン編集可能化</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>金額入力欄に3桁カンマ自動整形（売上モーダル・請求書エディタ単価欄）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>請求書の件名編集で案件マスタのinvoice_display_nameを自動更新</li>
              </ul>
            </details>

            {/* v0.5.5 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.5.5</span>
                  <span className="text-[9px] text-[#999]">2026.04.19</span>
                </div>
              </summary>
              <ul className="space-y-1 px-4 pb-4">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>売上モーダルの「案件名」を「案件管理名（内部管理用）」にラベル変更</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#C23728]">-</span>売上モーダルから旧「摘要」欄を削除（品名・摘要に統合）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>請求書プレビュー・PDF出力の銀行名／支店名重複括弧を防御（既に括弧内コードが含まれる場合は追記しない）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>口座種別 account_type='savings' を「普通」に正しく表示（英語残留バグ修正）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>PDF出力時のSheets APIエラーハンドリング強化（失敗時に詳細メッセージを返す）</li>
              </ul>
            </details>

            {/* v0.5.4 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.5.4</span>
                  <span className="text-[9px] text-[#999]">2026.04.19</span>
                </div>
              </summary>
              <ul className="space-y-1 px-4 pb-4">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>案件名・請求書件名・品名摘要の3層分離（内部管理名／対外件名／明細行摘要を別フィールドに）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>品名・摘要サジェスト（案件紐付きの直近3件をワンタップで再利用）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>案件管理の「請求書の件名（任意）」欄（未設定時は案件名フォールバック）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>売上モーダルの案件選択時に請求書の件名をプレビュー表示</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>既存売上に品名未記入がある場合は黄色バッジで警告表示</li>
              </ul>
            </details>

            {/* v0.5.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.5.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.15</span>
                </div>
              </summary>
              <ul className="space-y-1 px-4 pb-4">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>交通費入力フロー全面再設計（片道/往復・経由地・分割保存）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>請求書管理(作成・PDF出力・Drive自動保存・売上仕訳連携)</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>取引先マスタ（設定ページCRUD・自動採番）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>科目分岐の基盤設計（日付→科目→専用フォーム切替）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>交通費支払方法（IC/現金/クレカ/請求書払い）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>交通費注意書き（経営企画本部校閲済み）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>テンプレ適用時の摘要復元修正</li>
              </ul>
            </details>

            {/* v0.4.0 */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.4.0</span>
                  <span className="text-[9px] text-[#999]">2026.04.12</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
              <ul className="space-y-1">
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経費テンプレート（交通費ルート＋汎用パターン）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経営ページ「資金」タブ（口座残高・資金移動・手数料管理）</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>支払方法（個人/口座）+ 仕訳自動分岐</li>
                <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>セマンティックバージョニング導入</li>
              </ul>
              </div>
            </details>

            {/* v0.3.x 折りたたみ */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.3.x</span>
                  <span className="text-[9px] text-[#999]">2026.03 – 04</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>令和8年度税制改正対応（少額減価償却40万円）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>備品台帳（写真D&D・リサイズ・Supabase Storage）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>同期ソース管理</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>オーナー背景色カスタマイズ（HEX入力・プリセット）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>重複経費チェック（日付×金額×取引先）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>Driveフォルダ自動振り分け（オーナー別→年月）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>AI抽出プロンプト強化（item_name / kamoku_hint）</li>
                </ul>
              </div>
            </details>

            {/* v0.2.x 折りたたみ */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.2.x</span>
                  <span className="text-[9px] text-[#999]">2026.02 – 03</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>CFビュー（キャッシュフロー / ランウェイ計算）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>PL/CF トグル経営ダッシュボード</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>利益予測線（forecast分離表示）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>プロジェクト5段階ステータス管理</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#1B4D3E]">↑</span>設定ページ「共通設定」「個人設定」タブ分割</li>
                </ul>
              </div>
            </details>

            {/* v0.1.x 折りたたみ */}
            <details className="bg-white rounded-xl shadow-sm">
              <summary className="p-4 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-['Saira_Condensed'] font-semibold tracking-wider text-[#1a1a1a]">v0.1.x</span>
                  <span className="text-[9px] text-[#999]">2026.01 – 02</span>
                </div>
              </summary>
              <div className="px-4 pb-4">
                <ul className="space-y-1">
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>経費・売上管理（CRUD）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>領収書AI読み取り + Google Drive保存</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>クレカCSVインポート</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>複式簿記自動生成（確定申告ページ）</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>PJ別損益 / 按分設定</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>YouTube管理スプレッドシート連携</li>
                  <li className="text-[11px] text-[#666] flex gap-1.5"><span className="text-[#D4A03A]">+</span>AIヘルプ・Q&A</li>
                </ul>
              </div>
            </details>
          </div>
        </section>

        {/* バージョン */}
        <div className="text-center py-8">
          <span className="text-[10px] font-['Saira_Condensed'] tracking-widest text-[#ccc]">v0.15.5</span>
        </div>

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

      {/* ── 備品編集モーダル ── */}
      {eqEditModalOpen && eqEditModal && (
        <EquipmentEditModal
          item={eqEditModal}
          onSave={(updates) => saveEquipmentEdit(eqEditModal.id, updates)}
          onClose={() => { setEqEditModalOpen(false); setEqEditModal(null); }}
        />
      )}

      {/* ── 備品削除確認 ── */}
      {eqDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEqDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この備品を台帳から削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setEqDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteEquipmentItem(eqDeleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors">
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── テンプレートモーダル ── */}
      {templateModalOpen && (
        <TemplateModal
          template={editingTemplate}
          templateType={templateModalOpen}
          projects={projects}
          transportPurposes={transportPurposes}
          onSave={saveTemplate}
          onClose={() => { setTemplateModalOpen(false); setEditingTemplate(null); }}
        />
      )}

      {/* ── テンプレート削除確認 ── */}
      {templateDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setTemplateDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">このテンプレートを削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setTemplateDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteTemplate(templateDeleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors">
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v0.7: ── ルートテンプレモーダル ── */}
      {routeModalOpen && (
        <RouteTemplateModal
          route={editingRoute}
          allRoutes={routeTemplates}
          onSave={saveRouteTemplate}
          onClose={() => { setRouteModalOpen(false); setEditingRoute(null); }}
        />
      )}

      {/* v0.14.0 Phase 5-C: ── パッケージテンプレモーダル ── */}
      {packageModalOpen && (
        <PackageTemplateModal
          pkg={editingRoute && editingRoute.template_kind === 'roundtrip_package' ? editingRoute : null}
          allRoutes={routeTemplates}
          onSave={savePackageTemplate}
          onClose={() => { setPackageModalOpen(false); setEditingRoute(null); }}
        />
      )}

      {/* v0.7: ── ルートテンプレ削除確認 ── */}
      {routeDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRouteDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">このルートテンプレートを削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setRouteDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteRouteTemplate(routeDeleteTarget)}
                className="flex-1 py-2 text-xs text-white bg-[#C23728] rounded-lg hover:bg-[#a82e21] transition-colors">
                削除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v0.8: 請求書テンプレ編集モーダル */}
      {invTplModalOpen && (
        <InvoiceTemplateModal
          template={editingInvTpl}
          templateItems={editingInvTpl ? (invoiceTemplateItems[editingInvTpl.id] || []) : []}
          bankAccounts={bankAccounts.filter((b: any) => b.owner === effectiveOwner)}
          onSave={saveInvoiceTemplate}
          onClose={() => { setInvTplModalOpen(false); setEditingInvTpl(null); }}
        />
      )}

      {/* v0.8: 請求書テンプレ削除確認 */}
      {invTplDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setInvTplDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm mx-4" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <p className="text-sm text-[#1a1a1a] mb-4">この請求書テンプレを削除しますか？</p>
            <div className="flex gap-2">
              <button onClick={() => setInvTplDeleteTarget(null)}
                className="flex-1 py-2 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
                キャンセル
              </button>
              <button onClick={() => deleteInvoiceTemplate(invTplDeleteTarget)}
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
  onSave: (data: {
    name: string; bank_name: string; bank_code: string; branch_name: string; branch_code: string;
    account_type: string; account_number: string; account_number_last4: string;
    account_holder_name: string; account_holder_kana: string; balance: number;
  }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: bank?.name || '',
    bank_name: bank?.bank_name || '',
    bank_code: bank?.bank_code || '',
    branch_name: bank?.branch_name || '',
    branch_code: bank?.branch_code || '',
    account_type: bank?.account_type || 'savings',
    account_number: bank?.account_number || '',
    account_holder_name: bank?.account_holder_name || '',
    account_holder_kana: bank?.account_holder_kana || '',
    balance: bank?.balance?.toString() || '0',
  });

  const [saving, setSaving] = useState(false);
  const canSave = form.name.trim() && form.bank_name.trim();

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    const accountNum = form.account_number.replace(/\D/g, '');
    onSave({
      name: form.name.trim(),
      bank_name: form.bank_name.trim(),
      bank_code: form.bank_code.replace(/\D/g, ''),
      branch_name: form.branch_name.trim(),
      branch_code: form.branch_code.replace(/\D/g, ''),
      account_type: form.account_type,
      account_number: accountNum,
      account_number_last4: accountNum.slice(-4),
      account_holder_name: form.account_holder_name.trim(),
      account_holder_kana: form.account_holder_kana.trim(),
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
              placeholder="例: メイン口座"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">銀行名</label>
              <input type="text" value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                placeholder="例: GMOあおぞらネット銀行"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
            <div className="w-24">
              <label className="block text-xs text-[#999] mb-1">金融機関コード</label>
              <input type="text" inputMode="numeric" value={form.bank_code}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setForm({ ...form, bank_code: v }); }}
                placeholder="0310"
                maxLength={4}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums text-center" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">支店名</label>
              <input type="text" value={form.branch_name}
                onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
                placeholder="例: ビジネス第二支店"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
            <div className="w-24">
              <label className="block text-xs text-[#999] mb-1">支店コード</label>
              <input type="text" inputMode="numeric" value={form.branch_code}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setForm({ ...form, branch_code: v }); }}
                placeholder="202"
                maxLength={3}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums text-center" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-28">
              <label className="block text-xs text-[#999] mb-1">口座種別</label>
              <select value={form.account_type}
                onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                <option value="savings">普通</option>
                <option value="checking">当座</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">口座番号</label>
              <input type="text" inputMode="numeric" value={form.account_number}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setForm({ ...form, account_number: v }); }}
                placeholder="1108530"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#999] mb-1">口座名義（漢字）</label>
            <input type="text" value={form.account_holder_name}
              onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })}
              placeholder="例: komu10 小林 寿樹"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>
          <div>
            <label className="block text-xs text-[#999] mb-1">口座名義（カナ）</label>
            <input type="text" value={form.account_holder_kana}
              onChange={(e) => setForm({ ...form, account_holder_kana: e.target.value })}
              placeholder="例: コウムテン コバヤシ トシキ"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
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
  { label: '月末締翌月末', terms: '月末締翌月末' },
  { label: '月末締翌々月末', terms: '月末締翌々月末' },
  { label: '即日', terms: '即日' },
] as const;

function ClientModal({
  client,
  onSave,
  onClose,
}: {
  client: Client | null;
  onSave: (data: {
    name: string; short_name: string | null; postal_code: string | null;
    address: string | null; contact_name: string | null; contact_email: string | null;
    payment_terms: string | null; notes: string | null; is_active: boolean;
    // v0.6.0 請求書管理v2
    withholding_tax: boolean;
    withholding_basis: string;
    header_amount_type: string;
    fee_burden: string;
    payment_terms_type: string;
  }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: client?.name || '',
    short_name: client?.short_name || '',
    postal_code: client?.postal_code || '',
    address: client?.address || '',
    contact_name: client?.contact_name || '',
    contact_email: client?.contact_email || '',
    payment_terms: client?.payment_terms || '',
    notes: client?.notes || '',
    is_active: client?.is_active ?? true,
    // v0.6.0 請求書管理v2
    withholding_tax:    (client as any)?.withholding_tax    ?? false,
    withholding_basis:  (client as any)?.withholding_basis  ?? 'tax_included',
    header_amount_type: (client as any)?.header_amount_type ?? 'total',
    fee_burden:         (client as any)?.fee_burden         ?? 'client',
    payment_terms_type: (client as any)?.payment_terms_type ?? 'month_end_next_month_end',
  });

  const [saving, setSaving] = useState(false);
  const canSave = form.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      name: form.name.trim(),
      short_name: form.short_name.trim() || null,
      postal_code: form.postal_code.trim() || null,
      address: form.address.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      // v0.6.0
      withholding_tax: form.withholding_tax,
      withholding_basis: form.withholding_basis,
      header_amount_type: form.header_amount_type,
      fee_burden: form.fee_burden,
      payment_terms_type: form.payment_terms_type,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">
            {client ? `取引先を編集（${client.client_number}）` : '取引先を追加'}
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
              placeholder="例: KKDAY JAPAN"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          {/* 略称 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">略称（任意）</label>
            <input type="text" value={form.short_name}
              onChange={(e) => setForm({ ...form, short_name: e.target.value })}
              placeholder="例: KKDAY"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          {/* 住所 */}
          <div className="flex gap-3">
            <div className="w-28">
              <label className="block text-xs text-[#999] mb-1">郵便番号</label>
              <input type="text" value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                placeholder="000-0000"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">住所</label>
              <input type="text" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="東京都渋谷区…"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
          </div>

          {/* 担当者 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">担当者名</label>
              <input type="text" value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="田中太郎"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">メール</label>
              <input type="email" value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="tanaka@example.com"
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            </div>
          </div>

          {/* 支払いサイト */}
          <div>
            <label className="block text-xs text-[#999] mb-1">支払いサイト</label>
            <div className="flex gap-1.5 mb-2">
              {PAYMENT_TERMS_PRESETS.map((p) => (
                <button key={p.label} type="button"
                  onClick={() => setForm(prev => ({ ...prev, payment_terms: p.terms }))}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                    form.payment_terms === p.terms
                      ? 'bg-[#1a1a1a] text-white'
                      : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <input type="text" value={form.payment_terms}
              onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
              placeholder="表示名（月末締翌月末 等）"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          {/* v0.6.0 請求書設定 */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="text-xs font-medium text-[#1a1a1a]">請求書設定</div>

            {/* 支払サイト種別（自動期限算出用） */}
            <div>
              <label className="block text-xs text-[#999] mb-1">支払サイト種別</label>
              <select value={form.payment_terms_type}
                onChange={(e) => setForm({ ...form, payment_terms_type: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                <option value="month_end_next_month_end">月末締翌月末払い（期限自動算出）</option>
                <option value="other">その他（個別・手動入力）</option>
              </select>
            </div>

            {/* 源泉徴収 */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#999] w-24 shrink-0">源泉徴収</label>
              <div className="flex gap-1.5">
                <button type="button"
                  onClick={() => setForm({ ...form, withholding_tax: true })}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                    form.withholding_tax ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>あり</button>
                <button type="button"
                  onClick={() => setForm({ ...form, withholding_tax: false })}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                    !form.withholding_tax ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>なし</button>
              </div>
            </div>

            {/* 源泉計算基準（源泉ありのみ） */}
            {form.withholding_tax && (
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#999] w-24 shrink-0">源泉計算基準</label>
                <div className="flex gap-1.5">
                  <button type="button"
                    onClick={() => setForm({ ...form, withholding_basis: 'tax_included' })}
                    className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                      form.withholding_basis === 'tax_included' ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                    }`}>税込</button>
                  <button type="button"
                    onClick={() => setForm({ ...form, withholding_basis: 'tax_excluded' })}
                    className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                      form.withholding_basis === 'tax_excluded' ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                    }`}>税抜</button>
                </div>
              </div>
            )}

            {/* 冒頭金額表示 */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#999] w-24 shrink-0">冒頭金額表示</label>
              <div className="flex gap-1.5">
                <button type="button"
                  onClick={() => setForm({ ...form, header_amount_type: 'total' })}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                    form.header_amount_type === 'total' ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>請求総額</button>
                <button type="button"
                  onClick={() => setForm({ ...form, header_amount_type: 'net_payment' })}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                    form.header_amount_type === 'net_payment' ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>差引振込額</button>
              </div>
            </div>

            {/* 振込手数料 */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#999] w-24 shrink-0">振込手数料</label>
              <div className="flex gap-1.5">
                <button type="button"
                  onClick={() => setForm({ ...form, fee_burden: 'client' })}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                    form.fee_burden === 'client' ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>先方負担</button>
                <button type="button"
                  onClick={() => setForm({ ...form, fee_burden: 'self' })}
                  className={`px-3 py-1.5 text-[11px] rounded-md transition-colors ${
                    form.fee_burden === 'self' ? 'bg-[#1a1a1a] text-white' : 'bg-[#F5F5F3] text-[#666] hover:bg-[#eee]'
                  }`}>自社負担</button>
              </div>
            </div>
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

          {/* ステータス（編集時のみ） */}
          {client && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#999]">有効</label>
              <button type="button"
                onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                className={`relative w-9 h-5 rounded-full transition-colors ${form.is_active ? 'bg-[#1B4D3E]' : 'bg-[#ccc]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
          )}
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
    invoice_display_name: project?.invoice_display_name || '',
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
            <label className="block text-xs text-[#999] mb-1">案件名（内部管理用） <span className="text-[#C23728]">*</span></label>
            <input type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例: KKDAY_自治体DMO関連事業支援_2026Q2"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            <p className="text-[11px] text-[#999] mt-1">社内で案件を識別するための名前です</p>
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-1">請求書の件名（先方が見る表記）</label>
            <input type="text" value={form.invoice_display_name}
              onChange={(e) => setForm({ ...form, invoice_display_name: e.target.value })}
              placeholder="例: 自治体DMO関連事業支援"
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
            <p className="text-[11px] text-[#999] mt-1">未設定の場合、案件名がそのまま使われます</p>
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

// ============================================================
// 備品編集モーダル
// ============================================================
function EquipmentEditModal({
  item,
  onSave,
  onClose,
}: {
  item: EquipmentItem;
  onSave: (updates: { category?: string; maker?: string; serial?: string; business_ratio?: number; warranty_date?: string | null; note?: string | null; status?: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    category: item.category || '',
    maker: item.maker || '',
    serial: item.serial || '',
    business_ratio: (item.business_ratio ?? 100).toString(),
    warranty_date: item.warranty_date || '',
    note: item.note || '',
    status: item.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<string[]>(item.photos || []);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError('');
    setPhotoUploading(true);
    try {
      const resized = await resizeImage(file, 2000);
      const fd = new FormData();
      fd.append('file', resized, file.name);
      fd.append('equipment_id', item.id);
      const res = await fetch('/api/equipment-photos', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setPhotos(data.photos);
      } else {
        setPhotoError(data.error || 'アップロード失敗');
      }
    } catch {
      setPhotoError('アップロードに失敗しました');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const handleDeletePhoto = async (url: string) => {
    try {
      const res = await fetch('/api/equipment-photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipmentId: item.id, photoUrl: url }),
      });
      const data = await res.json();
      if (data.success) setPhotos(data.photos);
    } catch (err) {
      console.error('Photo delete error:', err);
    }
  };

  const handleSave = () => {
    setSaving(true);
    onSave({
      category: form.category || undefined,
      maker: form.maker.trim() || undefined,
      serial: form.serial.trim() || undefined,
      business_ratio: parseInt(form.business_ratio) || 100,
      warranty_date: form.warranty_date || undefined,
      note: form.note.trim() || undefined,
      status: form.status,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-[#1a1a1a]">備品を編集</h2>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-md transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="px-3 py-2 bg-[#F5F5F3] rounded-lg">
            <p className="text-xs text-[#999]">品名</p>
            <p className="text-sm text-[#1a1a1a] font-medium">{item.name}</p>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">カテゴリ</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                <option value="">未分類</option>
                {Object.entries(EQUIPMENT_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">ステータス</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                {Object.entries(EQUIPMENT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-1">メーカー・型番</label>
            <input type="text" value={form.maker}
              onChange={(e) => setForm({ ...form, maker: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="Apple / SONY α7IV 等" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">シリアル番号</label>
              <input type="text" value={form.serial}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
                className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                placeholder="任意" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#999] mb-1">事業利用割合</label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={100} value={form.business_ratio}
                  onChange={(e) => setForm({ ...form, business_ratio: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
                <span className="text-xs text-[#999] shrink-0">%</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-1">保証期限</label>
            <input type="date" value={form.warranty_date}
              onChange={(e) => setForm({ ...form, warranty_date: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>

          <div>
            <label className="block text-xs text-[#999] mb-1">メモ</label>
            <input type="text" value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-none outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
              placeholder="任意" />
          </div>

          {/* 写真 */}
          <div>
            <label className="block text-xs text-[#999] mb-1">写真（最大5枚）</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(photos).map((url, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-[#F5F5F3] group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleDeletePhoto(url)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {photos.length < 5 && (
                <label className="w-16 h-16 rounded-lg border-2 border-dashed border-[#D4A03A]/30 flex items-center justify-center cursor-pointer hover:border-[#D4A03A]/60 transition-colors">
                  {photoUploading ? (
                    <Loader2 className="w-4 h-4 text-[#D4A03A] animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-[#D4A03A]" />
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                </label>
              )}
            </div>
            {photoError && <p className="text-[10px] text-[#C23728]">{photoError}</p>}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-lg hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-lg hover:bg-[#333] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            更新する
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TemplateModal — 経費テンプレート作成・編集（交通費 / 汎用）
// ============================================================
function TemplateModal({
  template,
  templateType,
  projects,
  transportPurposes,
  onSave,
  onClose,
}: {
  template: ExpenseTemplate | null;
  templateType: 'transport' | 'general';
  projects: Project[];
  transportPurposes: { id: string; name: string }[];
  onSave: (form: {
    name: string;
    template_type: 'transport' | 'general';
    kamoku?: string;
    store?: string;
    description?: string;
    amount?: number;
    payment_method?: string;
    transport_purpose?: string | null;
    allocations: TemplateAllocation[];
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [saving, setSaving] = useState(false);

  // 汎用用
  const [kamoku, setKamoku] = useState(template?.kamoku || 'misc');
  const [store, setStore] = useState(template?.store || '');
  const [description, setDescription] = useState(template?.description || '');
  const [amount, setAmount] = useState(template?.amount?.toString() || '');
  const [paymentMethod, setPaymentMethod] = useState(template?.payment_method || 'personal');

  // v0.7: 交通費テンプレの業務メタ（目的）
  const [transportPurpose, setTransportPurpose] = useState<string>(template?.transport_purpose || '');

  // v0.6.5: 事業・プロジェクト割り当て（経費入力画面と同じUX）
  const [allocRows, setAllocRows] = useState<{ division_id: string; project_id: string; percent: number }[]>(
    (template?.allocations || []).map(a => ({
      division_id: a.division_id || '',
      project_id: a.project_id || '',
      percent: a.percent || 0,
    }))
  );

  const addAllocRow = () => {
    const remain = 100 - allocRows.reduce((s, r) => s + (r.percent || 0), 0);
    setAllocRows(prev => [...prev, { division_id: '', project_id: '', percent: Math.max(0, remain) }]);
  };
  const updateAllocRow = (idx: number, field: 'division_id' | 'project_id' | 'percent', value: string | number) => {
    setAllocRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      // 部門変更時: PJが別部門のものだったらクリア
      if (field === 'division_id') {
        const newDiv = String(value);
        const newProj = projects.find(p => p.id === r.project_id);
        return {
          ...r,
          division_id: newDiv,
          project_id: newProj && (newProj as any).division === newDiv ? r.project_id : '',
        };
      }
      return { ...r, [field]: field === 'percent' ? Number(value) : value };
    }));
  };
  const removeAllocRow = (idx: number) => {
    setAllocRows(prev => prev.filter((_, i) => i !== idx));
  };

  const GENERAL_KAMOKU = Object.entries(KAMOKU)
    .filter(([, v]) => v.type === 'expense')
    .filter(([id]) => id !== 'travel')
    .map(([id, v]) => ({ id, name: v.name }));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const cleanAllocs: TemplateAllocation[] = allocRows
      .filter(r => r.division_id)
      .map(r => ({
        division_id: r.division_id,
        project_id: r.project_id || null,
        percent: r.percent || 0,
      }));
    if (templateType === 'transport') {
      // v0.7: 業務メタのみ保存（区間は route_templates で別管理）
      await onSave({
        name: name.trim(),
        template_type: 'transport',
        description: description.trim(),
        payment_method: paymentMethod,
        transport_purpose: transportPurpose || null,
        allocations: cleanAllocs,
      });
    } else {
      if (!Number(amount)) { setSaving(false); return; }
      await onSave({
        name: name.trim(),
        template_type: 'general',
        kamoku,
        store: store.trim(),
        description: description.trim(),
        amount: Number(amount),
        payment_method: paymentMethod,
        allocations: cleanAllocs,
      });
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium text-[#1a1a1a]">
            {template ? 'テンプレートを編集' : templateType === 'transport' ? '交通費テンプレートを追加' : '汎用テンプレートを追加'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F5F5F3]">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {/* テンプレート名 */}
        <div className="mb-5">
          <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">テンプレート名</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={templateType === 'transport' ? '例: 自宅→四ツ谷' : '例: Adobe CC月額'}
            className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
          />
        </div>

        {templateType === 'transport' ? (
          <>
            {/* v0.7: 業務メタUI（目的・摘要・支払方法） */}
            <div className="space-y-4 mb-5">
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">目的</label>
                <select value={transportPurpose} onChange={e => setTransportPurpose(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors">
                  <option value="">（未指定）</option>
                  {transportPurposes.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">摘要（任意）</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="例: 四ツ谷オフィスでの定例打合せ"
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors" />
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">支払方法</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors">
                  <option value="personal">個人（事業主借）</option>
                  <option value="bank_account">口座</option>
                </select>
              </div>
              <p className="text-[10px] text-[#bbb] leading-relaxed">
                ※ 区間は「ルート」テンプレで別管理します。経費登録時に業務メタ+ルートを独立選択。
              </p>
            </div>
          </>
        ) : (
          <>
            {/* 汎用テンプレート入力フィールド */}
            <div className="space-y-4 mb-5">
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">勘定科目</label>
                <select value={kamoku} onChange={e => setKamoku(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors">
                  {GENERAL_KAMOKU.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">取引先</label>
                <input value={store} onChange={e => setStore(e.target.value)} placeholder="例: Adobe / AWS"
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors" />
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">金額（円）</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="例: 7780"
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors" />
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">摘要（任意）</label>
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="例: Creative Cloud年間サブスク"
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors" />
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">支払方法</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors">
                  <option value="personal">個人（事業主借）</option>
                  <option value="bank_account">口座</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* 事業・PJ割り当て（交通費・汎用共通） */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-medium tracking-wider text-[#999]">事業・プロジェクト割り当て（任意）</label>
            <span className={`text-[10px] tabular-nums ${
              allocRows.reduce((s, r) => s + (r.percent || 0), 0) === 100 || allocRows.length === 0
                ? 'text-[#999]' : 'text-[#C23728]'
            }`}>
              計 {allocRows.reduce((s, r) => s + (r.percent || 0), 0)}%
            </span>
          </div>

          <div className="space-y-2">
            {allocRows.map((row, idx) => {
              const divProjects = projects.filter(p => (p as any).division === row.division_id && (p as any).is_active !== false);
              return (
                <div key={idx} className="bg-[#F5F5F3] rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={row.division_id} onChange={e => updateAllocRow(idx, 'division_id', e.target.value)}
                      className="flex-1 px-2 py-2 text-xs bg-white border border-[#e8e8e8] rounded-lg focus:outline-none focus:border-[#1a1a1a]">
                      <option value="">事業を選択</option>
                      {Object.entries(DIVISIONS).map(([divId, divVal]) => (
                        <option key={divId} value={divId}>{divVal.name}</option>
                      ))}
                    </select>
                    <input type="number" value={row.percent || ''} onChange={e => updateAllocRow(idx, 'percent', e.target.value)}
                      placeholder="%" min={0} max={100}
                      className="w-16 px-2 py-2 text-xs text-right tabular-nums bg-white border border-[#e8e8e8] rounded-lg focus:outline-none focus:border-[#1a1a1a]" />
                    <span className="text-[10px] text-[#999]">%</span>
                    <button onClick={() => removeAllocRow(idx)} className="p-1 rounded hover:bg-gray-200">
                      <X className="w-3.5 h-3.5 text-[#C23728]" />
                    </button>
                  </div>
                  <select value={row.project_id} onChange={e => updateAllocRow(idx, 'project_id', e.target.value)}
                    disabled={!row.division_id}
                    className="w-full px-2 py-2 text-xs bg-white border border-[#e8e8e8] rounded-lg focus:outline-none focus:border-[#1a1a1a] disabled:opacity-50">
                    <option value="">（PJ未指定）</option>
                    {divProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {(p as any).pj_number ? `${(p as any).pj_number} ` : ''}{p.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <button onClick={addAllocRow}
            className="w-full mt-2 py-2 text-[10px] text-[#666] border border-dashed border-[#e8e8e8] rounded-xl hover:bg-[#F5F5F3] transition-colors flex items-center justify-center gap-1">
            <Plus className="w-3 h-3" />事業を追加
          </button>
          <p className="text-[10px] text-[#bbb] mt-1.5">※ 未設定の場合、このテンプレ適用時は手動で割り当てしてください</p>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-xl hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving
              || !name.trim()
              || (templateType === 'transport'
                  ? false
                  : !Number(amount))
            }
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-xl hover:bg-[#333] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {template ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// v0.7: RouteTemplateModal — ルートテンプレ作成・編集（物理経路）
// TransportFields (mode='template') を流用して区間を入力
// ============================================================
function RouteTemplateModal({
  route,
  allRoutes,
  onSave,
  onClose,
}: {
  route: RouteTemplate | null;
  allRoutes: RouteTemplate[];
  onSave: (form: {
    name: string;
    direction: 'bidirectional' | 'oneway_only';
    route_legs: RouteLeg[];
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(route?.name || '');
  // v0.14.0 仕様D: direction は DEPRECATED、ここでは既存値維持のみ（UIで操作しない）
  const [direction] = useState<'bidirectional' | 'oneway_only'>(
    route?.direction || 'oneway_only'
  );
  const [saving, setSaving] = useState(false);

  // ペア情報を解決
  const pair = route?.paired_reverse_id
    ? allRoutes.find(r => r.id === route.paired_reverse_id) || null
    : null;

  // TransportFields 互換形式でstate管理
  const [transportData, setTransportData] = useState<TransportData>(() => {
    const src = route?.route_legs && route.route_legs.length > 0
      ? route.route_legs.map((l: any) => ({
          from: l.from || '',
          to: l.to || '',
          method: l.method || '電車',
          carrier: l.carrier || '',
          amount: Number(l.amount) || 0,
          green: typeof l.green === 'boolean' ? l.green : !!l.green_available,
        }))
      : [{ from: '', to: '', method: '電車', carrier: '', amount: 0, green: false }];
    return { ...EMPTY_TRANSPORT, route_legs: src };
  });

  const handleSave = async () => {
    if (!name.trim()) return;
    const validLegs = (transportData.route_legs || [])
      .filter(l => l.from && l.to && Number(l.amount) > 0)
      .map(l => ({
        from: l.from,
        to: l.to,
        method: l.method,
        carrier: l.carrier || '',
        amount: Number(l.amount) || 0,
        green: !!l.green,
      })) as any[];
    if (validLegs.length === 0) return;
    setSaving(true);
    await onSave({ name: name.trim(), direction, route_legs: validLegs });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium text-[#1a1a1a]">
            {route ? 'ルートを編集' : 'ルートを追加'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F5F5F3]">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {/* ルート名 */}
        <div className="mb-5">
          <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">ルート名</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例: 東京ルートJR 四ツ谷⇄藤沢"
            className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
          />
        </div>

        {/* v0.14.0 仕様D: ペア情報表示（編集時のみ）— 方向UIは廃止 */}
        {route && (
          <div className="mb-5 px-3 py-2.5 bg-[#F5F5F3] rounded-xl">
            {pair ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 bg-[#1B4D3E]/10 text-[#1B4D3E] rounded-full">⇔ ペアあり</span>
                  <span className="text-[11px] text-[#666] truncate">{pair.name}</span>
                </div>
                <p className="text-[10px] text-[#999]">
                  ※ 区間を編集するとペアも自動で逆順同期されます（名前は独立）
                </p>
              </div>
            ) : route.template_kind === 'roundtrip_package' ? (
              <p className="text-[10px] text-[#999]">往復パッケージ（参照型）</p>
            ) : (
              <p className="text-[10px] text-[#999]">ペア未作成 — 一覧から「＋ ペアを作成」ボタンで生成できます</p>
            )}
          </div>
        )}

        {/* ルート区間 — TransportFields 流用 */}
        <div className="mb-5">
          <TransportFields
            mode="template"
            data={transportData}
            onChange={setTransportData}
          />
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-xl hover:bg-gray-200 transition-colors">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving
              || !name.trim()
              || !(transportData.route_legs || []).some(l => l.from && l.to && Number(l.amount) > 0)
            }
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-xl hover:bg-[#333] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {route ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// v0.14.0 Phase 5-C: PackageTemplateModal — 往復パッケージの作成・編集
// 片道テンプレ2つ（往路・復路）を選んで組み合わせる
// ============================================================
function PackageTemplateModal({
  pkg,
  allRoutes,
  onSave,
  onClose,
}: {
  pkg: RouteTemplate | null;
  allRoutes: RouteTemplate[];
  onSave: (form: {
    name: string;
    outbound_route_id: string;
    return_route_id: string;
  }) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(pkg?.name || '');
  const [outboundId, setOutboundId] = useState(pkg?.outbound_route_id || '');
  const [returnId, setReturnId] = useState(pkg?.return_route_id || '');
  const [saving, setSaving] = useState(false);

  // 片道テンプレのみ選択肢に（パッケージ自体は除外、アーカイブ済みも除外）
  const onewayOptions = allRoutes.filter(
    (r) => r.template_kind !== 'roundtrip_package' && !r.archived_at
  );

  // 参照先が見つからない場合の警告（編集時）
  const outboundExists = !outboundId || onewayOptions.some((r) => r.id === outboundId);
  const returnExists = !returnId || onewayOptions.some((r) => r.id === returnId);

  // プレビュー用情報
  const outboundTpl = outboundId ? onewayOptions.find((r) => r.id === outboundId) : null;
  const returnTpl = returnId ? onewayOptions.find((r) => r.id === returnId) : null;
  const outboundTotal = outboundTpl
    ? (outboundTpl.route_legs || []).reduce((s, l) => s + (l.amount || 0), 0)
    : 0;
  const returnTotal = returnTpl
    ? (returnTpl.route_legs || []).reduce((s, l) => s + (l.amount || 0), 0)
    : 0;

  const handleSave = async () => {
    if (!name.trim() || !outboundId || !returnId) return;
    if (outboundId === returnId) return; // 往路と復路が同じテンプレは禁止
    setSaving(true);
    const ok = await onSave({
      name: name.trim(),
      outbound_route_id: outboundId,
      return_route_id: returnId,
    });
    setSaving(false);
    if (!ok) {
      console.error('パッケージ保存失敗');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium text-[#1a1a1a]">
            {pkg ? '往復パッケージを編集' : '往復パッケージを追加'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#F5F5F3]">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {onewayOptions.length < 2 ? (
          <div className="mb-5 px-3 py-4 bg-[#FEF5E7] border border-[#D4A03A]/30 rounded-xl text-center">
            <p className="text-xs text-[#1a1a1a] mb-1">片道テンプレが2つ以上必要です</p>
            <p className="text-[10px] text-[#999]">先に片道テンプレを作成してください</p>
          </div>
        ) : (
          <>
            {/* パッケージ名 */}
            <div className="mb-5">
              <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">
                パッケージ名
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 実家⇔自宅（新宿経由）"
                className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
              />
            </div>

            {/* 往路 */}
            <div className="mb-4">
              <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">
                往路
              </label>
              <select
                value={outboundId}
                onChange={(e) => setOutboundId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors bg-white"
              >
                <option value="">（選択してください）</option>
                {onewayOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {!outboundExists && (
                <p className="text-[10px] text-[#C23728] mt-1">
                  ※ 往路に指定されていたテンプレが見つかりません（アーカイブされた可能性）
                </p>
              )}
              {outboundTpl && (outboundTpl.route_legs || []).length > 0 && (
                <p className="text-[10px] text-[#999] mt-1.5 truncate">
                  {(outboundTpl.route_legs || [])[0]?.from || ''}
                  {' → '}
                  {(outboundTpl.route_legs || [])[outboundTpl.route_legs!.length - 1]?.to || ''}
                  {' / ¥'}
                  {outboundTotal.toLocaleString()}
                </p>
              )}
            </div>

            {/* 復路 */}
            <div className="mb-5">
              <label className="text-[10px] font-medium tracking-wider text-[#999] block mb-1.5">
                復路
              </label>
              <select
                value={returnId}
                onChange={(e) => setReturnId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors bg-white"
              >
                <option value="">（選択してください）</option>
                {onewayOptions.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.id === outboundId}>
                    {r.name}
                    {r.id === outboundId ? '（往路と同じ）' : ''}
                  </option>
                ))}
              </select>
              {!returnExists && (
                <p className="text-[10px] text-[#C23728] mt-1">
                  ※ 復路に指定されていたテンプレが見つかりません（アーカイブされた可能性）
                </p>
              )}
              {returnTpl && (returnTpl.route_legs || []).length > 0 && (
                <p className="text-[10px] text-[#999] mt-1.5 truncate">
                  {(returnTpl.route_legs || [])[0]?.from || ''}
                  {' → '}
                  {(returnTpl.route_legs || [])[returnTpl.route_legs!.length - 1]?.to || ''}
                  {' / ¥'}
                  {returnTotal.toLocaleString()}
                </p>
              )}
            </div>

            {/* 往復合計プレビュー */}
            {outboundTpl && returnTpl && (
              <div className="mb-5 px-3 py-2.5 bg-[#F5F5F3] rounded-xl">
                <p className="text-[10px] text-[#999] mb-0.5">往復合計</p>
                <p className="text-sm font-medium text-[#1a1a1a] font-['Saira_Condensed'] tabular-nums">
                  ¥{(outboundTotal + returnTotal).toLocaleString()}
                </p>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-xl hover:bg-gray-200 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving ||
              !name.trim() ||
              !outboundId ||
              !returnId ||
              outboundId === returnId ||
              onewayOptions.length < 2
            }
            className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-xl hover:bg-[#333] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {pkg ? '更新する' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}
