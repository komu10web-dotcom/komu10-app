'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Plus, Trash2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS, TRANSACTION_STATUS, PROJECT_TAG_REQUIRED_KAMOKU, KAMOKU_INPUT_GUIDE, DESCRIPTION_REQUIRED_KAMOKU, usesTransportDetail, UNASSIGNED_PROJECT_VALUE, UNASSIGNED_PROJECT_LABEL, requiresSubCategory, allowsMultipleReceipts, isTransportSubCategory, inferSubCategoryOnKamokuSwitch } from '@/types/database';
import type { Transaction, Project, ExpenseTemplate, RouteTemplate } from '@/types/database';
import TransportFields, { EMPTY_TRANSPORT, reverseRouteLegs } from '@/components/TransportFields';
import type { TransportData } from '@/components/TransportFields';
import { saveTransportDetails, updateTransportDetails, loadTransportDetails } from '@/lib/transportUtils';
import EntertainmentFields, { EMPTY_ENTERTAINMENT } from '@/components/EntertainmentFields';
import type { EntertainmentData } from '@/components/EntertainmentFields';
import { entertainmentToDescription } from '@/lib/entertainmentUtils';
import ReceiptUploadSection, { commitReceiptsToDrive, trashReceiptsInDrive } from '@/components/ReceiptUploadSection';
import type { ReceiptExtractedData, ReceiptItem } from '@/components/ReceiptUploadSection';
import ConsultationModal from '@/components/ConsultationModal';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: Transaction | null;
  defaultOwner?: string;
  projects?: Project[];
  // v0.40.0: アップグレード追加モード(親取引から from/to/便名/会社/支払方法を継承し金額のみ入力)
  upgradeForParent?: {
    parentTransactionId: string;
    parentDate: string;
    parentStore: string | null;
    parentOwner: string;
    parentTransport: {
      route_legs?: any[];
      return_legs?: any[];
      payment_method?: string;
      purpose?: string;
    } | null;
  } | null;
}

interface AllocRow {
  division_id: string;
  project_id: string;
  percent: number;
}

// v0.29.0: is_active=false の科目は新規作成時に非表示。編集時は editData.kamoku が is_active=false でも表示する。
const EXPENSE_KAMOKU = Object.entries(KAMOKU)
  .filter(([, v]) => v.type === 'expense')
  .map(([id, v]) => ({ id, name: v.name, isActive: (v as { is_active?: boolean }).is_active !== false }));

// v0.14.7: owner日本語ラベル（「{owner}の定番」セクション表示用）
const OWNER_LABEL: Record<string, string> = {
  tomo: 'トモ',
  toshiki: 'トシキ',
};

const DIV_OPTIONS = Object.entries(DIVISIONS)
  .filter(([id]) => id !== 'general')
  .map(([id, v]) => ({ id, name: v.name, label: v.label }));

