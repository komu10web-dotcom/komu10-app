'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Trash2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KAMOKU, DIVISIONS, TRANSACTION_STATUS, PROJECT_TAG_REQUIRED_KAMOKU, KAMOKU_INPUT_GUIDE, DESCRIPTION_REQUIRED_KAMOKU, usesTransportDetail, UNASSIGNED_PROJECT_VALUE, UNASSIGNED_PROJECT_LABEL } from '@/types/database';
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
}

interface AllocRow {
  division_id: string;
  project_id: string;
  percent: number;
}

const EXPENSE_KAMOKU = Object.entries(KAMOKU)
  .filter(([, v]) => v.type === 'expense')
  .map(([id, v]) => ({ id, name: v.name }));

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
}: TransactionModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    store: '',
    kamoku: 'misc',
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
  });

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
  }, [isOpen, defaultOwner]);

  // グリーン車モード切替時にamountを更新（v0.7: 汎用テンプレのみ対象）
  useEffect(() => {
    if (!selectedTemplate || selectedTemplate.template_type !== 'general') return;
    const amt = greenMode && selectedTemplate.green_amount
      ? selectedTemplate.green_amount
      : selectedTemplate.amount || 0;
    setForm(prev => ({ ...prev, amount: amt.toString() }));
  }, [greenMode, selectedTemplate]);

  useEffect(() => {
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
      setForm({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        store: '',
        kamoku: 'misc',
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
      });
      setTransportData({ ...EMPTY_TRANSPORT });
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
  }, [editData, isOpen, defaultOwner]);

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

    // 交通費の往復・different_route|manual モードでは3チェックボックス方式
    const useMultiRouteMode = isTransport && isRoundTrip && td &&
      (returnMode === 'different_route' || returnMode === 'manual') &&
      td.return_legs.length > 0;

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
          // 3チェックボックス方式（往復・different_route or manual）
          let outboundId: string | null = selectedOutboundRoute?.id || null;
          let returnId: string | null = selectedReturnRoute?.id || null;

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
        } else {
          // 片道 or 往復auto_reverse モード → 片道テンプレ1個 + 逆順ペアを自動生成
          // routeOnlyMode (経費テンプレ適用中で新規ルート手入力) ではチェックボックスなしでも
          // ルート名が入力されていれば保存する仕様
          const routeOnlyMode = isTransport && !!selectedTemplate && selectedTemplate.template_type === 'transport';
          const shouldSaveRoute = (alsoSaveRoute || routeOnlyMode) && routeTemplateName.trim();
          if (shouldSaveRoute && outboundLegs.length > 0 && outboundLegs.some((l: any) => l.from || l.to)) {
            await saveOnewayWithPair({
              owner: snap.owner,
              name: routeTemplateName.trim(),
              legs: outboundLegs,
            });
          }
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
    }));

    // v0.10.1: 交通費の場合、ルート・往復・支払方法を transportData に自動流し込み
    if (inferredKamoku === 'travel') {
      const validPaymentMethods = ['ic', 'cash', 'credit', 'invoice'];
      const aiPayment = data.payment_method && validPaymentMethods.includes(data.payment_method)
        ? data.payment_method
        : null;

      setTransportData(prev => {
        const next = { ...prev };
        // 出発地・到着地が両方とれている場合のみ、最初の区間を上書き
        if (data.from_station && data.to_station) {
          const firstLeg = prev.route_legs?.[0] || { from: '', to: '', method: '電車', carrier: '', amount: 0, green: false };
          next.route_legs = [
            {
              ...firstLeg,
              from: data.from_station,
              to: data.to_station,
              carrier: data.carrier || firstLeg.carrier || '',
              amount: data.amount || firstLeg.amount || 0,
            },
            ...prev.route_legs.slice(1),
          ];
        }
        // 往復区分
        if (data.round_trip === 'one_way' || data.round_trip === 'round_trip') {
          next.round_trip = data.round_trip;
        }
        // 支払方法
        if (aiPayment) {
          next.payment_method = aiPayment;
        }
        return next;
      });
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

  const handleSave = async () => {
    if (!form.amount || !form.date) {
      setError('日付と金額は必須です');
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

    setSaving(true);
    setError(null);

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

    // 往復別金額 → 2レコード分割判定（v0.13.0: travel/production/torizai 共通）
    const isRoundTripSplit = usesTransportDetail(form.kamoku)
      && transportData.round_trip === 'round_trip'
      && !transportData.same_amount
      && !editData;

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
    });

    try {
      let txId: string;

      if (isRoundTripSplit) {
        // 往路
        const oneWayAmount = transportData.route_legs.reduce((s, l) => s + (l.amount || 0), 0);
        const returnAmount = transportData.same_route
          ? (transportData.return_amount || 0)
          : transportData.return_legs.reduce((s, l) => s + (l.amount || 0), 0);

        const outDesc = finalDescription ? `${finalDescription}（往路）` : '（往路）';
        const retDesc = finalDescription ? `${finalDescription}（復路）` : '（復路）';

        const { data: ins1, error: err1 } = await supabase
          .from('transactions')
          .insert(buildPayload(oneWayAmount, outDesc) as any)
          .select('id').single();
        if (err1) throw err1;
        txId = (ins1 as any).id;
        await saveTransportDetails(txId, transportData);

        // 復路
        const { data: ins2, error: err2 } = await supabase
          .from('transactions')
          .insert(buildPayload(returnAmount, retDesc) as any)
          .select('id').single();
        if (err2) throw err2;
        const returnTransportData = {
          ...transportData,
          route_legs: transportData.same_route
            ? transportData.route_legs.map(l => ({ ...l })).reverse()
            : transportData.return_legs,
        };
        await saveTransportDetails((ins2 as any).id, returnTransportData);
      } else {
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
          const { data: inserted, error: dbErr } = await supabase
            .from('transactions')
            .insert(payload as any)
            .select('id')
            .single();
          if (dbErr) throw dbErr;
          txId = (inserted as any).id;

          if (usesTransportDetail(form.kamoku) && inserted) {
            await saveTransportDetails((inserted as any).id, transportData);
          }
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
      const shouldSuggestRouteSave = (() => {
        if (!usesTransportDetail(form.kamoku)) return false;
        if (selectedOutboundRoute) return false; // 既存ルート選択済みなら不要
        const legs = transportData.route_legs || [];
        if (legs.length === 0) return false;
        const hasContent = legs.some((l: any) => (l.from || '').trim() || (l.to || '').trim());
        return hasContent;
      })();

      // v0.14.0 Phase 4: multiMode の発火判定
      // - 往復 + different_route/manual + 往路・復路いずれか新規入力あり
      const shouldSuggestMultiMode = (() => {
        if (!usesTransportDetail(form.kamoku)) return false;
        if (transportData.round_trip !== 'round_trip') return false;
        const rm = transportData.return_mode || 'auto_reverse';
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
        setAlsoSaveRoute(shouldSuggestRouteSave);
        // ルート名のデフォルト候補（起点→終点）
        if (shouldSuggestRouteSave) {
          const legs = transportData.route_legs || [];
          const firstFrom = (legs[0]?.from || '').trim();
          const lastTo = (legs[legs.length - 1]?.to || '').trim();
          if (firstFrom && lastTo) {
            setRouteTemplateName(`${firstFrom}→${lastTo}`);
          }
        }
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
      } else if (shouldSuggestRouteSave) {
        // v0.13.1: 経費テンプレ既選択だが、新規ルートを手入力した場合はルートのみ保存提案
        setSavedFormSnapshot({
          kamoku: form.kamoku,
          store: form.store,
          amount: txAmount,
          description: finalDescription,
          owner: form.owner,
          payment_method: usesTransportDetail(form.kamoku) ? transportData.payment_method : 'personal',
          transportData: usesTransportDetail(form.kamoku) ? { ...transportData } : null,
        });
        setAlsoSaveRoute(true);
        // ルート名のみ入力してもらうモード（経費テンプレ名は空のまま → UIで分岐）
        setTemplateName('');
        const legs = transportData.route_legs || [];
        const firstFrom = (legs[0]?.from || '').trim();
        const lastTo = (legs[legs.length - 1]?.to || '').trim();
        if (firstFrom && lastTo) {
          setRouteTemplateName(`${firstFrom}→${lastTo}`);
        }
        setShowTemplateSave(true);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const txAmount = parseInt(form.amount.replace(/,/g, '')) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative bg-white rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
        <div className="sticky top-0 bg-white rounded-t-2xl px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h3 className="text-sm font-medium text-[#1a1a1a]">
            {editData ? '経費を編集' : '経費を追加'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-full">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* v0.11.0: 領収書アップロード（新規/編集 共通） */}
          <ReceiptUploadSection
            defaultOwner={form.owner}
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
            <label className="text-xs text-[#999] block mb-1">日付</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
          </div>
          {/* ② 勘定科目（日付の直後 — ここで分岐） */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[#999]">勘定科目</label>
              <button
                type="button"
                onClick={() => setShowConsultation(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#1a1a1a] hover:bg-black/5 transition-colors"
                title="この経費の科目をAIに相談"
              >
                <Sparkles className="w-3 h-3" />
                <span>AIに相談</span>
              </button>
            </div>
            <select value={form.kamoku} onChange={(e) => setForm({ ...form, kamoku: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              {EXPENSE_KAMOKU.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </div>
          {/* 金額・支払先（交通費以外） — 交通費は専用UI内で完結 */}
          {form.kamoku !== 'travel' && (
            <>
              <div>
                <label className="text-xs text-[#999] block mb-1">金額（税込）</label>
                <input type="text" inputMode="numeric"
                  value={form.amount ? Number(form.amount.replace(/,/g, '')).toLocaleString() : ''}
                  onChange={(e) => { const v = e.target.value.replace(/,/g, ''); if (/^\d*$/.test(v)) setForm({ ...form, amount: v }); }}
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" placeholder="15,300" />
              </div>
              <div>
                <label className="text-xs text-[#999] block mb-1">支払先</label>
                <input type="text" value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
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

          {/* v0.7: 交通費テンプレ（業務メタ） + ルートテンプレ（物理経路）の独立選択 */}
          {form.kamoku === 'travel' && (
            <div className="space-y-3">
              {/* 経費テンプレ選択（業務メタ） */}
              {templates.filter(t => t.template_type === 'transport').length > 0 && (
                <div>
                  <label className="text-xs text-[#999] block mb-1">経費テンプレ（業務メタ）</label>
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
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
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
                    <label className="text-xs text-[#999] block mb-1">ルート</label>
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
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
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
                <p className="text-xs text-[#999]">テンプレートから入力</p>
                <div className="flex flex-wrap gap-1.5">
                  {generalTpls.slice(0, 5).map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        selectedTemplate?.id === tpl.id
                          ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                          : 'bg-[#F5F5F3] text-[#555] border-[#E0E0E0] hover:border-[#D4A03A] hover:text-[#D4A03A]'
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

          {usesTransportDetail(form.kamoku) && (
            <TransportFields
              data={transportData}
              onChange={setTransportData}
              onAmountChange={(total) => {
                if (total > 0) setForm(prev => ({ ...prev, amount: total.toString() }));
              }}
              returnRouteSelector={(() => {
                // v0.14.0: 「別の片道テンプレを選ぶ」モード時に表示する片道テンプレセレクタ
                // アーカイブ除外 + 片道のみ（パッケージは除外）
                const onewayActives = routeTemplates.filter(
                  (t) => !t.archived_at && t.template_kind !== 'roundtrip_package'
                );
                if (onewayActives.length === 0) {
                  return (
                    <p className="text-[11px] text-[#999]">
                      片道テンプレがまだありません。「手入力」を選んでください。
                    </p>
                  );
                }
                return (
                  <div>
                    <label className="text-xs text-[#999] block mb-1">復路に使う片道テンプレ</label>
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
                      className="w-full px-3 py-2 bg-white rounded-lg text-sm border border-[#D4A03A]/30 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
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
          )}
          {form.kamoku === 'entertainment' && <EntertainmentFields data={entertainmentData} onChange={setEntertainmentData} />}

          {form.kamoku === 'equipment' && (
            <div className="border border-[#D4A03A]/30 rounded-xl p-4 space-y-3 bg-[#D4A03A]/5">
              <p className="text-xs font-medium text-[#D4A03A]">消耗品費詳細</p>
              <div>
                <label className="text-xs text-[#999] block mb-1">品名（必須）</label>
                <input type="text" value={form.item_name}
                  onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                  placeholder="MacBook Pro 14インチ / SDカード 128GB 等" />
              </div>
              {(parseInt(form.amount.replace(/,/g, '')) || 0) >= 10000 && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-[#999] block mb-1">カテゴリ</label>
                      <select value={form.eq_category} onChange={(e) => setForm({ ...form, eq_category: e.target.value })}
                        className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
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
                      <label className="text-xs text-[#999] block mb-1">事業利用割合</label>
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} value={form.eq_business_ratio}
                          onChange={(e) => setForm({ ...form, eq_business_ratio: e.target.value })}
                          className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50 font-['Saira_Condensed'] tabular-nums" />
                        <span className="text-xs text-[#999] shrink-0">%</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#999] block mb-1">メーカー・型番</label>
                    <input type="text" value={form.eq_maker}
                      onChange={(e) => setForm({ ...form, eq_maker: e.target.value })}
                      className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                      placeholder="Apple / SONY α7IV 等" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-[#999] block mb-1">シリアル番号</label>
                      <input type="text" value={form.eq_serial}
                        onChange={(e) => setForm({ ...form, eq_serial: e.target.value })}
                        className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
                        placeholder="任意" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-[#999] block mb-1">保証期限</label>
                      <input type="date" value={form.eq_warranty_date}
                        onChange={(e) => setForm({ ...form, eq_warranty_date: e.target.value })}
                        className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
                    </div>
                  </div>
                </>
              )}
              {(() => {
                const amt = parseInt(form.amount.replace(/,/g, '')) || 0;
                if (amt >= 400000) return (
                  <p className="text-[10px] text-[#C23728] flex items-center gap-1">
                    ※ 40万円以上 → 固定資産（耐用年数で減価償却）
                  </p>
                );
                if (amt >= 100000) return (
                  <p className="text-[10px] text-[#D4A03A] flex items-center gap-1">
                    ※ 10〜40万円未満 → 少額減価償却資産の特例で即時償却可（年間300万円枠）
                  </p>
                );
                return null;
              })()}
            </div>
          )}

          <div>
            <label className="text-xs text-[#999] block mb-1">担当者</label>
            <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
              <option value="tomo">トモ</option>
              <option value="toshiki">トシキ</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-[#999] block mb-1">
              内容・摘要
              {(DESCRIPTION_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku) && (
                <span className="text-[#C23728] ml-1">*必須</span>
              )}
            </label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50"
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
          <div className="pt-3 border-t border-gray-100 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-[#999] block mb-1">ステータス</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50">
                  <option value="settled">{TRANSACTION_STATUS.settled}</option>
                  <option value="forecast">{TRANSACTION_STATUS.forecast}</option>
                  <option value="accrued">{TRANSACTION_STATUS.accrued}</option>
                </select>
              </div>
              {form.status !== 'settled' && (
                <div className="flex-1">
                  <label className="text-xs text-[#999] block mb-1">支払予定日</label>
                  <input type="date" value={form.actual_payment_date} onChange={(e) => setForm({ ...form, actual_payment_date: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50" />
                </div>
              )}
            </div>
            {form.status === 'settled' && (
              <p className="text-[10px] text-[#999]">利用日と同日に支払済みとして記録されます</p>
            )}
          </div>

          {/* v0.8.2: 案件タグ必須科目のヘルプボックス */}
          {KAMOKU_INPUT_GUIDE[form.kamoku] && (
            <div className="bg-[#FFFBEB] border border-[#D4A03A]/30 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px]">💡</span>
                <span className="text-[11px] font-semibold text-[#1a1a1a]">{KAMOKU_INPUT_GUIDE[form.kamoku].title}</span>
              </div>
              <p className="text-[11px] text-[#666] leading-relaxed">{KAMOKU_INPUT_GUIDE[form.kamoku].body}</p>
              <p className="text-[10px] text-[#999] leading-relaxed">
                例：{KAMOKU_INPUT_GUIDE[form.kamoku].example}
              </p>
              {KAMOKU_INPUT_GUIDE[form.kamoku].requireProject && (
                <p className="text-[10px] text-[#C23728] font-medium pt-0.5">
                  ※この科目は案件タグが必須です（未登録案件の場合は「{UNASSIGNED_PROJECT_LABEL}」を選択）
                </p>
              )}
              {KAMOKU_INPUT_GUIDE[form.kamoku].requireDescription && (
                <p className="text-[10px] text-[#C23728] font-medium">
                  ※内容・摘要の記入も必須です
                </p>
              )}
            </div>
          )}

          {/* ===== 事業・PJ割り当て（複数行按分） ===== */}
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#999]">
                事業・PJ割り当て
                {(PROJECT_TAG_REQUIRED_KAMOKU as readonly string[]).includes(form.kamoku) ? (
                  <span className="text-[#C23728] ml-1">*必須</span>
                ) : (
                  <span className="ml-1">（任意）</span>
                )}
              </label>
              {!hasAllocRows && (
                <button onClick={addAllocRow} className="flex items-center gap-1 text-[10px] text-[#D4A03A] hover:underline">
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
                    <div key={idx} className="bg-[#FAFAF8] rounded-lg p-2 space-y-1.5">
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
                          <span className="text-[10px] text-[#999]">%</span>
                        </div>
                        {txAmount > 0 && (
                          <span className="text-[10px] font-['Saira_Condensed'] tabular-nums text-[#999] flex-1 text-right">
                            ¥{Math.round(txAmount * row.percent / 100).toLocaleString()}
                          </span>
                        )}
                        <button onClick={() => removeAllocRow(idx)} className="text-[#C23728]/60 hover:text-[#C23728] p-1 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-1">
                  <button onClick={addAllocRow} className="flex items-center gap-1 text-[11px] text-[#D4A03A] hover:underline">
                    <Plus className="w-3 h-3" />行を追加
                  </button>
                  <span className={`text-[11px] font-['Saira_Condensed'] tabular-nums ${totalPercent === 100 ? 'text-[#1B4D3E]' : 'text-[#C23728]'}`}>
                    合計 {totalPercent}%
                  </span>
                </div>
              </div>
            ) : (
              <button onClick={addAllocRow} className="flex items-center gap-1 text-[11px] text-[#D4A03A] hover:underline">
                <Plus className="w-3 h-3" />事業・PJを割り当てる
              </button>
            )}
          </div>

          {error && <p className="text-xs text-[#C23728]">{error}</p>}

          {dupWarning && (
            <div className="px-4 py-3 bg-[#D4A03A]/10 rounded-xl">
              <p className="text-xs text-[#D4A03A] font-medium mb-2">⚠ 類似の経費があります</p>
              <p className="text-[11px] text-[#1a1a1a] mb-3">{dupWarning}</p>
              <div className="flex gap-2">
                <button onClick={() => { setDupConfirmed(true); setDupWarning(null); handleSave(); }}
                  className="flex-1 py-2 bg-[#D4A03A] text-white rounded-lg text-xs font-medium hover:bg-[#b8882e] transition-colors">
                  それでも登録する
                </button>
                <button onClick={() => { setDupWarning(null); }}
                  className="flex-1 py-2 bg-[#F5F5F3] text-[#999] rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors">
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
            // multiMode: 往復 + different_route or manual で復路区間あり → 3チェックボックス
            const multiMode = isTransport && isRoundTrip && td &&
              (returnMode === 'different_route' || returnMode === 'manual') &&
              td.return_legs && td.return_legs.length > 0;
            // routeOnlyMode: 経費テンプレ適用中で新規ルートを手入力した場合
            const routeOnlyMode = isTransport && !!selectedTemplate && selectedTemplate.template_type === 'transport';
            // 既存片道テンプレを往路/復路に適用中かどうか（二重保存防止）
            const outboundAlreadyLinked = !!selectedOutboundRoute;
            const returnAlreadyLinked = !!selectedReturnRoute;

            // 既定値セットアップ（モーダル初回表示時）
            const routeStr = td?.route_legs?.length > 0
              ? `${td.route_legs[0].from || ''}→${td.route_legs[td.route_legs.length - 1].to || ''}`
              : '';
            const returnRouteStr = td?.return_legs?.length > 0
              ? `${td.return_legs[0].from || ''}→${td.return_legs[td.return_legs.length - 1].to || ''}`
              : '';

            return (
              <div className="space-y-3">
                {routeOnlyMode && !multiMode ? (
                  <>
                    <p className="text-xs text-[#1a1a1a] font-medium">この区間をルートとして保存しますか？</p>
                    <p className="text-[10px] text-[#999]">逆順ペアも自動で保存されます</p>
                  </>
                ) : multiMode ? (
                  <>
                    <p className="text-xs text-[#1a1a1a] font-medium">テンプレートとして保存しますか？</p>
                    <p className="text-[10px] text-[#999]">往路・復路・往復セットから選んで保存できます</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[#1a1a1a] font-medium">テンプレートとして保存しますか？</p>
                    <p className="text-[10px] text-[#999]">次回から同じ内容をワンタップで入力できます</p>
                  </>
                )}

                {/* 経費テンプレ名入力（ルートのみモード以外） */}
                {!routeOnlyMode && (
                  <input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder={isTransport
                      ? '経費テンプレ名（例: 出張用メタ）'
                      : 'テンプレ名（例: Adobe CC）'}
                    className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
                    autoFocus
                  />
                )}

                {/* v0.14.0 Phase 4: multiMode（往復・different_route/manual）は3チェックボックス */}
                {multiMode && (
                  <div className="space-y-3 pt-2 border-t border-[#f0f0f0]">
                    {/* 往路チェックボックス — 既存テンプレ適用中は非表示 */}
                    {!outboundAlreadyLinked && (
                      <div>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={saveOutboundEnabled}
                            onChange={e => {
                              setSaveOutboundEnabled(e.target.checked);
                              if (e.target.checked && !outboundTemplateName) {
                                setOutboundTemplateName(routeStr);
                              }
                            }}
                            className="mt-0.5 w-4 h-4 accent-[#1a1a1a]"
                          />
                          <div className="flex-1">
                            <p className="text-xs text-[#1a1a1a] font-medium">往路を片道テンプレ保存</p>
                            <p className="text-[10px] text-[#999] mt-0.5">逆順ペアも自動で保存されます</p>
                          </div>
                        </label>
                        {saveOutboundEnabled && (
                          <input
                            value={outboundTemplateName}
                            onChange={e => setOutboundTemplateName(e.target.value)}
                            placeholder="往路名（例: 自宅→四ツ谷）"
                            className="w-full mt-2 px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
                          />
                        )}
                      </div>
                    )}

                    {/* 復路チェックボックス — 既存テンプレ適用中は非表示 */}
                    {!returnAlreadyLinked && (
                      <div>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={saveReturnEnabled}
                            onChange={e => {
                              setSaveReturnEnabled(e.target.checked);
                              if (e.target.checked && !returnTemplateName) {
                                setReturnTemplateName(returnRouteStr);
                              }
                            }}
                            className="mt-0.5 w-4 h-4 accent-[#1a1a1a]"
                          />
                          <div className="flex-1">
                            <p className="text-xs text-[#1a1a1a] font-medium">復路を片道テンプレ保存</p>
                            <p className="text-[10px] text-[#999] mt-0.5">逆順ペアも自動で保存されます</p>
                          </div>
                        </label>
                        {saveReturnEnabled && (
                          <input
                            value={returnTemplateName}
                            onChange={e => setReturnTemplateName(e.target.value)}
                            placeholder="復路名（例: 四ツ谷→自宅（新宿経由））"
                            className="w-full mt-2 px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
                          />
                        )}
                      </div>
                    )}

                    {/* パッケージチェックボックス — 往路・復路のIDが揃う場合のみ有効 */}
                    <div>
                      {(() => {
                        const outboundAvailable = outboundAlreadyLinked || saveOutboundEnabled;
                        const returnAvailable = returnAlreadyLinked || saveReturnEnabled;
                        const packageEnabled = outboundAvailable && returnAvailable;
                        return (
                          <>
                            <label className={`flex items-start gap-2 ${packageEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                              <input
                                type="checkbox"
                                checked={savePackageEnabled && packageEnabled}
                                disabled={!packageEnabled}
                                onChange={e => {
                                  setSavePackageEnabled(e.target.checked);
                                  if (e.target.checked && !packageTemplateName) {
                                    setPackageTemplateName(`${routeStr}（往復）`);
                                  }
                                }}
                                className="mt-0.5 w-4 h-4 accent-[#1a1a1a]"
                              />
                              <div className="flex-1">
                                <p className="text-xs text-[#1a1a1a] font-medium">この往復セットをパッケージ保存</p>
                                <p className="text-[10px] text-[#999] mt-0.5">
                                  {packageEnabled
                                    ? '次回ルート選択時に1クリックで適用できます'
                                    : '往路・復路の両方をチェックまたは選択してください'}
                                </p>
                              </div>
                            </label>
                            {savePackageEnabled && packageEnabled && (
                              <input
                                value={packageTemplateName}
                                onChange={e => setPackageTemplateName(e.target.value)}
                                placeholder="パッケージ名（例: 実家⇔自宅 往復）"
                                className="w-full mt-2 px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
                              />
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* 片道 or 往復auto_reverse モード — 従来UI（片道1個 + 自動逆順） */}
                {isTransport && !multiMode && !routeOnlyMode && (
                  <div className="pt-2 border-t border-[#f0f0f0]">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={alsoSaveRoute}
                        onChange={e => setAlsoSaveRoute(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#1a1a1a]"
                      />
                      <div className="flex-1">
                        <p className="text-xs text-[#1a1a1a] font-medium">片道テンプレとして保存</p>
                        <p className="text-[10px] text-[#999] mt-0.5">逆順ペアも自動で保存されます</p>
                      </div>
                    </label>
                    {alsoSaveRoute && (
                      <input
                        value={routeTemplateName}
                        onChange={e => setRouteTemplateName(e.target.value)}
                        placeholder="ルート名（例: 自宅→四ツ谷）"
                        className="w-full mt-2 px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
                      />
                    )}
                  </div>
                )}

                {/* ルートのみモード — ルート名のみ表示 */}
                {routeOnlyMode && !multiMode && (
                  <input
                    value={routeTemplateName}
                    onChange={e => setRouteTemplateName(e.target.value)}
                    placeholder="ルート名（例: 自宅→四ツ谷）"
                    className="w-full px-3 py-2.5 text-sm border border-[#e8e8e8] rounded-xl focus:outline-none focus:border-[#1a1a1a] transition-colors"
                    autoFocus
                  />
                )}

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
                    className="flex-1 py-2.5 text-xs text-[#999] bg-[#F5F5F3] rounded-xl hover:bg-gray-200 transition-colors">
                    スキップ
                  </button>
                  <button onClick={saveAsTemplate}
                    disabled={(() => {
                      if (multiMode) {
                        // multiMode: 少なくとも1つのチェックがONで、対応する名前が入力されている必要あり
                        const outboundValid = !saveOutboundEnabled || outboundTemplateName.trim().length > 0;
                        const returnValid = !saveReturnEnabled || returnTemplateName.trim().length > 0;
                        const packageValid = !savePackageEnabled || packageTemplateName.trim().length > 0;
                        const anyChecked = saveOutboundEnabled || saveReturnEnabled || savePackageEnabled || templateName.trim().length > 0;
                        return !anyChecked || !outboundValid || !returnValid || !packageValid;
                      }
                      if (routeOnlyMode) {
                        return !routeTemplateName.trim();
                      }
                      // 通常モード: 経費テンプレ名必須、alsoSaveRoute時はルート名も必須
                      return !templateName.trim() || (alsoSaveRoute && !routeTemplateName.trim());
                    })()}
                    className="flex-1 py-2.5 text-xs text-white bg-[#1a1a1a] rounded-xl hover:bg-[#333] disabled:opacity-40 transition-colors">
                    保存する
                  </button>
                </div>
              </div>
            );
          })() : (
            <button onClick={handleSave} disabled={saving || !form.amount || !form.date}
              className="w-full py-3 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2">
              {saving ? (<><Loader2 className="w-4 h-4 animate-spin" />保存中...</>) : editData ? '更新する' : '登録する'}
            </button>
          )}
        </div>
      </div>

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