export default function TransactionModal({
  isOpen,
  onClose,
  onSaved,
  editData,
  defaultOwner = 'tomo',
  projects = [],
  upgradeForParent = null,
}: TransactionModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v0.14.4: 連打ガード（state更新遅延の隙間を埋める・モバイル二重タップ対策）
  const saveInProgressRef = useRef(false);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [dupConfirmed, setDupConfirmed] = useState(false);
  const [transportData, setTransportData] = useState<TransportData>({ ...EMPTY_TRANSPORT });
  const [entertainmentData, setEntertainmentData] = useState<EntertainmentData>({ ...EMPTY_ENTERTAINMENT });
  const [allocRows, setAllocRows] = useState<AllocRow[]>([]);
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ExpenseTemplate | null>(null);
  // v0.7: route_templates (物理経路マスタ)
  const [routeTemplates, setRouteTemplates] = useState<RouteTemplate[]>([]);
  const [selectedOutboundRoute, setSelectedOutboundRoute] = useState<RouteTemplate | null>(null);
  const [selectedReturnRoute, setSelectedReturnRoute] = useState<RouteTemplate | null>(null);
  const [greenMode, setGreenMode] = useState(false);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedFormSnapshot, setSavedFormSnapshot] = useState<any>(null);
  // v0.13.1: ルートも同時にテンプレ化（交通費時のみ）— v0.14.0 Phase 4 でモード分岐に拡張
  const [alsoSaveRoute, setAlsoSaveRoute] = useState(false);
  const [routeTemplateName, setRouteTemplateName] = useState('');
  // v0.14.0 Phase 4: 往復時の3チェックボックス（往路・復路・パッケージ）
  const [saveOutboundEnabled, setSaveOutboundEnabled] = useState(false);
  const [outboundTemplateName, setOutboundTemplateName] = useState('');
  const [saveReturnEnabled, setSaveReturnEnabled] = useState(false);
  const [returnTemplateName, setReturnTemplateName] = useState('');
  const [savePackageEnabled, setSavePackageEnabled] = useState(false);
  const [packageTemplateName, setPackageTemplateName] = useState('');
  // v0.11.0: 複数領収書（ステージング方式）
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [pendingReceiptTrashIds, setPendingReceiptTrashIds] = useState<string[]>([]);
  const [pendingReceiptDeleteIds, setPendingReceiptDeleteIds] = useState<string[]>([]);
  const [initialReceiptItems, setInitialReceiptItems] = useState<ReceiptItem[] | null>(null);
  // v0.10.0: AI会計相談モーダル表示制御
  const [showConsultation, setShowConsultation] = useState(false);
  // v0.14.7: 勘定科目パーソナライズ（ownerごとの使用頻度上位3件）
  const [topKamoku, setTopKamoku] = useState<string[]>([]);

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    store: '',
    kamoku: '',
    owner: defaultOwner === 'all' ? 'tomo' : defaultOwner,
    description: '',
    status: 'settled',
    actual_payment_date: '',
    item_name: '',
    eq_category: '',
    eq_maker: '',
    eq_serial: '',
    eq_business_ratio: '100',
    eq_warranty_date: '',
    sub_category: '', // v0.15.0: 制作費・取材費の内訳タグ
  });

  // v0.15.0: 内訳タグマスタ（sub_categories テーブルから取得）
  const [subCategories, setSubCategories] = useState<{ id: string; key: string; label: string; parent_kamoku: string; display_order: number; is_active: boolean }[]>([]);

  // v0.15.3: AI OCR後、推定科目が一般系（travel/entertainment/meeting等）の時に
  // 「制作費・取材費の可能性はありませんか？」とアナウンス表示するためのフラグ
  const [productionHint, setProductionHint] = useState(false);
  // v0.15.4: AI推定の内訳タグヒント（制作費/取材費に変更時に併せて反映する用）
  const [aiSubCategoryHint, setAiSubCategoryHint] = useState<string | null>(null);
  // v0.40.0: アップグレード追加モード時の親取引情報
  // v0.41.0: 親登録成功直後に「追加領収書ありますか?」ポップアップを出すための一時保存
  const [pendingAddonPrompt, setPendingAddonPrompt] = useState<{
    parentTxId: string;
    parentDate: string;
    parentStore: string | null;
    parentOwner: string;
    parentKamoku: string;
    parentSubCategory: string | null;
    parentDescription: string | null;
    parentAllocRows: AllocRow[];
    parentTransport: TransportData | null;
    parentReceiptFiles: { fileName: string; driveFileId: string; driveUrl: string }[]; // 親PDFの参照
    detectedAddons: NonNullable<ReceiptExtractedData['addon_charges']> | null; // OCRで既に検出済の場合
  } | null>(null);

  // v0.39.0: AI が trip_legs を検出した際の判定旗印(モーダル内バナー表示用)
  const [aiTripLegsDetected, setAiTripLegsDetected] = useState<{
    legCount: number;
    fareMode: string | null;
    firstFlight: string | null;
    lastFlight: string | null;
  } | null>(null);

  // v0.41.0: OCR で検出されたが「保留中」の追加課金リスト(親登録後にポップアップで提示)
  const ocrAddonChargesRef = useRef<NonNullable<ReceiptExtractedData['addon_charges']> | null>(null);

  // テンプレート取得（モーダルopen時 — transport + general 両方）
  useEffect(() => {
    if (!isOpen || !supabase) return;
    const owner = defaultOwner === 'all' ? 'tomo' : defaultOwner;
    supabase
      .from('expense_templates')
      .select('*')
      .eq('owner', owner)
      .order('use_count', { ascending: false })
      .then(({ data }: { data: any }) => {
        if (data) setTemplates(data as ExpenseTemplate[]);
      });
    // v0.7: route_templates取得
    // v0.14.0: archived_at IS NULL のみ取得（論理削除済みは非表示）
    supabase
      .from('route_templates')
      .select('*')
      .eq('owner', owner)
      .is('archived_at', null)
      .order('use_count', { ascending: false })
      .then(({ data }: { data: any }) => {
        if (data) setRouteTemplates(data as RouteTemplate[]);
      });
    // v0.15.0: sub_categories取得（内訳タグマスタ）
    supabase
      .from('sub_categories' as any)
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }: { data: any }) => {
        if (data) setSubCategories(data);
      });
  }, [isOpen, defaultOwner]);

  // v0.14.7: 勘定科目パーソナライズ（form.owner の直近3ヶ月の使用頻度上位3件を取得）
  useEffect(() => {
    if (!isOpen || !supabase || !form.owner) return;
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const fromDate = threeMonthsAgo.toISOString().split('T')[0];
    supabase
      .from('transactions')
      .select('kamoku')
      .eq('owner', form.owner)
      .eq('tx_type', 'expense')
      .gte('date', fromDate)
      .then(({ data }: { data: any }) => {
        if (!data) { setTopKamoku([]); return; }
        const freq: Record<string, number> = {};
        (data as Array<{ kamoku: string }>).forEach((tx) => {
          if (tx.kamoku) freq[tx.kamoku] = (freq[tx.kamoku] || 0) + 1;
        });
        const top = Object.entries(freq)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([k]) => k)
          .filter((k) => k in KAMOKU)
          // v0.29.0: 非アクティブ科目(welfare等)は定番から除外
          .filter((k) => (KAMOKU[k as keyof typeof KAMOKU] as { is_active?: boolean }).is_active !== false);
        setTopKamoku(top);
      });
  }, [isOpen, form.owner]);

  // グリーン車モード切替時にamountを更新（v0.7: 汎用テンプレのみ対象）
  useEffect(() => {
    if (!selectedTemplate || selectedTemplate.template_type !== 'general') return;
    const amt = greenMode && selectedTemplate.green_amount
      ? selectedTemplate.green_amount
      : selectedTemplate.amount || 0;
    setForm(prev => ({ ...prev, amount: amt.toString() }));
  }, [greenMode, selectedTemplate]);

  useEffect(() => {
    // v0.39.0: モーダル開閉・編集対象切替時にAI判定旗印をクリア
    setAiTripLegsDetected(null);
    if (editData) {
      setForm({
        date: editData.date,
        amount: editData.amount.toString(),
        store: editData.store || '',
        kamoku: editData.kamoku,
        owner: editData.owner,
        description: editData.description?.replace(/^【品名】[^\n]*\n?/, '') || '',
        status: editData.status || 'settled',
        actual_payment_date: editData.actual_payment_date || '',
        item_name: editData.description?.match(/^【品名】(.+?)(\n|$)/)?.[1] || '',
        eq_category: '',
        eq_maker: '',
        eq_serial: '',
        eq_business_ratio: '100',
        eq_warranty_date: '',
        sub_category: (editData as any).sub_category || '', // v0.15.0
      });
      // 既存equipment_item読み込み
      if (editData.kamoku === 'equipment' && supabase) {
        supabase.from('equipment_items').select('*').eq('transaction_id', editData.id).single().then(({ data: eqData }: { data: any }) => {
          if (eqData) {
            setForm(prev => ({
              ...prev,
              eq_category: eqData.category || '',
              eq_maker: eqData.maker || '',
              eq_serial: eqData.serial || '',
              eq_business_ratio: (eqData.business_ratio ?? 100).toString(),
              eq_warranty_date: eqData.warranty_date || '',
            }));
          }
        });
      }
      if (usesTransportDetail(editData.kamoku)) {
        loadTransportDetails(editData.id).then((td) => {
          if (!td) {
            setTransportData({ ...EMPTY_TRANSPORT });
            return;
          }
          // v0.14.0: 旧データの return_mode 互換変換
          // 旧: same_route / same_amount の組み合わせ → 新: return_mode
          if (!td.return_mode && td.round_trip === 'round_trip') {
            if (td.same_route && td.same_amount) {
              td.return_mode = 'auto_reverse';
            } else if (td.same_route && !td.same_amount) {
              // 同ルート・別金額: return_amount で金額差を表現していた旧パターン
              // → 新UIでは manual モードとして、逆順化した区間に return_amount を第1 legの金額として載せる
              const reversedLegs = td.route_legs
                .slice()
                .reverse()
                .map((l) => ({
                  from: l.to,
                  to: l.from,
                  method: l.method,
                  carrier: l.carrier,
                  amount: 0,
                  green: l.green,
                }));
              if (reversedLegs.length > 0) {
                reversedLegs[0].amount = td.return_amount || 0;
              }
              td.return_mode = 'manual';
              td.return_legs = reversedLegs;
            } else {
              // 別ルート: return_legs がそのまま利用可能
              td.return_mode = td.return_legs.length > 0 ? 'manual' : 'different_route';
            }
          } else if (!td.return_mode) {
            td.return_mode = 'auto_reverse';
          }
          setTransportData(td);
        });
      } else {
        setTransportData({ ...EMPTY_TRANSPORT });
      }
      setEntertainmentData({ ...EMPTY_ENTERTAINMENT });
      if (supabase) {
        supabase.from('transaction_allocations').select('*').eq('transaction_id', editData.id).then(({ data }: { data: any }) => {
          if (data && data.length > 0) {
            const isPjRequired = (PROJECT_TAG_REQUIRED_KAMOKU as readonly string[]).includes(editData.kamoku);
            setAllocRows(data.map((a: any) => ({
              division_id: a.division_id || '',
              // v0.13.0: PJ必須科目で保存済のproject_id=null → 「未登録案件」として復元
              project_id: a.project_id || (isPjRequired ? UNASSIGNED_PROJECT_VALUE : ''),
              percent: a.percent || 0,
            })));
          } else {
            setAllocRows([]);
          }
        });
      }
      // v0.11.0: 既存領収書をフェッチ
      if (supabase) {
        supabase.from('expense_receipts' as any)
          .select('*')
          .eq('transaction_id', editData.id)
          .order('seq_no', { ascending: true })
          .then(({ data }: { data: any }) => {
            if (data && data.length > 0) {
              const items: ReceiptItem[] = data.map((r: any) => ({
                clientId: `db_${r.id}`,
                staged: false,
                dbId: r.id,
                fileName: r.original_filename || r.generated_filename || 'receipt',
                mimeType: r.mime_type || 'application/octet-stream',
                driveFileId: r.drive_file_id,
                driveUrl: r.drive_url,
                generatedFilename: r.generated_filename,
                label: r.label || '',
                aiExtractedAmount: r.ai_extracted_amount,
              }));
              setReceiptItems(items);
              setInitialReceiptItems(items);
            } else {
              setReceiptItems([]);
              setInitialReceiptItems([]);
            }
          });
      }
      setPendingReceiptTrashIds([]);
      setPendingReceiptDeleteIds([]);
    } else {
      // v0.40.0: アップグレード追加モード — 親取引の情報を継承して新規取引フォームをプリセット
      const isUpgradeMode = !!upgradeForParent;
      const upgradeParentLeg = upgradeForParent?.parentTransport?.route_legs?.[0];
      setForm({
        date: isUpgradeMode ? (upgradeForParent.parentDate || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
        amount: '',
        store: isUpgradeMode ? (upgradeForParent.parentStore || '') : '',
        kamoku: isUpgradeMode ? 'travel' : '',
        owner: isUpgradeMode ? upgradeForParent.parentOwner : (defaultOwner === 'all' ? 'tomo' : defaultOwner),
        description: isUpgradeMode && upgradeParentLeg
          ? `${upgradeParentLeg.flight_train_no || upgradeParentLeg.carrier || ''} 当日アップグレード`.trim()
          : '',
        status: 'settled',
        actual_payment_date: '',
        item_name: '',
        eq_category: '',
        eq_maker: '',
        eq_serial: '',
        eq_business_ratio: '100',
        eq_warranty_date: '',
        sub_category: '', // v0.15.0
      });
      if (isUpgradeMode && upgradeParentLeg) {
        // 親取引から from/to/手段/会社/便名を継承し、クラスは未設定(ボスがチップで選ぶ)
        setTransportData({
          ...EMPTY_TRANSPORT,
          purpose: upgradeForParent?.parentTransport?.purpose || '商談',
          payment_method: upgradeForParent?.parentTransport?.payment_method || 'ic',
          route_legs: [{
            from: upgradeParentLeg.from || '',
            to: upgradeParentLeg.to || '',
            method: upgradeParentLeg.method || '飛行機',
            carrier: upgradeParentLeg.carrier || '',
            amount: 0,
            green: false,
            green_amount: 0,
            class_value: '', // ボスが選択
            class_reason: '',
            client_name: '',
            flight_train_no: upgradeParentLeg.flight_train_no || '',
            passenger_count: upgradeParentLeg.passenger_count || 1,
            companion_memo: '',
          }],
          round_trip: 'one_way',
          fare_input_mode: null,
        });
      } else {
        setTransportData({ ...EMPTY_TRANSPORT });
      }
      setEntertainmentData({ ...EMPTY_ENTERTAINMENT });
      setAllocRows([]);
      setSelectedTemplate(null);
      setSelectedOutboundRoute(null);
      setSelectedReturnRoute(null);
      setGreenMode(false);
      setShowTemplateSave(false);
      setTemplateName('');
      setSavedFormSnapshot(null);
      setReceiptItems([]);
      setInitialReceiptItems(null);
      setPendingReceiptTrashIds([]);
      setPendingReceiptDeleteIds([]);
    }
    setError(null);
    setDupWarning(null);
    setDupConfirmed(false);
  }, [editData, isOpen, defaultOwner, upgradeForParent]);

  // v0.14.0 Phase 4: 片道ルートテンプレ + 逆順ペアを自動生成
  // 保存成功時に片道A.id を返す（パッケージ生成で使用）
  const saveOnewayWithPair = async (params: {
    owner: string;
    name: string;
    legs: any[];
  }): Promise<string | null> => {
    if (!supabase) return null;
    const { owner, name, legs } = params;
    // 1. 正方向の片道テンプレを保存
    const { data: aData, error: aErr } = await supabase
      .from('route_templates')
      .insert({
        owner,
        name,
        direction: 'oneway_only', // DEPRECATED
        route_legs: legs,
        amount: legs.reduce((s: number, l: any) => s + (l.amount || 0), 0), // DEPRECATED
        use_count: 0,
        sort_order: 0,
        template_kind: 'oneway',
      })
      .select('id')
      .single();
    if (aErr || !aData) {
      console.error('片道テンプレ保存エラー:', aErr);
      return null;
    }
    const aId = aData.id;

    // 2. 逆順ペア B を自動生成
    const reversedLegs = reverseRouteLegs(legs);
    const bName = generateReverseName(name);
    const { data: bData, error: bErr } = await supabase
      .from('route_templates')
      .insert({
        owner,
        name: bName,
        direction: 'oneway_only', // DEPRECATED
        route_legs: reversedLegs,
        amount: reversedLegs.reduce((s: number, l: any) => s + (l.amount || 0), 0), // DEPRECATED
        use_count: 0,
        sort_order: 0,
        template_kind: 'oneway',
        paired_reverse_id: aId,
      })
      .select('id')
      .single();
    if (bErr || !bData) {
      console.error('逆順ペア保存エラー:', bErr);
      return aId; // 正方向は保存できたので aId は返す
    }
    const bId = bData.id;

    // 3. A.paired_reverse_id = B.id に相互リンク
    await supabase
      .from('route_templates')
      .update({ paired_reverse_id: bId })
      .eq('id', aId);

    return aId;
  };

  // v0.14.0 Phase 4: パッケージテンプレを保存
  const savePackage = async (params: {
    owner: string;
    name: string;
    outboundId: string;
    returnId: string;
  }): Promise<string | null> => {
    if (!supabase) return null;
    const { owner, name, outboundId, returnId } = params;
    const { data, error } = await supabase
      .from('route_templates')
      .insert({
        owner,
        name,
        direction: 'bidirectional', // DEPRECATED
        route_legs: [],
        amount: 0, // DEPRECATED
        use_count: 0,
        sort_order: 0,
        template_kind: 'roundtrip_package',
        outbound_route_id: outboundId,
        return_route_id: returnId,
      })
      .select('id')
      .single();
    if (error || !data) {
      console.error('パッケージ保存エラー:', error);
      return null;
    }
    return data.id;
  };

  // v0.14.0 Phase 4: ルート名から逆順名を生成
  // 「A→B」→「B→A」、「A→B（JR）」→「B→A（JR）」
  const generateReverseName = (name: string): string => {
    // 末尾の括弧書き補足を保持（例: 「(JR)」「（新宿経由）」）
    const match = name.match(/^(.+?)([\s　]*[（(].+[）)])?$/);
    const base = match?.[1] || name;
    const suffix = match?.[2] || '';
    // 「→」「->」「->」「⇒」「⇄」「⇔」で分割して逆転
    const separators = /(→|->|⇒|⇄|⇔)/;
    const parts = base.split(separators);
    if (parts.length === 3) {
      const [from, sep, to] = parts;
      return `${to.trim()}${sep}${from.trim()}${suffix}`;
    }
    // パース失敗時は「逆 + 元の名前」をフォールバック
    return `逆順 ${name}`;
  };

  // テンプレとして保存 — v0.14.0 Phase 4 対応
  const saveAsTemplate = async () => {
    if (!supabase || !savedFormSnapshot) return;
    const snap = savedFormSnapshot;
    const isTransport = usesTransportDetail(snap.kamoku);
    const td = snap.transportData;
    const isRoundTrip = td?.round_trip === 'round_trip';
    const returnMode = td?.return_mode || 'auto_reverse';

    // 経費テンプレが入力されているかどうか
    const wantsExpenseTemplate = templateName.trim().length > 0;

    // 交通費の往復モードでは multi UI 方式（v0.14.7: auto_reverse も含む）
    const useMultiRouteMode = isTransport && isRoundTrip && td && (
      ((returnMode === 'different_route' || returnMode === 'manual') && td.return_legs.length > 0) ||
      (returnMode === 'auto_reverse')
    );

    // モード判定
    // - multiMode: 往路・復路・パッケージの3択
    // - simpleRouteMode: 片道 or 往復auto_reverseで片道テンプレ1つ保存
    // - expenseOnlyMode: 経費テンプレのみ（交通費以外）

    try {
      // === 1. 経費テンプレ保存 ===
      if (wantsExpenseTemplate && isTransport && td) {
        const legs = td.route_legs || [];
        const total = legs.reduce((s: number, l: any) => s + (l.amount || 0), 0);
        await supabase.from('expense_templates').insert({
          owner: snap.owner,
          name: templateName.trim(),
          template_type: 'transport',
          kamoku: 'transport',
          description: snap.description || '',
          route_legs: legs,
          amount: total,
          green_amount: 0,
          payment_method: snap.payment_method || 'personal',
          allocations: allocRows.filter(r => r.division_id).map(r => ({
            division_id: r.division_id,
            project_id: r.project_id || null,
            percent: r.percent || 0,
          })),
          use_count: 0,
        });
      } else if (wantsExpenseTemplate && !isTransport) {
        // 汎用テンプレ
        await supabase.from('expense_templates').insert({
          owner: snap.owner,
          name: templateName.trim(),
          template_type: 'general',
          kamoku: snap.kamoku,
          store: snap.store || '',
          description: snap.description || '',
          amount: snap.amount || 0,
          route_legs: [],
          green_amount: 0,
          payment_method: snap.payment_method || 'personal',
          allocations: allocRows.filter(r => r.division_id).map(r => ({
            division_id: r.division_id,
            project_id: r.project_id || null,
            percent: r.percent || 0,
          })),
          use_count: 0,
        });
      }

      // === 2. ルートテンプレ保存 ===
      if (isTransport && td) {
        const outboundLegs = td.route_legs || [];

        if (useMultiRouteMode) {
          let outboundId: string | null = selectedOutboundRoute?.id || null;
          let returnId: string | null = selectedReturnRoute?.id || null;

          if (returnMode === 'auto_reverse') {
            // v0.14.7: auto_reverse モードでの2段構え保存
            //   第1段: 逆順片道テンプレ保存（往路新規 or 往路既存+paired_reverse_idなし）
            //   第2段: パッケージ保存
            if (saveOutboundEnabled && outboundTemplateName.trim() && outboundLegs.length > 0) {
              // 往路新規入力ケース: saveOnewayWithPair で往路A + 逆順B を一気に作成
              const newOutboundId = await saveOnewayWithPair({
                owner: snap.owner,
                name: outboundTemplateName.trim(),
                legs: outboundLegs,
              });
              if (newOutboundId) {
                outboundId = newOutboundId;
                // 自動生成された paired_reverse_id を fetch して returnId に使う
                const { data: pair } = await supabase
                  .from('route_templates')
                  .select('paired_reverse_id')
                  .eq('id', newOutboundId)
                  .single();
                returnId = (pair as any)?.paired_reverse_id || null;
              }
            } else if (saveReturnEnabled && returnTemplateName.trim() && selectedOutboundRoute) {
              // 往路既存 + paired_reverse_id なしケース: 逆順片道を新規保存して往路にリンク
              const reversedLegs = reverseRouteLegs(outboundLegs);
              if (reversedLegs.length > 0) {
                const { data: bData } = await supabase
                  .from('route_templates')
                  .insert({
                    owner: snap.owner,
                    name: returnTemplateName.trim(),
                    direction: 'oneway_only',
                    route_legs: reversedLegs,
                    amount: reversedLegs.reduce((s: number, l: any) => s + (l.amount || 0), 0),
                    use_count: 0,
                    sort_order: 0,
                    template_kind: 'oneway',
                    paired_reverse_id: selectedOutboundRoute.id,
                  })
                  .select('id')
                  .single();
                if (bData) {
                  returnId = (bData as any).id;
                  // 往路側にも相互リンク
                  await supabase
                    .from('route_templates')
                    .update({ paired_reverse_id: returnId })
                    .eq('id', selectedOutboundRoute.id);
                }
              }
            } else if (selectedOutboundRoute?.paired_reverse_id) {
              // 往路既存 + paired_reverse_id あり → 既存の逆順を参照
              returnId = selectedOutboundRoute.paired_reverse_id;
            }
            // パッケージ保存
            if (savePackageEnabled && packageTemplateName.trim() && outboundId && returnId) {
              await savePackage({
                owner: snap.owner,
                name: packageTemplateName.trim(),
                outboundId,
                returnId,
              });
            }
          } else {
            // different_route / manual モード（従来通り）
            // 往路保存
            if (saveOutboundEnabled && outboundTemplateName.trim() && outboundLegs.length > 0) {
              outboundId = await saveOnewayWithPair({
                owner: snap.owner,
                name: outboundTemplateName.trim(),
                legs: outboundLegs,
              });
            }
            // 復路保存
            if (saveReturnEnabled && returnTemplateName.trim() && td.return_legs.length > 0) {
              returnId = await saveOnewayWithPair({
                owner: snap.owner,
                name: returnTemplateName.trim(),
                legs: td.return_legs,
              });
            }
            // パッケージ保存（往復IDが両方揃っているときのみ）
            if (savePackageEnabled && packageTemplateName.trim() && outboundId && returnId) {
              await savePackage({
                owner: snap.owner,
                name: packageTemplateName.trim(),
                outboundId,
                returnId,
              });
            }
          }
        } else {
          // v0.38.0: 片道モード/routeOnlyMode のモーダル経由ルート保存は撤廃。
          // ルート保存はインラインUI（このルートをテンプレに保存する）で完結する。
          // multiMode（往復 different_route/manual / auto_reverse）のみモーダル経由を維持。
        }
      }
    } catch (err) {
      console.error('テンプレ保存エラー:', err);
    }
    // リセット
    setShowTemplateSave(false);
    setTemplateName('');
    setAlsoSaveRoute(false);
    setRouteTemplateName('');
    setSaveOutboundEnabled(false);
    setOutboundTemplateName('');
    setSaveReturnEnabled(false);
    setReturnTemplateName('');
    setSavePackageEnabled(false);
    setPackageTemplateName('');
    setSavedFormSnapshot(null);
    onClose();
  };

  // テンプレート適用（v0.7: 交通費テンプレは業務メタのみ、区間は別管理）
  const applyTemplate = async (tpl: ExpenseTemplate) => {
    let desc = '';
    let store = '';
    if (tpl.template_type === 'transport') {
      // v0.7: 業務メタのみ流し込み（区間は route_templates で別選択）
      desc = tpl.description || '';
      // transport_purpose と payment_method を TransportData へ反映
      setTransportData(prev => ({
        ...prev,
        purpose: tpl.transport_purpose || prev.purpose,
        payment_method: tpl.payment_method || prev.payment_method,
      }));
    } else {
      desc = tpl.description || '';
      store = tpl.store || '';
    }

    setSelectedTemplate(tpl);
    setGreenMode(false);
    setForm(prev => ({
      ...prev,
      // v0.7: 交通費テンプレの amount は 0 なので上書きしない
      ...(tpl.template_type === 'general' ? { amount: (tpl.amount || 0).toString() } : {}),
      description: desc,
      store,
      ...(tpl.template_type === 'general' && tpl.kamoku ? { kamoku: tpl.kamoku } : {}),
    }));

    // v0.6.4: 保存された事業・PJ割り当てを復元
    const tplAllocs = (tpl.allocations || []) as any[];
    if (Array.isArray(tplAllocs) && tplAllocs.length > 0) {
      setAllocRows(tplAllocs.map((a: any) => ({
        division_id: a.division_id || '',
        project_id: a.project_id || '',
        percent: a.percent || 0,
      })));
    }

    // use_count + 1
    if (supabase) {
      await supabase
        .from('expense_templates')
        .update({ use_count: (tpl.use_count || 0) + 1 })
        .eq('id', tpl.id);
    }
  };

  // v0.7: 往路ルートテンプレ適用
  const applyOutboundRoute = async (tpl: RouteTemplate) => {
    const legs = (tpl.route_legs || []) as any[];
    setTransportData(prev => ({
      ...prev,
      route_legs: legs.map((l: any) => ({
        from: l.from || '',
        to: l.to || '',
        method: l.method || '電車',
        carrier: l.carrier || '',
        amount: l.amount || 0,
        green: l.green || false,
      })),
    }));
    setSelectedOutboundRoute(tpl);
    if (supabase) {
      await supabase
        .from('route_templates')
        .update({ use_count: (tpl.use_count || 0) + 1 })
        .eq('id', tpl.id);
    }
  };

  // v0.7: 復路ルートテンプレ適用（別ルート時）
  const applyReturnRoute = async (tpl: RouteTemplate) => {
    const legs = (tpl.route_legs || []) as any[];
    setTransportData(prev => ({
      ...prev,
      same_route: false,
      return_legs: legs.map((l: any) => ({
        from: l.from || '',
        to: l.to || '',
        method: l.method || '電車',
        carrier: l.carrier || '',
        amount: l.amount || 0,
        green: l.green || false,
      })),
    }));
    setSelectedReturnRoute(tpl);
    if (supabase) {
      await supabase
        .from('route_templates')
        .update({ use_count: (tpl.use_count || 0) + 1 })
        .eq('id', tpl.id);
    }
  };

  // v0.7: 往路ルート選択解除（手動入力に戻す）
  const clearOutboundRoute = () => {
    setSelectedOutboundRoute(null);
    setTransportData(prev => ({
      ...prev,
      route_legs: [{ from: '', to: '', method: '電車', carrier: '', amount: 0, green: false }],
    }));
  };

  // v0.14.0: 統合ルート適用関数（片道テンプレ or パッケージテンプレ）
  // パッケージなら往路+復路を一括適用、片道なら往路のみ適用
  const applyRoute = async (tpl: RouteTemplate) => {
    if (!supabase) return;
    if (tpl.template_kind === 'roundtrip_package') {
      // パッケージ: outbound_route_id と return_route_id を fetch して適用
      if (!tpl.outbound_route_id || !tpl.return_route_id) {
        console.warn('パッケージに outbound/return が設定されていません:', tpl.id);
        return;
      }
      const { data: pair } = await supabase
        .from('route_templates')
        .select('*')
        .in('id', [tpl.outbound_route_id, tpl.return_route_id]);
      const outbound = (pair || []).find((r: any) => r.id === tpl.outbound_route_id) as RouteTemplate | undefined;
      const ret = (pair || []).find((r: any) => r.id === tpl.return_route_id) as RouteTemplate | undefined;
      if (!outbound || !ret) {
        console.warn('パッケージの参照先片道が見つかりません');
        return;
      }
      const outLegs = (outbound.route_legs || []) as any[];
      const retLegs = (ret.route_legs || []) as any[];
      setTransportData(prev => ({
        ...prev,
        round_trip: 'round_trip',
        return_mode: 'different_route',
        same_route: false,
        same_amount: false,
        route_legs: outLegs.map((l: any) => ({
          from: l.from || '', to: l.to || '',
          method: l.method || '電車', carrier: l.carrier || '',
          amount: l.amount || 0, green: l.green || false,
        })),
        return_legs: retLegs.map((l: any) => ({
          from: l.from || '', to: l.to || '',
          method: l.method || '電車', carrier: l.carrier || '',
          amount: l.amount || 0, green: l.green || false,
        })),
      }));
      setSelectedOutboundRoute(outbound);
      setSelectedReturnRoute(ret);
      // use_count インクリメント（パッケージと参照先両方）
      await supabase.from('route_templates').update({ use_count: (tpl.use_count || 0) + 1 }).eq('id', tpl.id);
    } else {
      // 片道: 往路のみ適用（round_trip は現在値を維持）
      const legs = (tpl.route_legs || []) as any[];
      setTransportData(prev => ({
        ...prev,
        route_legs: legs.map((l: any) => ({
          from: l.from || '', to: l.to || '',
          method: l.method || '電車', carrier: l.carrier || '',
          amount: l.amount || 0, green: l.green || false,
        })),
      }));
      setSelectedOutboundRoute(tpl);
      await supabase.from('route_templates').update({ use_count: (tpl.use_count || 0) + 1 }).eq('id', tpl.id);
    }
  };

  // v0.14.0: ルート選択解除（統合）
  const clearRoute = () => {
    setSelectedOutboundRoute(null);
    setSelectedReturnRoute(null);
    setTransportData(prev => ({
      ...prev,
      route_legs: [{ from: '', to: '', method: '電車', carrier: '', amount: 0, green: false }],
      return_legs: prev.round_trip === 'round_trip' ? prev.return_legs : [],
    }));
  };

  // v0.14.0: 復路のみ片道テンプレ適用（「別の片道テンプレを選ぶ」モード用）
  const applyReturnRouteOnly = async (tpl: RouteTemplate) => {
    if (!supabase || tpl.template_kind !== 'oneway') return;
    const legs = (tpl.route_legs || []) as any[];
    setTransportData(prev => ({
      ...prev,
      return_mode: 'different_route',
      same_route: false,
      same_amount: false,
      return_legs: legs.map((l: any) => ({
        from: l.from || '', to: l.to || '',
        method: l.method || '電車', carrier: l.carrier || '',
        amount: l.amount || 0, green: l.green || false,
      })),
    }));
    setSelectedReturnRoute(tpl);
    await supabase.from('route_templates').update({ use_count: (tpl.use_count || 0) + 1 }).eq('id', tpl.id);
  };

  
  const addAllocRow = () => {
    // v0.6.2: 現状の合計を100まで埋めるpercent値を自動算出（最大100%）
    const currentTotal = allocRows.reduce((s, r) => s + r.percent, 0);
    const defaultPercent = Math.max(0, Math.min(100, 100 - currentTotal));
    setAllocRows(prev => [...prev, { division_id: '', project_id: '', percent: defaultPercent }]);
  };
  const removeAllocRow = (idx: number) => {
    setAllocRows(prev => prev.filter((_, i) => i !== idx));
  };
  const updateAllocRow = (idx: number, field: keyof AllocRow, value: string | number) => {
    setAllocRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value };
      // 事業変更時にPJリセット（紐づかないPJを選択したままにしない）
      if (field === 'division_id') updated.project_id = '';
      return updated;
    }));
  };

  const totalPercent = allocRows.reduce((s, r) => s + r.percent, 0);
  const hasAllocRows = allocRows.length > 0;

  // v0.9.0: 領収書AI抽出結果を受け取ってformに反映
  const handleReceiptExtracted = (data: ReceiptExtractedData) => {
    // 科目推定（AI抽出 → vendor推定 → misc）
    const validKamoku = data.kamoku_hint && (data.kamoku_hint in KAMOKU) ? data.kamoku_hint : null;
    const inferredKamoku = validKamoku || guessKamokuIdFromVendor(data.vendor);

    // v0.10.2: サブスク・通信費・ソフトウェアの場合、請求期間を description に追記
    let descSuffix = '';
    if (
      (inferredKamoku === 'subscription' || inferredKamoku === 'communication' || inferredKamoku === 'software') &&
      data.billing_period_from && data.billing_period_to
    ) {
      descSuffix = `【請求期間】${data.billing_period_from} 〜 ${data.billing_period_to}`;
    }

    // v0.10.2: 物品購入の場合、品名に型番を併記
    let itemNameWithModel = data.item_name || '';
    if (
      (inferredKamoku === 'equipment' || inferredKamoku === 'supplies' || inferredKamoku === 'production') &&
      data.item_name && data.model_number
    ) {
      itemNameWithModel = `${data.item_name}（型番: ${data.model_number}）`;
    }

    setForm(prev => ({
      ...prev,
      date: data.date || prev.date,
      amount: data.amount?.toString() || prev.amount,
      store: data.vendor || prev.store,
      kamoku: inferredKamoku,
      item_name: itemNameWithModel || prev.item_name,
      description: descSuffix
        ? (prev.description ? `${prev.description}\n${descSuffix}` : descSuffix)
        : prev.description,
      // v0.15.4: AI推定の内訳タグを反映（制作費/取材費時のみ有効）
      sub_category: (inferredKamoku === 'production' || inferredKamoku === 'torizai') && data.sub_category_hint
        ? data.sub_category_hint
        : prev.sub_category,
    }));

    // v0.15.3: 推定科目が一般系（制作費・取材費ではない経費科目）の時、
    // 「制作費・取材費の可能性はありませんか？」というアナウンスを出す
    // 対象: 業務上、制作費/取材費に振り替えられる可能性が高い科目のみ
    const HINT_KAMOKU = ['travel', 'entertainment', 'meeting', 'welfare', 'supplies', 'equipment', 'misc'];
    if (HINT_KAMOKU.includes(inferredKamoku)) {
      setProductionHint(true);
    } else {
      setProductionHint(false);
    }
    // v0.15.4: AI が内訳タグを推定していた場合、キャッシュしてバナーで制作費/取材費に変更時に使えるようにする
    // ただし prod_* / tori_* のプレフィックスで parent_kamoku を判別できるキーのみ採用
    if (data.sub_category_hint && (data.sub_category_hint.startsWith('prod_') || data.sub_category_hint.startsWith('tori_'))) {
      setAiSubCategoryHint(data.sub_category_hint);
    } else {
      setAiSubCategoryHint(null);
    }

    // v0.10.1: 交通費の場合、ルート・往復・支払方法を transportData に自動流し込み
    // v0.39.0: trip_legs 配列を最優先で反映(複数区間の往復領収書対応)
    if (inferredKamoku === 'travel' || inferredKamoku === 'production' || inferredKamoku === 'torizai') {
      const validPaymentMethods = ['ic', 'cash', 'credit', 'invoice'];
      const aiPayment = data.payment_method && validPaymentMethods.includes(data.payment_method)
        ? data.payment_method
        : null;

      // v0.39.0 method推定共通関数(trip_legs各区間で再利用)
      const classHintMap: Record<string, string> = {
        'self_seat': '自由席', 'reserved': '指定席', 'green': 'グリーン',
        'gran_class': 'グランクラス', 'premium_seat': '個室・プレミアム',
        'economy': '普通席', 'premium_economy': 'プレエコ',
        'business': 'ビジネス', 'first': 'ファースト',
        'class_j': 'クラスJ', 'ana_premium': 'プレミアム',
      };
      const inferMethod = (carrierStr: string, flightNoStr: string, hintMethod?: string): string => {
        // hintMethod が AI から直接来ていれば優先
        if (hintMethod && ['飛行機','新幹線','特急','普通電車','バス','タクシー','レンタカー','自家用車','フェリー'].includes(hintMethod)) {
          return hintMethod;
        }
        const c = carrierStr.toLowerCase();
        const f = flightNoStr;
        if (/jal|ana|skymark|peach|jetstar|航空|airlines/i.test(c) || /^[A-Z]{2}\d/.test(f)) return '飛行機';
        if (/新幹線|のぞみ|ひかり|こだま|やまびこ|はやぶさ|かがやき|つばさ|あさま|とき|たにがわ|さくら|つばめ|みずほ/i.test(c + f)) return '新幹線';
        if (/特急|あずさ|かいじ|あさぎり|サンダーバード|しらさぎ|ひだ|南紀|くろしお|はるか|スペーシア|しおかぜ|南風|あしずり|うずしお|ソニック|かもめ|みどり|ゆふいんの森|ロマンスカー|laview|ライナー/i.test(c + f)) return '特急';
        if (/jr|私鉄|電鉄|鉄道/i.test(c)) return '普通電車';
        return '普通電車';
      };

      setTransportData(prev => {
        const next = { ...prev };

        // ★ v0.39.0: trip_legs 配列が来ていれば最優先で複数区間自動展開
        const tripLegs = Array.isArray(data.trip_legs) ? data.trip_legs : null;
        if (tripLegs && tripLegs.length >= 1) {
          const buildLeg = (raw: any, fallback: any = {}) => ({
            from: String(raw?.from || fallback.from || ''),
            to: String(raw?.to || fallback.to || ''),
            method: inferMethod(String(raw?.carrier || data.carrier || ''), String(raw?.flight_or_train_no || ''), raw?.method),
            carrier: String(raw?.carrier || data.carrier || fallback.carrier || ''),
            amount: Number(raw?.amount_for_this_leg) || 0,
            green: raw?.class_hint === 'green',
            green_amount: 0,
            class_value: raw?.class_hint ? (classHintMap[String(raw.class_hint)] || '') : (fallback.class_value || ''),
            class_reason: '',
            client_name: '',
            flight_train_no: String(raw?.flight_or_train_no || ''),
            passenger_count: Number(data.passenger_count) > 0 ? Number(data.passenger_count) : 1,
            companion_memo: '',
          });

          if (tripLegs.length === 1) {
            // 片道領収書 — 区間1のみ反映
            next.route_legs = [buildLeg(tripLegs[0], prev.route_legs?.[0])];
            next.round_trip = 'one_way';
            next.fare_input_mode = null;
          } else {
            // 複数区間 — 1個目=往路・2個目以降=復路
            next.round_trip = 'round_trip';
            next.route_legs = [buildLeg(tripLegs[0], prev.route_legs?.[0])];
            next.return_legs = tripLegs.slice(1).map((l: any, i: number) =>
              buildLeg(l, prev.return_legs?.[i] || prev.route_legs?.[0])
            );
            // fare_input_mode は AI のヒントを優先
            const fim = data.fare_input_mode_hint;
            if (fim === 'round_trip_total' || fim === 'per_leg' || fim === 'one_way') {
              next.fare_input_mode = fim === 'one_way' ? null : fim;
            } else {
              // ヒント未提供 → 全区間 amount_for_this_leg が null なら round_trip_total と推定
              const allLegAmountsNull = tripLegs.every(l => !l?.amount_for_this_leg);
              next.fare_input_mode = allLegAmountsNull ? 'round_trip_total' : 'per_leg';
            }
            // round_trip_total 時は領収書合計金額を区間1の amount に格納(画面で「往復合計欄」として表示される)
            if (next.fare_input_mode === 'round_trip_total' && data.amount) {
              next.route_legs[0].amount = Number(data.amount);
              // 復路区間の金額は0(amountは画面非表示・合計には影響しない)
              next.return_legs = next.return_legs.map(l => ({ ...l, amount: 0 }));
            }
            next.return_mode = next.fare_input_mode === 'round_trip_total' ? 'manual' : 'manual';
            next.same_route = false;
            next.same_amount = false;
          }
        } else if (data.from_station && data.to_station) {
          // フォールバック(従来パス・trip_legs 未提供時)
          const firstLeg = prev.route_legs?.[0] || { from: '', to: '', method: '普通電車', carrier: '', amount: 0, green: false } as any;
          const carrierStr = String(data.carrier || '');
          const flightTrainNoStr = String(data.flight_train_no_hint || '');
          const inferredMethod = inferMethod(carrierStr, flightTrainNoStr);
          const inferredClassValue = data.transport_class_hint
            ? (classHintMap[String(data.transport_class_hint)] || '')
            : (firstLeg.class_value || '');
          const inferredPassengers = data.passenger_count && Number(data.passenger_count) > 0
            ? Number(data.passenger_count)
            : (firstLeg.passenger_count || 1);
          next.route_legs = [
            {
              ...firstLeg,
              from: data.from_station,
              to: data.to_station,
              method: inferredMethod,
              carrier: data.carrier || firstLeg.carrier || '',
              amount: data.amount || firstLeg.amount || 0,
              class_value: inferredClassValue,
              flight_train_no: data.flight_train_no_hint || firstLeg.flight_train_no || '',
              passenger_count: inferredPassengers,
            },
            ...prev.route_legs.slice(1),
          ];
          if (data.round_trip === 'one_way' || data.round_trip === 'round_trip') {
            next.round_trip = data.round_trip;
          }
        }

        // 支払方法
        if (aiPayment) {
          next.payment_method = aiPayment;
        }
        return next;
      });

      // v0.39.0: AI 判定の旗印を立てる(UI バナー表示用)
      if (Array.isArray(data.trip_legs) && data.trip_legs.length >= 2) {
        setAiTripLegsDetected({
          legCount: data.trip_legs.length,
          fareMode: data.fare_input_mode_hint || null,
          firstFlight: data.trip_legs[0]?.flight_or_train_no || null,
          lastFlight: data.trip_legs[data.trip_legs.length - 1]?.flight_or_train_no || null,
        });
      } else {
        setAiTripLegsDetected(null);
      }
    }

    // v0.41.0: 追加課金(アップグレード等)を一時保管 → 親登録成功後のポップアップで使用
    if (Array.isArray(data.addon_charges) && data.addon_charges.length > 0) {
      ocrAddonChargesRef.current = data.addon_charges;
    } else {
      ocrAddonChargesRef.current = null;
    }

    // v0.10.2: 接待交際費・会議費・取材費・福利厚生費の場合、人数を流し込み
    // ※ guest_name(取引先名)はレシートから読み取れないため自動入力しない（手入力必須）
    if (
      inferredKamoku === 'entertainment' ||
      inferredKamoku === 'meeting' ||
      inferredKamoku === 'torizai' ||
      inferredKamoku === 'welfare'
    ) {
      const guestCountStr = data.guest_count != null ? String(data.guest_count) : '';
      if (guestCountStr && /^\d+$/.test(guestCountStr)) {
        setEntertainmentData(prev => ({
          ...prev,
          guest_count: prev.guest_count || guestCountStr,
        }));
      }
    }
  };

  // v0.39.0: AI校閲結果モーダル制御
  const [auditResult, setAuditResult] = useState<{
    verdict: 'pass' | 'warning' | 'error';
    issues: Array<{ level: 'error' | 'warning' | 'info'; field: string; message: string; suggestion?: string }>;
    summary?: string;
  } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const auditBypassRef = useRef(false);

  // AI校閲を実行(handleSave 冒頭から呼ばれる)
  const runAudit = async (): Promise<{ shouldProceed: boolean }> => {
    if (auditBypassRef.current) {
      // 校閲済(バナーで「それでも登録」を押した) → そのまま進める
      auditBypassRef.current = false;
      return { shouldProceed: true };
    }
    setAuditing(true);
    try {
      const transactionPayload = {
        date: form.date,
        amount: form.amount ? Number(form.amount.replace(/,/g, '')) : 0,
        store: form.store,
        kamoku: form.kamoku,
        sub_category: form.sub_category,
        description: form.description,
        owner: form.owner,
        status: form.status,
        actual_payment_date: form.actual_payment_date,
      };
      // v0.40.1: AI校閲に渡すtransportDataから「ユーザー未入力の初期値」を除外
      // - production/torizai では purpose 入力欄が画面非表示のため、初期値「商談」を渡すとAIが誤認する
      // - class_value の初期値「普通席」もユーザー選択ではないため除外
      const cleanedTransport = (() => {
        if (!usesTransportDetail(form.kamoku) || !transportData) return null;
        const isProductionOrTorizai = form.kamoku === 'production' || form.kamoku === 'torizai';
        return {
          ...transportData,
          // 制作費/取材費では purpose欄が画面に出ない → 初期値を渡さない
          purpose: isProductionOrTorizai ? null : transportData.purpose,
          // 後方互換のclass_value/class_reason/companion/flight_train_no は区間レベルへ移行済 → 渡さない
          class_value: undefined,
          class_reason: undefined,
          companion: undefined,
          flight_train_no: undefined,
          route_note: undefined,
        };
      })();
      const res = await fetch('/api/transactions/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: transactionPayload,
          transportData: cleanedTransport,
          ocrData: null,
          // v0.40.1: AIに今日の日付を伝える(過去日/未来日判定の基準)
          today: new Date().toISOString().split('T')[0],
        }),
      });
      if (!res.ok) {
        // 校閲失敗時は通過扱い
        return { shouldProceed: true };
      }
      const result = await res.json();
      // v0.40.1: INFOレベルのみの指摘は無視(参考情報・登録ブロックしない)
      const blockingIssues = (result.issues || []).filter(
        (i: any) => i.level === 'error' || i.level === 'warning'
      );
      if (result.verdict === 'pass' || blockingIssues.length === 0) {
        return { shouldProceed: true };
      }
      // warning / error がある → モーダル表示で停止(INFO除外版)
      setAuditResult({ ...result, issues: blockingIssues });
      return { shouldProceed: false };
    } catch (e) {
      console.warn('audit failed, proceeding:', e);
      return { shouldProceed: true };
    } finally {
      setAuditing(false);
    }
  };

  const handleSave = async () => {
    // v0.14.4: 連打ガード（state更新遅延の隙間を埋める・モバイル二重タップ対策）
    // state の saving だと useState の非同期反映で隙間が生まれるため useRef で同期的に阻止
    if (saveInProgressRef.current) return;
    if (!form.amount || !form.date) {
      setError('日付と金額は必須です');
      return;
    }
    // v0.14.7: 勘定科目必須
    if (!form.kamoku) {
      setError('勘定科目を選択してください');
      return;
    }
    // v0.13.0: travel は必ず区間必須。production/torizai は区間が入力されていたら整合チェック
    if (form.kamoku === 'travel') {
      const legs = transportData.route_legs || [];
      if (legs.length === 0 || !legs[0].from || !legs[legs.length - 1].to) {
        setError('交通費の出発地・到着地は必須です');
        return;
      }
      if (legs.some(l => !l.from || !l.to)) {
        setError('すべての区間の出発地・到着地を入力してください');
        return;
      }
    } else if (usesTransportDetail(form.kamoku)) {
      // 制作費・取材費: 区間入力がある場合のみ整合チェック
      const legs = transportData.route_legs || [];
      const hasAnyInput = legs.some(l => l.from || l.to || l.amount);
      if (hasAnyInput && legs.some(l => !l.from || !l.to)) {
        setError('交通費詳細を入力する場合はすべての区間の出発地・到着地を入力してください');
        return;
      }
    }
    if (form.kamoku === 'entertainment' && !entertainmentData.guest_name) {
      setError('接待交際費の相手先名は必須です');
      return;
    }
    if (form.kamoku === 'equipment' && !form.item_name.trim()) {
      setError('消耗品費の品名は必須です');
      return;
    }
    // v0.8.2: 取材費・制作費は案件タグ（project_id）必須
    if ((PROJECT_TAG_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku)) {
      const hasProjectTag = allocRows.some(r => r.project_id);
      if (!hasProjectTag) {
        const kamokuName = KAMOKU[form.kamoku as keyof typeof KAMOKU]?.name || form.kamoku;
        setError(`${kamokuName}は案件タグが必須です。事業・PJ割り当てでPJを選択してください。`);
        return;
      }
    }
    // v0.13.0: 取材費・制作費は内容・摘要必須
    if ((DESCRIPTION_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku)) {
      if (!form.description || !form.description.trim()) {
        const kamokuName = KAMOKU[form.kamoku as keyof typeof KAMOKU]?.name || form.kamoku;
        setError(`${kamokuName}は内容・摘要の記入が必須です`);
        return;
      }
    }
    // v0.15.0: 取材費・制作費は内訳タグ（sub_category）必須
    if (requiresSubCategory(form.kamoku)) {
      if (!form.sub_category) {
        const kamokuName = KAMOKU[form.kamoku as keyof typeof KAMOKU]?.name || form.kamoku;
        setError(`${kamokuName}の項目を選んでください。`);
        return;
      }
    }
    // 按分バリデーション
    if (hasAllocRows) {
      if (totalPercent !== 100) {
        setError('事業割り当ての合計が100%になるようにしてください');
        return;
      }
      if (allocRows.some(r => !r.division_id)) {
        setError('事業を選択してください');
        return;
      }
    }
    if (!supabase) return;

    // 重複チェック（編集時はスキップ、確認済みもスキップ）
    if (!editData && !dupConfirmed) {
      const txAmount = parseInt(form.amount.replace(/,/g, '')) || 0;
      let dupQ = supabase.from('transactions').select('id, date, amount, store')
        .eq('date', form.date)
        .eq('amount', txAmount)
        .eq('tx_type', 'expense')
        .eq('owner', form.owner);
      if (form.store) dupQ = dupQ.eq('store', form.store);
      const { data: dups } = await dupQ;
      if (dups && dups.length > 0) {
        const storeLabel = form.store || '（支払先未入力）';
        setDupWarning(`${form.date} / ${storeLabel} / ¥${txAmount.toLocaleString()} と同じ経費が既に${dups.length}件あります。本当に登録しますか？`);
        return;
      }
    }

    // v0.39.0: AI第2段校閲(Opus 4.7) — error/warning があればモーダル表示で停止
    const auditCheck = await runAudit();
    if (!auditCheck.shouldProceed) return;

    setSaving(true);
    setError(null);
    // v0.14.4: ガードをセット（ここ以降は2回目以降の呼び出しを完全ブロック）
    saveInProgressRef.current = true;

    let finalDescription = form.description || null;
    let finalStore = form.store || null;
    if (form.kamoku === 'travel') {
      // store = 区間 + 目的（自動生成）
      const legs = transportData.route_legs || [];
      const routeStr = [legs[0]?.from, ...legs.map(l => l.to)].filter(Boolean).join(' → ');
      const purposeStr = transportData.purpose || '';
      finalStore = routeStr ? `${routeStr}（${purposeStr}）` : null;
      // description = ボス入力のみ。空ならルート概要フォールバック
      if (!form.description) {
        finalDescription = routeStr || null;
      }
    }
    if (form.kamoku === 'entertainment') {
      finalDescription = entertainmentToDescription(entertainmentData, form.description);
    }
    if (form.kamoku === 'equipment' && form.item_name.trim()) {
      const desc = form.description ? `\n${form.description}` : '';
      finalDescription = `【品名】${form.item_name.trim()}${desc}`;
    }

    const txAmount = parseInt(form.amount.replace(/,/g, '')) || 0;

    // v0.14.3: 往復も常に1レコードで保存（登録意図 = 1取引）
    // transport_details テーブルが return_legs / same_route / same_amount / return_amount / return_mode を
    // 保持するようになったため、往路/復路の詳細は transport_details 側で完全に再現可能。
    // 旧 isRoundTripSplit による2レコード分割は廃止（ハンドオフ: session38 で v0.14.3 として修正）

    const buildPayload = (amount: number, desc: string | null) => ({
      tx_type: 'expense' as const,
      date: form.date,
      amount,
      store: finalStore,
      kamoku: form.kamoku,
      division: 'general',
      owner: form.owner,
      description: desc,
      // v0.9.0: 領収書添付あり → source='receipt_ai'・memoにDrive URL保存
      source: (receiptItems.length > 0 ? 'receipt_ai' : 'manual') as 'receipt_ai' | 'manual',
      memo: null,
      confirmed: true,
      status: form.status || 'settled',
      accrual_date: form.date,
      actual_payment_date: form.actual_payment_date || form.date,
      // v0.15.0: 内訳タグ（制作費・取材費のみ値あり、それ以外はnull）
      sub_category: requiresSubCategory(form.kamoku) ? (form.sub_category || null) : null,
    });

    try {
      let txId: string;

      // v0.14.3: 往復・片道問わず単一レコード保存パスに統一
      const payload = buildPayload(txAmount, finalDescription);

      if (editData) {
        txId = editData.id;
        const { error: dbErr } = await supabase
          .from('transactions')
          .update(payload as any)
          .eq('id', editData.id);
        if (dbErr) throw dbErr;

        if (usesTransportDetail(form.kamoku)) {
          await updateTransportDetails(editData.id, transportData);
        }
      } else {
        // v0.40.0: アップグレード追加モード時は parent_transaction_id を付与
        const insertPayload = upgradeForParent
          ? { ...payload, parent_transaction_id: upgradeForParent.parentTransactionId }
          : payload;
        const { data: inserted, error: dbErr } = await supabase
          .from('transactions')
          .insert(insertPayload as any)
          .select('id')
          .single();
        if (dbErr) throw dbErr;
        txId = (inserted as any).id;

        if (usesTransportDetail(form.kamoku) && inserted) {
          await saveTransportDetails((inserted as any).id, transportData);
        }
      }

      // allocation保存
      // 既存alloc削除
      await supabase.from('transaction_allocations').delete().eq('transaction_id', txId);
      // 新規挿入
      if (hasAllocRows) {
        const inserts = allocRows.map(r => ({
          transaction_id: txId,
          division_id: r.division_id,
          project_id: (r.project_id && r.project_id !== UNASSIGNED_PROJECT_VALUE) ? r.project_id : null,
          percent: r.percent,
          amount: Math.round(txAmount * r.percent / 100),
        }));
        const { error: allocErr } = await supabase.from('transaction_allocations').insert(inserts);
        if (allocErr) throw allocErr;
      }

      // equipment_items保存（1万円以上のequipment）
      if (form.kamoku === 'equipment' && txAmount >= 10000) {
        const eqPayload = {
          transaction_id: txId,
          name: form.item_name.trim(),
          category: form.eq_category || null,
          maker: form.eq_maker.trim() || null,
          serial: form.eq_serial.trim() || null,
          business_ratio: parseInt(form.eq_business_ratio) || 100,
          warranty_date: form.eq_warranty_date || null,
          owner: form.owner,
          status: 'active',
          photos: [],
        };
        // 既存があればupdate、なければinsert
        const { data: existingEq } = await supabase.from('equipment_items').select('id').eq('transaction_id', txId).single();
        if (existingEq) {
          await supabase.from('equipment_items').update(eqPayload).eq('id', (existingEq as any).id);
        } else {
          await supabase.from('equipment_items').insert(eqPayload);
        }
      }
      // equipment以外に科目変更 or 1万円未満に変更 → 既存equipment_itemを削除
      if ((form.kamoku !== 'equipment' || txAmount < 10000) && editData) {
        await supabase.from('equipment_items').delete().eq('transaction_id', txId);
      }

      // ═══════════════════════════════════════════════════════════════
      // v0.11.0: 領収書処理（トランザクション成功後）
      // 1. 削除された既存領収書を DB削除 → Drive ゴミ箱
      // 2. ステージング分を Drive アップロード → expense_receipts INSERT
      // 3. 既存保存済はlabel/seq_no更新（UPDATE）
      // ※ 往復分割時は往路（txId）に紐付け
      // ═══════════════════════════════════════════════════════════════
      if (pendingReceiptDeleteIds.length > 0) {
        await supabase.from('expense_receipts' as any)
          .delete()
          .in('id', pendingReceiptDeleteIds);
      }
      if (pendingReceiptTrashIds.length > 0) {
        await trashReceiptsInDrive(pendingReceiptTrashIds);
      }

      const commitResult = await commitReceiptsToDrive(receiptItems, {
        date: form.date,
        kamokuLabel: KAMOKU[form.kamoku as keyof typeof KAMOKU]?.name || form.kamoku,
        store: finalStore,
        owner: form.owner,
        description: finalDescription,
        totalAmount: txAmount,
      });

      for (const r of commitResult.savedReceipts) {
        if (r.staged) {
          await supabase.from('expense_receipts' as any).insert({
            transaction_id: txId,
            seq_no: r.seqNo,
            label: r.label,
            drive_file_id: r.driveFileId,
            drive_url: r.driveUrl,
            drive_folder_path: r.driveFolderPath || null,
            generated_filename: r.generatedFilename,
            original_filename: r.originalFilename,
            mime_type: r.mimeType,
            ai_extracted_amount: r.aiExtractedAmount,
          });
        } else if (r.dbId) {
          await supabase.from('expense_receipts' as any)
            .update({ seq_no: r.seqNo, label: r.label })
            .eq('id', r.dbId);
        }
      }

      if (commitResult.failed.length > 0) {
        console.warn('Receipt upload failures:', commitResult.failed);
        setError(`一部の領収書アップロードに失敗しました（${commitResult.failed.length}件）`);
      }

      onSaved();

      // v0.41.0: 親登録成功直後の「追加領収書はありますか?」ポップアップ判定
      // 条件: 新規登録(編集ではない)・travel/production/torizai・アップグレードモードでない
      const shouldPromptAddon = !editData
        && !upgradeForParent
        && (form.kamoku === 'travel' || form.kamoku === 'production' || form.kamoku === 'torizai')
        && usesTransportDetail(form.kamoku)
        && txId;
      if (shouldPromptAddon) {
        // 親領収書情報(子取引で同じPDFを参照するため)
        const parentReceiptFiles = receiptItems
          .filter(r => r.staged && r.driveFileId && r.driveUrl)
          .map(r => ({
            fileName: r.fileName,
            driveFileId: r.driveFileId!,
            driveUrl: r.driveUrl!,
          }));
        setPendingAddonPrompt({
          parentTxId: txId,
          parentDate: form.date,
          parentStore: form.store || null,
          parentOwner: form.owner,
          parentKamoku: form.kamoku,
          parentSubCategory: form.sub_category || null,
          parentDescription: form.description || null,
          parentAllocRows: allocRows,
          parentTransport: { ...transportData },
          parentReceiptFiles,
          detectedAddons: ocrAddonChargesRef.current,
        });
        // ポップアップ表示中はモーダルを閉じない(ポップアップで「閉じる」を押した時点で onClose)
        return;
      }

      // v0.30.0: 経費入力中に「このルートをテンプレに保存」をONにしていた場合、
      // 別モーダルを経由せず即座に route_templates へ INSERT（逆順ペアも自動生成）。
      // インライン保存できたら、後続のテンプレ提案モーダルでのルート保存提案は重複なので抑止する。
      // v0.30.4: 更新時(editData あり)もインライン保存を有効化。
      // チェックボックスONはユーザーの明確な意図 → 新規/更新を問わず保存する。
      // 同一 owner + 同一 name のルートテンプレが既存なら重複保存を skip（無言で）。
      let inlineRouteSaved = false;
      if (
        usesTransportDetail(form.kamoku) &&
        !selectedOutboundRoute &&
        alsoSaveRoute &&
        routeTemplateName.trim()
      ) {
        const legs = (transportData.route_legs || [])
          .filter(l => (l.from || '').trim() && (l.to || '').trim() && (l.amount || 0) > 0)
          .map(l => ({
            from: (l.from || '').trim(),
            to: (l.to || '').trim(),
            method: l.method || '電車',
            carrier: (l.carrier || '').trim(),
            amount: Number(l.amount) || 0,
            green: !!l.green,
          }));
        if (legs.length > 0) {
          // v0.30.4: 同名重複チェック（無言skip・ユーザーには既に保存済みとして扱わせる）
          const trimmedName = routeTemplateName.trim();
          let duplicateExists = false;
          try {
            const { data: existingRoute } = await supabase
              .from('route_templates')
              .select('id')
              .eq('owner', form.owner)
              .eq('name', trimmedName)
              .limit(1)
              .maybeSingle();
            if (existingRoute) {
              duplicateExists = true;
            }
          } catch (dupErr) {
            console.warn('ルートテンプレ重複チェック失敗（保存は続行）:', dupErr);
          }

          if (duplicateExists) {
            // 既存と同名 → 保存skip。状態リセットして提案モーダルも抑止
            inlineRouteSaved = true;
            setAlsoSaveRoute(false);
            setRouteTemplateName('');
          } else {
            const aId = await saveOnewayWithPair({
              owner: form.owner,
              name: trimmedName,
              legs,
            });
            if (aId) {
              inlineRouteSaved = true;
              // 状態リセット（後続モーダルでの再提案を抑止）
              setAlsoSaveRoute(false);
              setRouteTemplateName('');
            } else {
              // saveOnewayWithPair が null を返した = 保存失敗
              // ユーザーに気づかせるため warn を出す（v0.30.4 強化）
              console.warn('ルートテンプレ・インライン保存に失敗しました。saveOnewayWithPair が null を返しました。', {
                owner: form.owner,
                name: trimmedName,
                legCount: legs.length,
              });
            }
          }
        }
      }

      // v0.13.1: テンプレ保存提案の発火条件を拡張
      // - 新規登録は常に対象
      // - テンプレ選択済みでも、支払先 or 科目が変わっていれば別物とみなし提案
      // - 交通費の場合は、区間が既存ルートテンプレと異なっていれば別ルートとみなし提案
      const shouldSuggestTemplate = (() => {
        if (editData) return false;
        if (!selectedTemplate) return true;
        // 科目が変わっていれば別物
        if (selectedTemplate.kamoku && selectedTemplate.kamoku !== form.kamoku) return true;
        // 汎用テンプレの場合、支払先が変わっていれば別物
        if (selectedTemplate.template_type === 'general' && (selectedTemplate.store || '') !== (form.store || '')) return true;
        return false;
      })();

      // v0.13.1: 「ルートとしても保存」の初期値判定
      // - 交通費かつ新規区間（往路ルートテンプレ未選択）かつ区間が入力済みのときON推奨
      // v0.14.0 Phase 4: multiMode（往復 + different_route/manual + 復路手入力）も発火対象
      // v0.30.0: インラインで既にルート保存済みの場合は提案不要（重複抑止）
      // v0.38.0: 更新時(editData あり)はモーダル全廃。ルート保存はインラインUIで完結。
      const shouldSuggestRouteSave = (() => {
        if (editData) return false; // v0.38.0: 更新時はインラインUIのみ
        if (inlineRouteSaved) return false;
        if (!usesTransportDetail(form.kamoku)) return false;
        if (selectedOutboundRoute) return false; // 既存ルート選択済みなら不要
        const legs = transportData.route_legs || [];
        if (legs.length === 0) return false;
        const hasContent = legs.some((l: any) => (l.from || '').trim() || (l.to || '').trim());
        return hasContent;
      })();

      // v0.14.0 Phase 4: multiMode の発火判定
      // - 往復 + different_route/manual + 往路・復路いずれか新規入力あり
      // v0.14.6: 既存パッケージ/既存片道2つを選択済みの場合は提案しない
      //   ボス指摘: パッケージ適用後に『この往復セットをパッケージ保存しますか？』と
      //   聞くのは不必要。既存の参照を使っただけで、DB に新規保存する必要はない。
      // v0.14.7: auto_reverse も対象に追加（2段構え: 逆順片道保存 + パッケージ保存）
      // v0.38.0: 更新時(editData あり)はモーダル全廃。
      const shouldSuggestMultiMode = (() => {
        if (editData) return false; // v0.38.0: 更新時はインラインUIのみ
        if (!usesTransportDetail(form.kamoku)) return false;
        if (transportData.round_trip !== 'round_trip') return false;
        // 既存ルートで往路・復路両方埋まっていて、かつ既にパッケージ化済なら提案不要
        // （※ パッケージ適用時は selectedOutboundRoute/selectedReturnRoute が両方セット）
        if (selectedOutboundRoute && selectedReturnRoute) return false;
        const rm = transportData.return_mode || 'auto_reverse';

        if (rm === 'auto_reverse') {
          // auto_reverse: 往路に何らかの入力/選択があればパッケージ提案対象
          const oLegs = transportData.route_legs || [];
          const hasOutbound = !!selectedOutboundRoute ||
            oLegs.some((l: any) => (l.from || '').trim() || (l.to || '').trim());
          return hasOutbound;
        }

        if (rm !== 'different_route' && rm !== 'manual') return false;
        // 復路に何らかの入力があるか
        const rLegs = transportData.return_legs || [];
        if (rLegs.length === 0) return false;
        const hasReturnContent = rLegs.some((l: any) => (l.from || '').trim() || (l.to || '').trim());
        if (!hasReturnContent) return false;
        // 往路・復路のいずれかがテンプレ未選択（新規）なら提案対象
        const outboundIsNew = !selectedOutboundRoute;
        const returnIsNew = !selectedReturnRoute;
        return outboundIsNew || returnIsNew;
      })();

      if (shouldSuggestTemplate) {
        setSavedFormSnapshot({
          kamoku: form.kamoku,
          store: form.store,
          amount: txAmount,
          description: finalDescription,
          owner: form.owner,
          payment_method: usesTransportDetail(form.kamoku) ? transportData.payment_method : 'personal',
          transportData: usesTransportDetail(form.kamoku) ? { ...transportData } : null,
        });
        // v0.38.0: ルート保存はインラインUIで完結。モーダル内でのルート連動は撤廃。
        setAlsoSaveRoute(false);
        setRouteTemplateName('');
        setShowTemplateSave(true);
      } else if (shouldSuggestMultiMode) {
        // v0.14.0 Phase 4: 往復 + different_route/manual → 3チェックボックスモーダル
        setSavedFormSnapshot({
          kamoku: form.kamoku,
          store: form.store,
          amount: txAmount,
          description: finalDescription,
          owner: form.owner,
          payment_method: transportData.payment_method,
          transportData: { ...transportData },
        });
        setTemplateName('');
        setAlsoSaveRoute(false);
        setShowTemplateSave(true);
      } else {
        // v0.38.0: shouldSuggestRouteSave 単独でのモーダル発火は撤廃。
        // ルート保存はインラインUIで完結（このルートをテンプレに保存する）。
        // 経費テンプレ提案 or multiMode 提案のいずれにも該当しない場合は単純にクローズ。
        onClose();
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
      // v0.14.4: ガード解除（成功/失敗問わず必ず解除）
      saveInProgressRef.current = false;
    }
  };

  if (!isOpen) return null;

  const txAmount = parseInt(form.amount.replace(/,/g, '')) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative bg-white rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="sticky top-0 bg-white rounded-t-2xl px-5 pt-5 pb-3 border-b border-app-line flex items-center justify-between z-10">
          <h3 className="text-sm font-medium text-app-text">
            {editData ? '経費を編集' : upgradeForParent ? 'アップグレードを追加' : '経費を追加'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-full">
            <X className="w-4 h-4 text-app-text-mute" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* v0.40.0: アップグレード追加モードの案内バナー */}
          {upgradeForParent && (
            <div className="rounded-lg border border-app-gold/60 bg-app-gold/10 px-3 py-2.5">
              <p className="text-[10px] font-medium tracking-wider text-app-gold">アップグレード追加モード</p>
              <p className="text-[12px] text-app-text leading-relaxed mt-1">
                親取引「{upgradeForParent.parentStore || '元の取引'}」に紐付けて登録します。
                日付・区間・便名は継承済。<strong className="font-semibold">クラスと金額のみ入力</strong>してください。
              </p>
            </div>
          )}
          {/* v0.11.0: 領収書アップロード（新規/編集 共通） */}
          {/* v0.15.0: 旅費交通費のみ最大10枚、その他経費は最大1枚に制限 */}
          <ReceiptUploadSection
            defaultOwner={form.owner}
            maxReceipts={allowsMultipleReceipts(form.kamoku) ? 10 : 1}
            formContext={{
              date: form.date,
              kamokuLabel: KAMOKU[form.kamoku as keyof typeof KAMOKU]?.name || form.kamoku,
              store: form.store || null,
              owner: form.owner,
              description: form.description || null,
              totalAmount: parseInt(form.amount || '0', 10) || 0,
            }}
            initialItems={initialReceiptItems || undefined}
            onItemsChange={(items) => {
              if (initialReceiptItems) {
                const currentIds = new Set(items.map((it) => it.clientId));
                const removed = initialReceiptItems.filter((it) => !currentIds.has(it.clientId));
                const trashIds = removed.filter((it) => it.driveFileId).map((it) => it.driveFileId!);
                const deleteDbIds = removed.filter((it) => it.dbId).map((it) => it.dbId!);
                setPendingReceiptTrashIds(trashIds);
                setPendingReceiptDeleteIds(deleteDbIds);
              }
              setReceiptItems(items);
            }}
            onExtractedForForm={handleReceiptExtracted}
            onError={setError}
            onSetAmountFromReceipts={(amount) => {
              setForm((prev) => ({ ...prev, amount: String(amount) }));
            }}
          />

          {/* ① 日付 */}
          <div>
            <label className="text-xs text-app-text-mute block mb-1">日付</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50" />
          </div>
          {/* ② 勘定科目（日付の直後 — ここで分岐） */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-app-text-mute">勘定科目</label>
              <button
                type="button"
                onClick={() => setShowConsultation(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-app-text hover:bg-black/5 transition-colors"
                title="この経費の科目をAIに相談"
              >
                <Sparkles className="w-3 h-3" />
                <span>AIに相談</span>
              </button>
            </div>
            <select value={form.kamoku} onChange={(e) => { setForm({ ...form, kamoku: e.target.value, sub_category: '' }); setProductionHint(false); }}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50">
              <option value="" disabled>科目を選択してください</option>
              {topKamoku.length > 0 && (
                <optgroup label={`${OWNER_LABEL[form.owner] || ''}の定番`}>
                  {topKamoku.map((kid) => {
                    const k = EXPENSE_KAMOKU.find((e) => e.id === kid);
                    if (!k) return null;
                    return <option key={`top-${k.id}`} value={k.id}>{k.name}</option>;
                  })}
                </optgroup>
              )}
              <optgroup label={topKamoku.length > 0 ? 'すべての科目' : ''}>
                {/* v0.29.0: 編集モードで現科目が非アクティブ(welfare等)の場合は表示する */}
                {EXPENSE_KAMOKU
                  .filter((k) => k.isActive || (editData && k.id === editData.kamoku))
                  .map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </optgroup>
            </select>
          </div>

          {/* v0.15.3: AI OCR後、一般系科目に推定された時に「制作費・取材費の可能性は？」とアナウンス */}
          {productionHint && !requiresSubCategory(form.kamoku) && (
            <div className="bg-state-warn-bg border border-app-gold/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-app-gold shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-app-gold-deep leading-relaxed mb-2">
                    <span className="font-medium">制作費</span>か<span className="font-medium">取材費</span>の領収書ですか？
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        // v0.27.0: AIが判定した元科目(form.kamoku)から制作費の内訳タグを自動推定
                        // 例: 旅費→移動, 接待→飲食, 消耗品→小道具・備品
                        // AI ヒント(aiSubCategoryHint)があればそれを優先
                        const inferred = inferSubCategoryOnKamokuSwitch(form.kamoku, 'production', aiSubCategoryHint);
                        setForm({ ...form, kamoku: 'production', sub_category: inferred });
                        setProductionHint(false);
                      }}
                      className="px-2.5 py-1 rounded-full text-[10px] bg-white border border-app-gold/50 text-app-gold-deep hover:bg-app-gold/10"
                    >
                      制作費
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // v0.27.0: AIが判定した元科目(form.kamoku)から取材費の内訳タグを自動推定
                        // 例: 旅費→移動, 接待→飲食, 消耗品→資料
                        // AI ヒント(aiSubCategoryHint)があればそれを優先
                        const inferred = inferSubCategoryOnKamokuSwitch(form.kamoku, 'torizai', aiSubCategoryHint);
                        setForm({ ...form, kamoku: 'torizai', sub_category: inferred });
                        setProductionHint(false);
                      }}
                      className="px-2.5 py-1 rounded-full text-[10px] bg-white border border-app-gold/50 text-app-gold-deep hover:bg-app-gold/10"
                    >
                      取材費
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductionHint(false)}
                      className="px-2.5 py-1 rounded-full text-[10px] text-app-text-mute hover:bg-white"
                    >
                      そのまま
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 金額・支払先（交通費以外） — 交通費は専用UI内で完結 */}
          {form.kamoku !== 'travel' && (
            <>
              <div>
                <label className="text-xs text-app-text-mute block mb-1">金額（税込）</label>
                <input type="text" inputMode="numeric"
                  value={form.amount ? Number(form.amount.replace(/,/g, '')).toLocaleString() : ''}
                  onChange={(e) => { const v = e.target.value.replace(/,/g, ''); if (/^\d*$/.test(v)) setForm({ ...form, amount: v }); }}
                  className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50" placeholder="15,300" />
              </div>
              <div>
                <label className="text-xs text-app-text-mute block mb-1">支払先</label>
                <input type="text" value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}
                  className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50"
                  placeholder={
                    form.kamoku === 'entertainment' ? '店名（レストラン等）' :
                    form.kamoku === 'equipment' ? 'ヨドバシカメラ / Amazon等' :
                    form.kamoku === 'outsource' ? '委託先名' :
                    form.kamoku === 'rent' ? '不動産会社 / 家主名' :
                    form.kamoku === 'communication' ? 'NTTドコモ / UQ等' :
                    form.kamoku === 'subscription' ? 'Adobe / Google等' :
                    form.kamoku === 'tax' ? '税務署 / 市区町村' :
                    '支払先名'
                  } />
              </div>
            </>
          )}

          {/* v0.15.0: 内訳タグ選択UI（制作費・取材費のみ） */}
          {requiresSubCategory(form.kamoku) && (
            <div>
              <label className="text-xs text-app-text-mute block mb-1">
                内訳 <span className="text-app-red">*必須</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {subCategories
                  .filter(s => s.parent_kamoku === form.kamoku)
                  .map((s) => {
                    const selected = form.sub_category === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setForm({ ...form, sub_category: s.key })}
                        className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                          selected
                            ? 'bg-app-gold text-white'
                            : 'bg-app-surface-alt text-app-text-strong hover:bg-app-button-disabled'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                <button
                  type="button"
                  onClick={async () => {
                    const label = prompt('追加する項目名を入力してください（例：ケータリング）');
                    if (!label || !label.trim()) return;
                    const trimmed = label.trim();
                    if (trimmed.length > 20) {
                      alert('20文字以内で入力してください');
                      return;
                    }
                    // 同一 parent_kamoku 内で重複チェック
                    const dup = subCategories.find(
                      s => s.parent_kamoku === form.kamoku && s.label === trimmed
                    );
                    if (dup) {
                      alert(`「${trimmed}」と同じ名前の項目が既にあります`);
                      setForm({ ...form, sub_category: dup.key });
                      return;
                    }
                    // 英語キー自動採番: parent_kamoku + タイムスタンプ下6桁
                    const prefix = form.kamoku === 'production' ? 'prod_custom_' : 'tori_custom_';
                    const suffix = Date.now().toString().slice(-8);
                    const newKey = prefix + suffix;
                    // 表示順: 既存の最大 + 10（ただし other=999 より手前）
                    const sameGroup = subCategories.filter(s => s.parent_kamoku === form.kamoku);
                    const maxUserOrder = Math.max(
                      0,
                      ...sameGroup.filter(s => s.display_order < 999).map(s => s.display_order)
                    );
                    const newOrder = maxUserOrder + 10;
                    if (!supabase) return;
                    const { data, error } = await supabase
                      .from('sub_categories' as any)
                      .insert({
                        key: newKey,
                        label: trimmed,
                        parent_kamoku: form.kamoku,
                        display_order: newOrder,
                        is_active: true,
                        is_system: false,
                      })
                      .select()
                      .single();
                    if (error) {
                      alert('追加に失敗しました: ' + error.message);
                      return;
                    }
                    if (data) {
                      setSubCategories(prev => [...prev, data as any].sort(
                        (a, b) => a.display_order - b.display_order
                      ));
                      setForm({ ...form, sub_category: (data as any).key });
                    }
                  }}
                  className="px-3 py-1.5 rounded-full text-xs bg-white border border-dashed border-app-gold/60 text-app-gold hover:bg-state-warn-bg"
                >
                  ＋ 新規追加
                </button>
              </div>
            </div>
          )}

          {/* v0.7: 交通費テンプレ（業務メタ） + ルートテンプレ（物理経路）の独立選択 */}
          {/* v0.30.2: travel に加えて、制作費・取材費の交通費 sub_category でも表示 */}
          {(() => {
            if (form.kamoku === 'travel') return true;
            if (form.kamoku === 'production' || form.kamoku === 'torizai') {
              if (!form.sub_category) return false;
              const selectedLabel = subCategories.find(s => s.key === form.sub_category)?.label ?? null;
              return isTransportSubCategory(form.sub_category, selectedLabel);
            }
            return false;
          })() && (
            <div className="space-y-3">
              {/* 経費テンプレ選択（業務メタ） */}
              {/* travel のときだけ経費テンプレを出す(制作費・取材費は科目自体が業務メタを持つ) */}
              {form.kamoku === 'travel' && templates.filter(t => t.template_type === 'transport').length > 0 && (
                <div>
                  <label className="text-xs text-app-text-mute block mb-1">経費テンプレ（業務メタ）</label>
                  <select
                    value={selectedTemplate?.id || ''}
                    onChange={(e) => {
                      const tpl = templates.find(t => t.id === e.target.value);
                      if (tpl) {
                        applyTemplate(tpl);
                      } else {
                        setSelectedTemplate(null);
                      }
                    }}
                    className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50"
                  >
                    <option value="">（手動入力）</option>
                    {templates
                      .filter(t => t.template_type === 'transport')
                      .map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                          {tpl.transport_purpose ? ` / ${tpl.transport_purpose}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* ルート選択（v0.14.0: 仕様D — パッケージと片道を統合表示） */}
              {/* v0.30.2: 制作費・取材費の交通費でも同じUIで表示 */}
              {routeTemplates.length > 0 && (() => {
                // アーカイブ除外 + 種別で分類
                const active = routeTemplates.filter((t) => !t.archived_at);
                const packages = active.filter((t) => t.template_kind === 'roundtrip_package');
                const oneways = active.filter((t) => t.template_kind !== 'roundtrip_package');
                // 現在選択中のIDを決定
                // - パッケージ適用中: selectedOutboundRoute.id ではなく、パッケージIDを示す state がないため、
                //   outbound/return 両方が同じパッケージ参照なら該当パッケージIDとみなす
                const activePackage = packages.find(
                  (p) =>
                    selectedOutboundRoute &&
                    selectedReturnRoute &&
                    p.outbound_route_id === selectedOutboundRoute.id &&
                    p.return_route_id === selectedReturnRoute.id
                );
                const selectedValue = activePackage
                  ? activePackage.id
                  : selectedOutboundRoute?.id || '';
                return (
                  <div>
                    <label className="text-xs text-app-text-mute block mb-1">ルート</label>
                    <select
                      value={selectedValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) {
                          clearRoute();
                          return;
                        }
                        const tpl = active.find((t) => t.id === val);
                        if (tpl) applyRoute(tpl);
                      }}
                      className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50"
                    >
                      <option value="">（手動入力）</option>
                      {packages.length > 0 && (
                        <optgroup label="── 往復パッケージ ──">
                          {packages.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {oneways.length > 0 && (
                        <optgroup label="── 片道 ──">
                          {oneways.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 汎用テンプレートチップ（交通費以外の科目） */}
          {form.kamoku !== 'travel' && (() => {
            const generalTpls = templates.filter(t => t.template_type === 'general' && t.kamoku === form.kamoku);
            return generalTpls.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-app-text-mute">テンプレートから入力</p>
                <div className="flex flex-wrap gap-1.5">
                  {generalTpls.slice(0, 5).map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        selectedTemplate?.id === tpl.id
                          ? 'bg-app-button text-white border-app-text'
                          : 'bg-app-surface-alt text-app-text-sub border-app-line-strong hover:border-app-gold hover:text-app-gold'
                      }`}
                    >
                      <span>{tpl.name}</span>
                      <span className="font-['Saira_Condensed'] tabular-nums opacity-70">
                        ¥{(tpl.amount || 0).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {(() => {
            // v0.15.0: 交通費詳細の表示条件
            //  - 旅費交通費 (travel): 常に表示
            //  - 制作費 (production) / 取材費 (torizai): 内訳=移動 の時だけ表示
            if (form.kamoku === 'travel') return true;
            if (form.kamoku === 'production' || form.kamoku === 'torizai') {
              if (!form.sub_category) return false;
              const selectedLabel = subCategories.find(s => s.key === form.sub_category)?.label ?? null;
              return isTransportSubCategory(form.sub_category, selectedLabel);
            }
            return false;
          })() && (
            <>
            {/* v0.39.0: AI が複数区間(往復/オープンジョー等)を検出した時の判定旗印バナー */}
            {aiTripLegsDetected && (
              <div className="rounded-lg border border-app-gold/60 bg-app-gold/10 px-3 py-2.5 mb-2">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-medium text-app-gold tracking-wider">AI 判定</span>
                </div>
                <p className="text-[12px] text-app-text leading-relaxed mt-1">
                  領収書から{aiTripLegsDetected.legCount}区間
                  {aiTripLegsDetected.fareMode === 'round_trip_total' ? '・往復一括金額' :
                   aiTripLegsDetected.fareMode === 'per_leg' ? '・区間別金額' : ''}
                  を読み取りました
                  {aiTripLegsDetected.firstFlight && aiTripLegsDetected.lastFlight && (
                    <span className="text-app-text-mute"> ({aiTripLegsDetected.firstFlight} / {aiTripLegsDetected.lastFlight})</span>
                  )}
                  。自動入力した内容をご確認ください。
                </p>
              </div>
            )}
            <TransportFields
              data={transportData}
              onChange={setTransportData}
              onAmountChange={(total) => {
                if (total > 0) setForm(prev => ({ ...prev, amount: total.toString() }));
              }}
              hidePurpose={form.kamoku === 'production' || form.kamoku === 'torizai'}
              returnRouteSelector={(() => {
                // v0.14.0: 「別の片道テンプレを選ぶ」モード時に表示する片道テンプレセレクタ
                // アーカイブ除外 + 片道のみ（パッケージは除外）
                const onewayActives = routeTemplates.filter(
                  (t) => !t.archived_at && t.template_kind !== 'roundtrip_package'
                );
                if (onewayActives.length === 0) {
                  return (
                    <p className="text-[11px] text-app-text-mute">
                      片道テンプレがまだありません。「手入力」を選んでください。
                    </p>
                  );
                }
                return (
                  <div>
                    <label className="text-xs text-app-text-mute block mb-1">復路に使う片道テンプレ</label>
                    <select
                      value={selectedReturnRoute?.id || ''}
                      onChange={(e) => {
                        const tpl = onewayActives.find((t) => t.id === e.target.value);
                        if (tpl) {
                          applyReturnRouteOnly(tpl);
                        } else {
                          setSelectedReturnRoute(null);
                          setTransportData((prev) => ({ ...prev, return_legs: [] }));
                        }
                      }}
                      className="w-full px-3 py-2 bg-white rounded-lg text-sm border border-app-gold/30 outline-none focus:ring-2 focus:ring-app-gold/50"
                    >
                      <option value="">（選択してください）</option>
                      {onewayActives.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            />
            </>
          )}

          {/* v0.30.0: 交通費入力中に「このルートをテンプレに保存」インラインUI
              既存ルートテンプレ未選択 + 区間が入力済み + travel/制作費/取材費の交通費 のときだけ表示 */}
          {(() => {
            const isTransportLike = (() => {
              if (form.kamoku === 'travel') return true;
              if (form.kamoku === 'production' || form.kamoku === 'torizai') {
                if (!form.sub_category) return false;
                const selectedLabel = subCategories.find(s => s.key === form.sub_category)?.label ?? null;
                return isTransportSubCategory(form.sub_category, selectedLabel);
              }
              return false;
            })();
            if (!isTransportLike) return null;
            // 既存ルートテンプレを選択済み（適用済み）の場合は表示しない
            if (selectedOutboundRoute) return null;
            // 区間に出発地・到着地・金額のいずれかが入力されているときだけ表示
            const legs = transportData.route_legs || [];
            const hasContent = legs.some(l => (l.from || '').trim() || (l.to || '').trim() || (l.amount || 0) > 0);
            if (!hasContent) return null;
            const firstFrom = (legs[0]?.from || '').trim();
            const lastTo = (legs[legs.length - 1]?.to || '').trim();
            const placeholder = (firstFrom && lastTo) ? `${firstFrom}→${lastTo}` : 'ルート名';
            return (
              <div className="border border-app-gold/30 rounded-xl p-4 space-y-2 bg-app-gold/5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoSaveRoute}
                    onChange={(e) => {
                      setAlsoSaveRoute(e.target.checked);
                      if (e.target.checked && !routeTemplateName.trim() && firstFrom && lastTo) {
                        setRouteTemplateName(`${firstFrom}→${lastTo}`);
                      }
                    }}
                    className="w-4 h-4 accent-app-gold"
                  />
                  <span className="text-xs font-medium text-app-text">ルートとして登録する</span>
                </label>
                {alsoSaveRoute && (
                  <div className="space-y-1.5 pl-6">
                    <input
                      type="text"
                      value={routeTemplateName}
                      onChange={(e) => setRouteTemplateName(e.target.value)}
                      placeholder={placeholder}
                      className="w-full px-3 py-2 bg-white rounded-lg text-sm border border-app-gold/30 outline-none focus:ring-2 focus:ring-app-gold/50"
                    />
                    <p className="text-[10px] text-app-text-mute">
                      ※ 次回からこのルートを呼び出して即入力できます。逆順ルートも自動で登録されます。
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {form.kamoku === 'entertainment' && <EntertainmentFields data={entertainmentData} onChange={setEntertainmentData} />}

          {form.kamoku === 'equipment' && (
            <div className="border border-app-gold/30 rounded-xl p-4 space-y-3 bg-app-gold/5">
              <p className="text-xs font-medium text-app-gold">消耗品費詳細</p>
              <div>
                <label className="text-xs text-app-text-mute block mb-1">品名（必須）</label>
                <input type="text" value={form.item_name}
                  onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                  className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50"
                  placeholder="MacBook Pro 14インチ / SDカード 128GB 等" />
              </div>
              {(parseInt(form.amount.replace(/,/g, '')) || 0) >= 10000 && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-app-text-mute block mb-1">カテゴリ</label>
                      <select value={form.eq_category} onChange={(e) => setForm({ ...form, eq_category: e.target.value })}
                        className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50">
                        <option value="">選択</option>
                        <option value="pc">PC</option>
                        <option value="camera">カメラ</option>
                        <option value="lens">レンズ</option>
                        <option value="audio">音響</option>
                        <option value="monitor">モニター</option>
                        <option value="furniture">家具</option>
                        <option value="other">その他</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-app-text-mute block mb-1">事業利用割合</label>
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} value={form.eq_business_ratio}
                          onChange={(e) => setForm({ ...form, eq_business_ratio: e.target.value })}
                          className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50 font-['Saira_Condensed'] tabular-nums" />
                        <span className="text-xs text-app-text-mute shrink-0">%</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-app-text-mute block mb-1">メーカー・型番</label>
                    <input type="text" value={form.eq_maker}
                      onChange={(e) => setForm({ ...form, eq_maker: e.target.value })}
                      className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50"
                      placeholder="Apple / SONY α7IV 等" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-app-text-mute block mb-1">シリアル番号</label>
                      <input type="text" value={form.eq_serial}
                        onChange={(e) => setForm({ ...form, eq_serial: e.target.value })}
                        className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50"
                        placeholder="任意" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-app-text-mute block mb-1">保証期限</label>
                      <input type="date" value={form.eq_warranty_date}
                        onChange={(e) => setForm({ ...form, eq_warranty_date: e.target.value })}
                        className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50" />
                    </div>
                  </div>
                </>
              )}
              {(() => {
                const amt = parseInt(form.amount.replace(/,/g, '')) || 0;
                if (amt >= 400000) return (
                  <p className="text-[10px] text-app-red flex items-center gap-1">
                    ※ 40万円以上 → 固定資産（耐用年数で減価償却）
                  </p>
                );
                if (amt >= 100000) return (
                  <p className="text-[10px] text-app-gold flex items-center gap-1">
                    ※ 10〜40万円未満 → 少額減価償却資産の特例で即時償却可（年間300万円枠）
                  </p>
                );
                return null;
              })()}
            </div>
          )}

          <div>
            <label className="text-xs text-app-text-mute block mb-1">担当者</label>
            <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50">
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-app-text-mute block mb-1">
              内容・摘要
              {(DESCRIPTION_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku) && (
                <span className="text-app-red ml-1">*必須</span>
              )}
            </label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50"
              placeholder={
                form.kamoku === 'travel' ? '撮影移動 / ロケハン等' :
                form.kamoku === 'production' ? 'シャツ2点 出演衣装 / YT〇〇編ロケのホテル代 等' :
                form.kamoku === 'torizai' ? '湯河原温泉旅館○○ 代表インタビュー 等' :
                form.kamoku === 'entertainment' ? '打合せ後の会食等' :
                form.kamoku === 'equipment' ? '動画編集用に購入 等' :
                form.kamoku === 'outsource' ? '動画編集委託 / ナレーション収録等' :
                form.kamoku === 'rent' ? '自宅事務所 家賃 / 撮影スタジオ等' :
                form.kamoku === 'communication' ? '携帯料金 / Wi-Fi等' :
                form.kamoku === 'subscription' ? 'Adobe CC / Canva Pro等' :
                form.kamoku === 'software' ? 'Final Cut Pro / DaVinci Resolve等' :
                form.kamoku === 'advertising' ? 'YouTube広告 / SNS広告出稿等' :
                form.kamoku === 'tax' ? '個人事業税 / 印紙代等' :
                form.kamoku === 'insurance' ? '賠償責任保険 / 機材保険等' :
                form.kamoku === 'vehicle' ? 'ガソリン代 / 駐車場代等' :
                form.kamoku === 'utility' ? '電気代（按分）等' :
                form.kamoku === 'repair' ? 'カメラ修理 / PC修理等' :
                '任意'
              } />
          </div>

          {/* ===== ステータス・支払日 ===== */}
          <div className="pt-3 border-t border-app-line space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-app-text-mute block mb-1">ステータス</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50">
                  <option value="settled">{TRANSACTION_STATUS.settled}</option>
                  <option value="forecast">{TRANSACTION_STATUS.forecast}</option>
                  <option value="accrued">{TRANSACTION_STATUS.accrued}</option>
                </select>
              </div>
              {form.status !== 'settled' && (
                <div className="flex-1">
                  <label className="text-xs text-app-text-mute block mb-1">支払予定日</label>
                  <input type="date" value={form.actual_payment_date} onChange={(e) => setForm({ ...form, actual_payment_date: e.target.value })}
                    className="w-full px-3 py-2 bg-app-surface-alt rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50" />
                </div>
              )}
            </div>
            {form.status === 'settled' && (
              <p className="text-[10px] text-app-text-mute">利用日と同日に支払済みとして記録されます</p>
            )}
          </div>

          {/* v0.8.2: 案件タグ必須科目のヘルプボックス */}
          {KAMOKU_INPUT_GUIDE[form.kamoku] && (
            <div className="bg-state-warn-bg border border-app-gold/30 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]">💡</span>
                <span className="text-[11px] font-semibold text-app-text">{KAMOKU_INPUT_GUIDE[form.kamoku].title}</span>
              </div>
              <p className="text-[11px] text-app-text-sub leading-relaxed">{KAMOKU_INPUT_GUIDE[form.kamoku].body}</p>
              <p className="text-[10px] text-app-text-mute leading-relaxed">
                例：{KAMOKU_INPUT_GUIDE[form.kamoku].example}
              </p>
              {KAMOKU_INPUT_GUIDE[form.kamoku].requireProject && (
                <p className="text-[10px] text-app-red font-medium pt-0.5">
                  ※この科目は案件タグが必須です（未登録案件の場合は「{UNASSIGNED_PROJECT_LABEL}」を選択）
                </p>
              )}
              {KAMOKU_INPUT_GUIDE[form.kamoku].requireDescription && (
                <p className="text-[10px] text-app-red font-medium">
                  ※内容・摘要の記入も必須です
                </p>
              )}
            </div>
          )}

          {/* ===== 事業・PJ割り当て（複数行按分） ===== */}
          <div className="pt-3 border-t border-app-line">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-app-text-mute">
                事業・PJ割り当て
                {(PROJECT_TAG_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku) ? (
                  <span className="text-app-red ml-1">*必須</span>
                ) : (
                  <span className="ml-1">（任意）</span>
                )}
              </label>
              {!hasAllocRows && (
                <button onClick={addAllocRow} className="flex items-center gap-1 text-[10px] text-app-gold hover:underline">
                  <Plus className="w-3 h-3" />追加
                </button>
              )}
            </div>

            {hasAllocRows ? (
              <div className="space-y-3">
                {allocRows.map((row, idx) => {
                  const filteredPJ = row.division_id
                    ? projects.filter(p => p.division === row.division_id && p.status !== 'completed')
                    : [];
                  return (
                    <div key={idx} className="bg-app-surface rounded-lg p-2 space-y-1.5">
                      {/* 1段目: 事業・PJ（スマホでも幅確保） */}
                      <div className="flex items-center gap-1.5">
                        <select value={row.division_id} onChange={e => updateAllocRow(idx, 'division_id', e.target.value)}
                          className="px-2 py-1.5 bg-white rounded text-[11px] border-0 outline-none w-32 shrink-0">
                          <option value="">事業を選択</option>
                          {DIV_OPTIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <select value={row.project_id} onChange={e => updateAllocRow(idx, 'project_id', e.target.value)}
                          className="px-2 py-1.5 bg-white rounded text-[11px] border-0 outline-none flex-1 min-w-0">
                          <option value="">{(PROJECT_TAG_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku) ? 'PJを選択（必須）' : 'PJ（任意）'}</option>
                          {filteredPJ.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          {(PROJECT_TAG_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku) && (
                            <option value={UNASSIGNED_PROJECT_VALUE}>{UNASSIGNED_PROJECT_LABEL}</option>
                          )}
                        </select>
                      </div>
                      {/* 2段目: %・金額・削除 */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-0.5">
                          <input type="number" value={row.percent}
                            onChange={e => updateAllocRow(idx, 'percent', parseInt(e.target.value, 10) || 0)}
                            className="w-14 px-2 py-1.5 bg-white rounded text-[11px] border-0 outline-none text-right font-['Saira_Condensed'] tabular-nums"
                            min={0} max={100} />
                          <span className="text-[10px] text-app-text-mute">%</span>
                        </div>
                        {txAmount > 0 && (
                          <span className="text-[10px] font-['Saira_Condensed'] tabular-nums text-app-text-mute flex-1 text-right">
                            ¥{Math.round(txAmount * row.percent / 100).toLocaleString()}
                          </span>
                        )}
                        <button onClick={() => removeAllocRow(idx)} className="text-app-red/60 hover:text-app-red p-1 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-1">
                  <button onClick={addAllocRow} className="flex items-center gap-1 text-[11px] text-app-gold hover:underline">
                    <Plus className="w-3 h-3" />行を追加
                  </button>
                  <span className={`text-[11px] font-['Saira_Condensed'] tabular-nums ${totalPercent === 100 ? 'text-app-green' : 'text-app-red'}`}>
                    合計 {totalPercent}%
                  </span>
                </div>
              </div>
            ) : (
              <button onClick={addAllocRow} className="flex items-center gap-1 text-[11px] text-app-gold hover:underline">
                <Plus className="w-3 h-3" />事業・PJを割り当てる
              </button>
            )}
          </div>

          {error && <p className="text-xs text-app-red">{error}</p>}

          {dupWarning && (
            <div className="px-4 py-3 bg-app-gold/10 rounded-xl">
              <p className="text-xs text-app-gold font-medium mb-2">⚠ 類似の経費があります</p>
              <p className="text-[11px] text-app-text mb-3">{dupWarning}</p>
              <div className="flex gap-2">
                <button onClick={() => { setDupConfirmed(true); setDupWarning(null); handleSave(); }}
                  className="flex-1 py-2 bg-app-gold text-white rounded-lg text-xs font-medium hover:bg-app-gold-hover transition-colors">
                  それでも登録する
                </button>
                <button onClick={() => { setDupWarning(null); }}
                  className="flex-1 py-2 bg-app-surface-alt text-app-text-mute rounded-lg text-xs font-medium hover:bg-app-surface-hover transition-colors">
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          {showTemplateSave ? (() => {
            // v0.14.0 Phase 4: モード判定
            const snap = savedFormSnapshot;
            const isTransport = usesTransportDetail(snap?.kamoku || form.kamoku);
            const td = snap?.transportData || transportData;
            const isRoundTrip = td?.round_trip === 'round_trip';
            const returnMode = td?.return_mode || 'auto_reverse';
            // v0.14.7: multiMode = 往復全般（different_route/manual + auto_reverse）
            const multiMode = isTransport && isRoundTrip && td && (
              ((returnMode === 'different_route' || returnMode === 'manual') &&
                td.return_legs && td.return_legs.length > 0) ||
              (returnMode === 'auto_reverse')
            );
            const isAutoReverse = isTransport && isRoundTrip && returnMode === 'auto_reverse';
            // v0.38.0: routeOnlyMode 変数は撤廃（インラインUIで完結のためモーダルでは使わない）
            // 既存片道テンプレを往路/復路に適用中かどうか（二重保存防止）
            const outboundAlreadyLinked = !!selectedOutboundRoute;
            const returnAlreadyLinked = !!selectedReturnRoute;
            // v0.14.7 auto_reverse: 往路既存テンプレに既に逆順ペアが存在するか
            const reverseAlreadyExists = isAutoReverse && outboundAlreadyLinked &&
              !!selectedOutboundRoute?.paired_reverse_id;
            // 既定値セットアップ（モーダル初回表示時）
            const routeStr = td?.route_legs?.length > 0
              ? `${td.route_legs[0].from || ''}→${td.route_legs[td.route_legs.length - 1].to || ''}`
              : '';
            const returnRouteStr = td?.return_legs?.length > 0
              ? `${td.return_legs[0].from || ''}→${td.return_legs[td.return_legs.length - 1].to || ''}`
              : '';
            // v0.14.7 auto_reverse: 逆順名（復路方向の起点→終点）
            const autoReverseStr = td?.route_legs?.length > 0
              ? `${td.route_legs[td.route_legs.length - 1].to || ''}→${td.route_legs[0].from || ''}`
              : '';
            // v0.14.7 auto_reverse: パッケージ名のデフォルト
            const autoPackageDefault = routeStr ? `${routeStr}（往復）` : '';

            // v0.14.7 auto_reverse の表示条件
            //   第1段（逆順片道保存）: 往路既存 + paired_reverse_idなし → 表示
            //                          往路新規入力 → 表示（往路+逆順を同時保存）
            //                          往路既存 + paired_reverse_idあり → 非表示
            //   第2段（パッケージ保存）: 逆順の存在が確定できる場合に表示
            const showAutoReverseReturnBlock = isAutoReverse && !reverseAlreadyExists;
            const showAutoReversePackageBlock = isAutoReverse; // 実際の可否は下の disabled 判定で
            // Yes/No ラジオの汎用コンポーネント表現用ヘルパー
            const radioYesNo = (
              name: string,
              value: boolean,
              onYes: () => void,
              onNo: () => void,
            ) => (
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={name}
                    checked={value === true}
                    onChange={onYes}
                    className="w-4 h-4 accent-app-text"
                  />
                  <span className="text-xs text-app-text">はい</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name={name}
                    checked={value === false}
                    onChange={onNo}
                    className="w-4 h-4 accent-app-text"
                  />
                  <span className="text-xs text-app-text">いいえ</span>
                </label>
              </div>
            );

            return (
              <div className="space-y-3">
                {/* v0.38.0: routeOnlyMode はモーダル発火しない（インラインUIで完結）。
                    モーダル見出しは multiMode と通常の経費テンプレ提案の2分岐のみ。 */}
                {multiMode ? (
                  <>
                    <p className="text-xs text-app-text font-medium">登録提案</p>
                    <p className="text-[10px] text-app-text-mute">各項目で登録するか選んでください</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-app-text font-medium">経費テンプレとして登録しますか？</p>
                    <p className="text-[10px] text-app-text-mute">支払先・配賦・支払方法をワンタップで呼び出せます</p>
                  </>
                )}

                {/* 経費テンプレ名入力（multiMode + isAutoReverse 以外） */}
                {!isAutoReverse && !multiMode && (
                  <input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder={isTransport
                      ? '経費テンプレ名（例: 出張用・支払先＋配賦の塊）'
                      : 'テンプレ名（例: Adobe CC）'}
                    className="w-full px-3 py-2.5 text-sm border border-app-line-medium rounded-xl focus:outline-none focus:border-app-text transition-colors"
                    autoFocus
                  />
                )}

                {/* v0.14.7: multiMode (different_route/manual) — Yes/No ラジオ方式 */}
                {multiMode && !isAutoReverse && (
                  <div className="space-y-3 pt-2 border-t border-app-line">
                    {/* 往路 Yes/No — 既存テンプレ適用中は非表示 */}
                    {!outboundAlreadyLinked && (
                      <div>
                        <p className="text-xs text-app-text font-medium">往路「{routeStr}」を片道テンプレ保存?</p>
                        <p className="text-[10px] text-app-text-mute mt-0.5">逆順ペアも自動で保存されます</p>
                        {radioYesNo(
                          'saveOutbound',
                          saveOutboundEnabled,
                          () => {
                            setSaveOutboundEnabled(true);
                            if (!outboundTemplateName) setOutboundTemplateName(routeStr);
                          },
                          () => setSaveOutboundEnabled(false),
                        )}
                        {saveOutboundEnabled && (
                          <input
                            value={outboundTemplateName}
                            onChange={e => setOutboundTemplateName(e.target.value)}
                            placeholder="往路名（例: 自宅→四ツ谷）"
                            className="w-full mt-2 px-3 py-2.5 text-sm border border-app-line-medium rounded-xl focus:outline-none focus:border-app-text transition-colors"
                          />
                        )}
                      </div>
                    )}

                    {/* 復路 Yes/No — 既存テンプレ適用中は非表示 */}
                    {!returnAlreadyLinked && (
                      <div>
                        <p className="text-xs text-app-text font-medium">復路「{returnRouteStr}」を片道テンプレ保存?</p>
                        <p className="text-[10px] text-app-text-mute mt-0.5">逆順ペアも自動で保存されます</p>
                        {radioYesNo(
                          'saveReturn',
                          saveReturnEnabled,
                          () => {
                            setSaveReturnEnabled(true);
                            if (!returnTemplateName) setReturnTemplateName(returnRouteStr);
                          },
                          () => setSaveReturnEnabled(false),
                        )}
                        {saveReturnEnabled && (
                          <input
                            value={returnTemplateName}
                            onChange={e => setReturnTemplateName(e.target.value)}
                            placeholder="復路名（例: 四ツ谷→自宅（新宿経由））"
                            className="w-full mt-2 px-3 py-2.5 text-sm border border-app-line-medium rounded-xl focus:outline-none focus:border-app-text transition-colors"
                          />
                        )}
                      </div>
                    )}

                    {/* パッケージ Yes/No */}
                    <div>
                      {(() => {
                        const outboundAvailable = outboundAlreadyLinked || saveOutboundEnabled;
                        const returnAvailable = returnAlreadyLinked || saveReturnEnabled;
                        const packageEnabled = outboundAvailable && returnAvailable;
                        return (
                          <>
                            <p className={`text-xs font-medium ${packageEnabled ? 'text-app-text' : 'text-app-text-mute'}`}>
                              この往復セットをパッケージ保存?
                            </p>
                            <p className="text-[10px] text-app-text-mute mt-0.5">
                              {packageEnabled
                                ? '次回ルート選択時に1クリックで適用できます'
                                : '往路・復路の両方を「はい」または既存選択してください'}
                            </p>
                            {packageEnabled && radioYesNo(
                              'savePackage',
                              savePackageEnabled,
                              () => {
                                setSavePackageEnabled(true);
                                if (!packageTemplateName) setPackageTemplateName(`${routeStr}（往復）`);
                              },
                              () => setSavePackageEnabled(false),
                            )}
                            {savePackageEnabled && packageEnabled && (
                              <input
                                value={packageTemplateName}
                                onChange={e => setPackageTemplateName(e.target.value)}
                                placeholder="パッケージ名（例: 自宅⇔四ツ谷）"
                                className="w-full mt-2 px-3 py-2.5 text-sm border border-app-line-medium rounded-xl focus:outline-none focus:border-app-text transition-colors"
                              />
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* v0.14.7: auto_reverse — 2段構え Yes/No */}
                {isAutoReverse && (
                  <div className="space-y-3 pt-2 border-t border-app-line">
                    {/* 第1段: 逆順片道テンプレ保存 */}
                    {showAutoReverseReturnBlock && (
                      <div>
                        {outboundAlreadyLinked ? (
                          <>
                            <p className="text-xs text-app-text font-medium">復路「{autoReverseStr}」を片道テンプレ保存?</p>
                            <p className="text-[10px] text-app-text-mute mt-0.5">
                              次回、復路として選べるようになります
                            </p>
                            {radioYesNo(
                              'saveReverse',
                              saveReturnEnabled,
                              () => {
                                setSaveReturnEnabled(true);
                                if (!returnTemplateName) setReturnTemplateName(autoReverseStr);
                              },
                              () => setSaveReturnEnabled(false),
                            )}
                            {saveReturnEnabled && (
                              <input
                                value={returnTemplateName}
                                onChange={e => setReturnTemplateName(e.target.value)}
                                placeholder="復路テンプレ名（例: 四ツ谷→自宅）"
                                className="w-full mt-2 px-3 py-2.5 text-sm border border-app-line-medium rounded-xl focus:outline-none focus:border-app-text transition-colors"
                              />
                            )}
                          </>
                        ) : (
                          <>
                            <p className="text-xs text-app-text font-medium">往路「{routeStr}」を片道テンプレ保存?</p>
                            <p className="text-[10px] text-app-text-mute mt-0.5">
                              逆順ペアも自動で保存されます
                            </p>
                            {radioYesNo(
                              'saveOutboundNew',
                              saveOutboundEnabled,
                              () => {
                                setSaveOutboundEnabled(true);
                                if (!outboundTemplateName) setOutboundTemplateName(routeStr);
                              },
                              () => setSaveOutboundEnabled(false),
                            )}
                            {saveOutboundEnabled && (
                              <input
                                value={outboundTemplateName}
                                onChange={e => setOutboundTemplateName(e.target.value)}
                                placeholder="往路名（例: 自宅→四ツ谷）"
                                className="w-full mt-2 px-3 py-2.5 text-sm border border-app-line-medium rounded-xl focus:outline-none focus:border-app-text transition-colors"
                              />
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* 第2段: パッケージ保存 */}
                    {showAutoReversePackageBlock && (() => {
                      // パッケージ化可能条件:
                      //   a) 往路既存 + 逆順既存（reverseAlreadyExists）
                      //   b) 往路既存 + 逆順新規保存（saveReturnEnabled + 名前入力済）
                      //   c) 往路新規保存（saveOutboundEnabled + 名前入力済）→ 逆順自動生成
                      const packageEnabled =
                        reverseAlreadyExists ||
                        (outboundAlreadyLinked && saveReturnEnabled && returnTemplateName.trim().length > 0) ||
                        (!outboundAlreadyLinked && saveOutboundEnabled && outboundTemplateName.trim().length > 0);
                      return (
                        <div>
                          <p className={`text-xs font-medium ${packageEnabled ? 'text-app-text' : 'text-app-text-mute'}`}>
                            この往復をパッケージ保存?
                          </p>
                          <p className="text-[10px] text-app-text-mute mt-0.5">
                            {packageEnabled
                              ? '次回ルート選択時に1クリックで適用できます'
                              : reverseAlreadyExists
                                ? '逆順ペアは既に存在します'
                                : '先に往路または復路の保存を選んでください'}
                          </p>
                          {packageEnabled && radioYesNo(
                            'savePackageAuto',
                            savePackageEnabled,
                            () => {
                              setSavePackageEnabled(true);
                              if (!packageTemplateName) setPackageTemplateName(autoPackageDefault);
                            },
                            () => setSavePackageEnabled(false),
                          )}
                          {savePackageEnabled && packageEnabled && (
                            <input
                              value={packageTemplateName}
                              onChange={e => setPackageTemplateName(e.target.value)}
                              placeholder="パッケージ名（例: 自宅⇔四ツ谷）"
                              className="w-full mt-2 px-3 py-2.5 text-sm border border-app-line-medium rounded-xl focus:outline-none focus:border-app-text transition-colors"
                            />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* v0.38.0: 片道モード/ルートのみモードのモーダル内UIは撤廃。
                    ルート保存はインラインUI（このルートをテンプレに保存する）で完結。
                    モーダル経由でルート名入力を求めることはなくなった。 */}

                <div className="flex gap-2">
                  <button onClick={() => {
                    setShowTemplateSave(false);
                    setSavedFormSnapshot(null);
                    setAlsoSaveRoute(false);
                    setRouteTemplateName('');
                    setTemplateName('');
                    setSaveOutboundEnabled(false);
                    setOutboundTemplateName('');
                    setSaveReturnEnabled(false);
                    setReturnTemplateName('');
                    setSavePackageEnabled(false);
                    setPackageTemplateName('');
                    onClose();
                  }}
                    className="flex-1 py-2.5 text-xs text-app-text-mute bg-app-surface-alt rounded-xl hover:bg-app-surface-hover transition-colors">
                    登録しない
                  </button>
                  <button onClick={saveAsTemplate}
                    disabled={(() => {
                      if (multiMode) {
                        const outboundValid = !saveOutboundEnabled || outboundTemplateName.trim().length > 0;
                        const returnValid = !saveReturnEnabled || returnTemplateName.trim().length > 0;
                        const packageValid = !savePackageEnabled || packageTemplateName.trim().length > 0;
                        return !outboundValid || !returnValid || !packageValid;
                      }
                      // v0.38.0: routeOnlyMode + alsoSaveRoute 連動のモーダルロジックは撤廃。
                      // ルート保存はインラインUIで完結するため、本モーダルは経費テンプレ専用。
                      return !templateName.trim();
                    })()}
                    className="flex-1 py-2.5 text-xs text-white bg-app-button rounded-xl hover:bg-app-button-hover disabled:opacity-40 transition-colors">
                    登録する
                  </button>
                </div>
              </div>
            );
          })() : (
            <button onClick={handleSave} disabled={saving || auditing || !form.amount || !form.date}
              className="w-full py-3 bg-app-button text-white rounded-xl text-sm font-medium hover:bg-app-button-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2">
              {auditing ? (<><Loader2 className="w-4 h-4 animate-spin" />AIが校閲中...</>) :
               saving ? (<><Loader2 className="w-4 h-4 animate-spin" />保存中...</>) :
               editData ? '更新する' : '登録する'}
            </button>
          )}
        </div>
      </div>

      {/* v0.39.0: AI校閲結果モーダル */}
      {auditResult && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-app-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className={`px-5 py-4 border-b border-app-line-medium ${
              auditResult.verdict === 'error' ? 'bg-app-error/10' :
              auditResult.verdict === 'warning' ? 'bg-app-warn/10' : 'bg-app-button-soft'
            }`}>
              <p className="text-[10px] font-medium tracking-wider text-app-text-mute">AI 最終校閲</p>
              <h3 className="text-base font-medium text-app-text mt-0.5">
                {auditResult.verdict === 'error' ? '登録前に確認が必要です' :
                 auditResult.verdict === 'warning' ? '注意点があります' : 'チェック完了'}
              </h3>
              {auditResult.summary && (
                <p className="text-xs text-app-text-sub mt-1.5 leading-relaxed">{auditResult.summary}</p>
              )}
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {auditResult.issues.map((issue, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 border ${
                  issue.level === 'error' ? 'border-app-error/40 bg-app-error/5' :
                  issue.level === 'warning' ? 'border-app-warn/40 bg-app-warn/5' :
                  'border-app-line-medium bg-app-surface-alt'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-medium tracking-wider ${
                      issue.level === 'error' ? 'text-app-error' :
                      issue.level === 'warning' ? 'text-app-warn' : 'text-app-text-mute'
                    }`}>
                      {issue.level === 'error' ? 'ERROR' : issue.level === 'warning' ? 'WARN' : 'INFO'}
                    </span>
                    <span className="text-[10px] text-app-text-mute font-mono">{issue.field}</span>
                  </div>
                  <p className="text-[12px] text-app-text leading-relaxed">{issue.message}</p>
                  {issue.suggestion && (
                    <p className="text-[11px] text-app-text-sub mt-1 leading-relaxed">→ {issue.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-app-line-medium flex gap-2">
              <button
                onClick={() => setAuditResult(null)}
                className="flex-1 py-2.5 text-sm text-app-text-sub bg-app-surface-alt rounded-xl hover:text-app-text transition-colors"
              >
                修正する
              </button>
              <button
                onClick={() => {
                  // バイパスフラグを立てて再度handleSaveを呼ぶ
                  auditBypassRef.current = true;
                  setAuditResult(null);
                  handleSave();
                }}
                className={`flex-1 py-2.5 text-sm rounded-xl transition-colors ${
                  auditResult.verdict === 'error'
                    ? 'text-white bg-app-error hover:opacity-90'
                    : 'text-white bg-app-button hover:bg-app-button-hover'
                }`}
              >
                {auditResult.verdict === 'error' ? 'それでも登録' : 'このまま登録'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v0.41.0: 親登録成功後の「追加領収書ありますか?」ポップアップ */}
      {pendingAddonPrompt && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-app-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl">
            <div className="px-5 py-4 border-b border-app-line-medium bg-app-button-soft">
              <p className="text-[10px] font-medium tracking-wider text-app-text-mute">登録完了</p>
              <h3 className="text-base font-medium text-app-text mt-0.5">
                {pendingAddonPrompt.detectedAddons && pendingAddonPrompt.detectedAddons.length > 0
                  ? `領収書から追加課金が${pendingAddonPrompt.detectedAddons.length}件見つかりました`
                  : 'この取引に関する追加領収書はありますか?'}
              </h3>
              <p className="text-xs text-app-text-sub mt-1.5 leading-relaxed">
                {pendingAddonPrompt.detectedAddons && pendingAddonPrompt.detectedAddons.length > 0
                  ? `アップグレード・座席指定料・荷物料金などをまとめて登録できます。`
                  : 'アップグレード・座席指定・荷物料金などの追加課金がある場合は領収書を読み込んでください。'}
              </p>
            </div>

            {/* 検出済 addon が存在する場合 — リスト表示 + 一括追加ボタン */}
            {pendingAddonPrompt.detectedAddons && pendingAddonPrompt.detectedAddons.length > 0 && (
              <div className="px-5 py-4 space-y-2">
                {pendingAddonPrompt.detectedAddons.map((ac, i) => (
                  <div key={i} className="rounded-lg border border-app-gold/40 bg-app-gold/5 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-app-text leading-relaxed">
                          {ac.charge_type === 'upgrade'
                            ? `${ac.related_flight_no || ''} ${ac.upgrade_from_class || '普通席'}→${ac.upgrade_to_class || 'クラスJ'}`
                            : ac.description || ac.charge_type || '追加課金'}
                        </p>
                        <p className="text-[10px] text-app-text-mute mt-0.5">
                          {ac.date} {ac.related_leg_from} → {ac.related_leg_to}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-app-text font-['Saira_Condensed'] tabular-nums">
                        ¥{(ac.amount || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-4 border-t border-app-line-medium space-y-2">
              {/* ★メインアクション: 検出済addonがあれば「全部一括登録」 */}
              {pendingAddonPrompt.detectedAddons && pendingAddonPrompt.detectedAddons.length > 0 && (
                <button
                  onClick={async () => {
                    // 各 addon を子取引として一括登録
                    if (!supabase) return;
                    const parent = pendingAddonPrompt;
                    const inserts = parent.detectedAddons!.map(ac => {
                      const description = ac.charge_type === 'upgrade'
                        ? `${ac.related_flight_no || ''} 当日アップグレード(${ac.upgrade_from_class || '普通席'}→${ac.upgrade_to_class || 'クラスJ'})`.trim()
                        : ac.description || `追加課金(${ac.charge_type || 'その他'})`;
                      return {
                        date: ac.date || parent.parentDate,
                        amount: ac.amount || 0,
                        store: parent.parentStore,
                        kamoku: parent.parentKamoku,
                        sub_category: parent.parentSubCategory,
                        description,
                        owner: parent.parentOwner,
                        status: 'settled',
                        parent_transaction_id: parent.parentTxId,
                      };
                    });
                    const { data: insertedRows, error } = await supabase
                      .from('transactions')
                      .insert(inserts as any)
                      .select('id');
                    if (error) {
                      console.error('addon insert error:', error);
                      setError(`追加課金の登録に失敗: ${error.message}`);
                      setPendingAddonPrompt(null);
                      onClose();
                      return;
                    }
                    // 各子取引に transport_details(クラスのみ更新したコピー)を保存
                    if (insertedRows && parent.parentTransport) {
                      for (let i = 0; i < insertedRows.length; i++) {
                        const ac = parent.detectedAddons![i];
                        const childTransport: TransportData = {
                          ...parent.parentTransport,
                          // 子取引はその区間1区間のみ・往復は片道扱い
                          round_trip: 'one_way',
                          fare_input_mode: null,
                          return_legs: [],
                          return_amount: 0,
                          route_legs: [{
                            from: ac.related_leg_from || parent.parentTransport.route_legs[0]?.from || '',
                            to: ac.related_leg_to || parent.parentTransport.route_legs[0]?.to || '',
                            method: parent.parentTransport.route_legs[0]?.method || '飛行機',
                            carrier: parent.parentTransport.route_legs[0]?.carrier || '',
                            amount: ac.amount || 0,
                            green: false,
                            green_amount: 0,
                            class_value: ac.upgrade_to_class || 'クラスJ',
                            class_reason: '',
                            client_name: '',
                            flight_train_no: ac.related_flight_no || '',
                            passenger_count: 1,
                            companion_memo: '',
                          }],
                        };
                        try {
                          await saveTransportDetails((insertedRows[i] as any).id, childTransport);
                        } catch (e) {
                          console.warn('child transport save failed:', e);
                        }
                      }
                    }
                    // 親PDFを子取引にも複製参照(receipts テーブルへ追記)
                    if (insertedRows && parent.parentReceiptFiles.length > 0) {
                      const receiptInserts: any[] = [];
                      insertedRows.forEach((row: any) => {
                        parent.parentReceiptFiles.forEach(f => {
                          receiptInserts.push({
                            transaction_id: row.id,
                            file_name: f.fileName,
                            drive_file_id: f.driveFileId,
                            drive_url: f.driveUrl,
                          });
                        });
                      });
                      try {
                        await supabase.from('receipts').insert(receiptInserts);
                      } catch (e) {
                        console.warn('child receipt copy failed:', e);
                      }
                    }
                    onSaved();
                    setPendingAddonPrompt(null);
                    onClose();
                  }}
                  className="w-full py-2.5 text-sm text-white bg-app-button rounded-xl hover:bg-app-button-hover transition-colors"
                >
                  {pendingAddonPrompt.detectedAddons.length}件すべて追加登録する
                </button>
              )}

              {/* 別の領収書を追加(将来拡張用・現状は手動で経費追加へ誘導) */}
              <button
                onClick={() => {
                  setPendingAddonPrompt(null);
                  onClose();
                }}
                className="w-full py-2.5 text-sm text-app-text-sub bg-app-surface-alt rounded-xl hover:text-app-text transition-colors"
              >
                {pendingAddonPrompt.detectedAddons && pendingAddonPrompt.detectedAddons.length > 0
                  ? '追加しないで閉じる'
                  : 'ありません(閉じる)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v0.10.0: AI会計相談モーダル */}
      {showConsultation && (
        <ConsultationModal
          context={{
            transaction_id: editData?.id || null,
            date: form.date,
            amount: form.amount ? Number(form.amount.replace(/,/g, '')) : undefined,
            store: form.store || undefined,
            kamoku: form.kamoku,
            item_name: form.item_name || undefined,
            description: form.description || undefined,
          }}
          owner={(form.owner === 'tomo' || form.owner === 'toshiki') ? form.owner : 'tomo'}
          onApplyKamoku={(newKamoku) => {
            setForm({ ...form, kamoku: newKamoku });
          }}
          onClose={() => setShowConsultation(false)}
        />
      )}
    </div>
  );
}


// v0.9.0: 領収書AI抽出結果からkamokuを推定するユーティリティ（Uploader.tsxから移植）
function guessKamokuIdFromVendor(vendor?: string): string {
  if (!vendor) return 'misc';
  const v = vendor.toLowerCase();
  if (v.includes('航空') || v.includes('鉄道') || v.includes('jr') || v.includes('タクシー') || v.includes('バス')) return 'travel';
  if (v.includes('ホテル') || v.includes('旅館') || v.includes('inn') || v.includes('hotel')) return 'travel';
  if (v.includes('amazon') || v.includes('ヨドバシ') || v.includes('ビック')) return 'equipment';
  if (v.includes('ntt') || v.includes('docomo') || v.includes('au') || v.includes('softbank')) return 'communication';
  if (v.includes('スタバ') || v.includes('starbucks') || v.includes('ドトール') || v.includes('タリーズ')) return 'entertainment';
  return 'misc';
}
