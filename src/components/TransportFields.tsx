'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
// v0.15.8: RouteLeg型を database.ts に一本化、こちらからimport
import type { RouteLeg } from '@/types/database';
export type { RouteLeg };

// ── 定数 ──────────────────────────────────────────────
// v0.30.0: 手段の刷新 — 「電車」を「普通電車/特急/新幹線」の3分割。観光列車は除外(取材費等へ誘導)
const TRANSPORT_METHODS = [
  '普通電車', '特急', '新幹線', 'バス', 'タクシー', '飛行機', 'レンタカー', '自家用車', 'フェリー',
];

// v0.30.0: 手段別の座席クラス選択肢(チップ表示用)
// 普通電車はトグル(グリーン車)で表現するためここには含めない
const CLASS_OPTIONS_BY_METHOD: Record<string, string[]> = {
  '特急':   ['自由席', '指定席', 'グリーン', '個室・プレミアム'],
  '新幹線': ['自由席', '指定席', 'グリーン', 'グランクラス'],
  '飛行機': ['普通席', 'クラスJ', 'プレエコ', 'ビジネス', 'ファースト', 'プレミアム'],
};

// v0.30.0: 上位クラス(理由必須)判定
const UPPER_CLASS_VALUES = new Set([
  'グリーン', 'グランクラス', '個室・プレミアム',
  'プレエコ', 'ビジネス', 'ファースト', 'プレミアム',
]);
const isUpperClassValue = (v: string | undefined): boolean => !!v && UPPER_CLASS_VALUES.has(v);

const CLASS_REASONS = [
  '車内業務', 'WEB会議', '機材運搬', '対面打合せ', 'クライアント同行', '長距離移動', 'その他',
];

const DEFAULT_PURPOSES = [
  { id: 'default-1', name: '商談' },
  { id: 'default-2', name: '会議・打合せ' },
  { id: 'default-3', name: '業務' },
  { id: 'default-4', name: 'ロケハン' },
  { id: 'default-5', name: '撮影・取材' },
  { id: 'default-6', name: 'セミナー・イベント' },
  { id: 'default-7', name: 'その他' },
];

// ── 型定義 ──────────────────────────────────────────────
// v0.15.8: RouteLeg は @/types/database から再エクスポート（上部で済み）

export interface TransportData {
  purpose: string;
  route_legs: RouteLeg[];
  round_trip: 'one_way' | 'round_trip';
  // v0.14.0: 復路モード3択（auto_reverse=往路の逆順 / different_route=別ルート / manual=手入力）
  // 既存 same_route / same_amount は互換用に残すが、return_mode から派生する
  return_mode?: 'auto_reverse' | 'different_route' | 'manual';
  same_route: boolean;
  same_amount: boolean;
  return_legs: RouteLeg[];
  return_amount: number;
  payment_method: string;
  class_value: string;
  class_reason: string;
  companion: string;
  flight_train_no: string;
  route_note: string;
}

export const EMPTY_LEG: RouteLeg = {
  from: '',
  to: '',
  method: '普通電車',  // v0.30.0: デフォルト手段を「電車」→「普通電車」へ
  carrier: '',
  amount: 0,
  green: false,
  // v0.30.0: 区間レベル新規フィールド
  green_amount: 0,
  class_value: '',
  class_reason: '',
  client_name: '',
  flight_train_no: '',
  passenger_count: 1,
  companion_memo: '',
};

export const EMPTY_TRANSPORT: TransportData = {
  purpose: '商談',
  route_legs: [{ ...EMPTY_LEG }],
  round_trip: 'one_way',
  return_mode: 'auto_reverse',
  same_route: true,
  same_amount: true,
  return_legs: [],
  return_amount: 0,
  payment_method: 'ic',
  // v0.30.0: 以下は後方互換のため残置(区間レベルへ移行済・新規UIでは使わない)
  class_value: '普通席',
  class_reason: '',
  companion: '',
  flight_train_no: '',
  route_note: '',
};

// v0.14.0: 往路 legs を復路用に逆順化するヘルパー
// 配列順を反転し、各 leg の from/to を swap
// method/carrier/amount/green は保持（逆方向でも同じ路線・金額のケースが多いため）
// v0.30.0: 区間レベルの新規フィールド(green_amount/class_value/...)も保持
export function reverseRouteLegs(legs: RouteLeg[]): RouteLeg[] {
  return legs
    .slice()
    .reverse()
    .map((leg) => ({
      from: leg.to,
      to: leg.from,
      method: leg.method,
      carrier: leg.carrier,
      amount: leg.amount,
      green: leg.green,
      green_amount: leg.green_amount,
      class_value: leg.class_value,
      class_reason: leg.class_reason,
      client_name: leg.client_name,
      flight_train_no: leg.flight_train_no,
      passenger_count: leg.passenger_count,
      companion_memo: leg.companion_memo,
    }));
}

// ── Props ──────────────────────────────────────────────
interface TransportFieldsProps {
  data: TransportData;
  onChange: (data: TransportData) => void;
  onAmountChange?: (total: number) => void;
  // v0.6.6: テンプレ編集時は区間リストとグリーン車トグルのみ表示
  // デフォルト 'entry' = 経費入力画面(全要素表示)
  mode?: 'entry' | 'template';
  // v0.14.0: 「別の片道テンプレを選ぶ」モード時に表示する復路テンプレセレクタ（親から注入）
  returnRouteSelector?: React.ReactNode;
  // v0.15.2: 制作費/取材費の時は「目的」プルダウンを非表示（科目+案件タグで目的は明確なため）
  hidePurpose?: boolean;
}

// スマホ最適化: 16px以上でiOSのズーム防止、タッチターゲット44px以上
const inputClass = "w-full px-3 py-2.5 bg-app-surface-alt rounded-lg text-[16px] sm:text-sm border-0 outline-none focus:ring-2 focus:ring-app-gold/50";

// ── コンポーネント ──────────────────────────────────────────
export default function TransportFields({ data, onChange, onAmountChange, mode = 'entry', returnRouteSelector, hidePurpose = false }: TransportFieldsProps) {
  const [showDetail, setShowDetail] = useState(false);
  // v0.30.0: 区間ごとの「この区間の詳細」折りたたみ状態(往路・復路別)
  const [openLegDetail, setOpenLegDetail] = useState<Record<string, boolean>>({});
  const toggleLegDetail = (key: string) => setOpenLegDetail(prev => ({ ...prev, [key]: !prev[key] }));
  // v0.30.0: 一括設定モーダル
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPassengers, setBulkPassengers] = useState<number>(1);
  const [bulkCompanion, setBulkCompanion] = useState<string>('');
  // v0.30.1: 料金検索の状態(区間キーごと)
  const [fareLoading, setFareLoading] = useState<Record<string, boolean>>({});
  const [fareMessage, setFareMessage] = useState<Record<string, string>>({});
  const [purposes, setPurposes] = useState<{ id: string; name: string }[]>(DEFAULT_PURPOSES);
  const isTemplate = mode === 'template';

  // v0.30.0: 後方互換 — 既存「電車」レコードを「普通電車」に自動マッピング
  // 旧「グリーン」class_value が新幹線・特急 leg にあれば class_value をそのまま尊重
  useEffect(() => {
    const needsMigrate = (data.route_legs || []).some(l => l.method === '電車')
      || (data.return_legs || []).some(l => l.method === '電車');
    if (!needsMigrate) return;
    const migrate = (legs: RouteLeg[]): RouteLeg[] =>
      legs.map(l => l.method === '電車' ? { ...l, method: '普通電車' } : l);
    onChange({
      ...data,
      route_legs: migrate(data.route_legs),
      return_legs: migrate(data.return_legs || []),
    });
    // 1回限りで十分なため依存配列は意図的に最小化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 目的マスタ取得
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('transport_purposes')
      .select('id, name')
      .order('sort_order')
      .then(({ data: rows }: { data: any }) => {
        if (rows && rows.length > 0) {
          setPurposes(rows as any[]);
        }
      });
  }, []);

  // v0.30.0: 区間1つの合計(本体運賃 + 普通電車のグリーン料金別入力)
  const legAmount = (l: RouteLeg): number => {
    const base = Number(l.amount) || 0;
    // 普通電車かつグリーンON時のみ green_amount を加算
    const greenAdd = (l.method === '普通電車' && l.green) ? (Number(l.green_amount) || 0) : 0;
    return base + greenAdd;
  };
  const sumLegs = (legs: RouteLeg[]): number => legs.reduce((s, l) => s + legAmount(l), 0);

  // 合計金額を親に通知（往復対応）
  // v0.14.0: return_mode ベースに更新、既存データ互換のため same_route/same_amount もフォールバック
  // v0.38.1: 飛行機/フェリー等「往復一体型」交通機関は領収書が通常往復合計のため、
  //          auto_reverse モードでも×2しない(JAL/ANA/カーフェリー等の領収書は1枚に往復合計が記載されるため)
  const prevTotalRef = useRef<number>(0);
  useEffect(() => {
    const oneWayTotal = sumLegs(data.route_legs);
    let total = oneWayTotal;
    if (data.round_trip === 'round_trip') {
      // return_mode が未設定なら same_route/same_amount から推定（既存データ互換）
      const mode = data.return_mode ?? (data.same_route ? (data.same_amount ? 'auto_reverse' : 'auto_reverse') : 'different_route');
      if (mode === 'auto_reverse') {
        // v0.38.1: 区間に飛行機・フェリーが含まれる場合は領収書がすでに往復合計のため×2しない
        const hasRoundTripBundleMethod = (data.route_legs || []).some(
          l => l.method === '飛行機' || l.method === 'フェリー'
        );
        total = hasRoundTripBundleMethod ? oneWayTotal : oneWayTotal * 2;
      } else {
        // different_route / manual = return_legs の合計
        const returnTotal = sumLegs(data.return_legs);
        total = oneWayTotal + returnTotal;
      }
    }
    if (total !== prevTotalRef.current) {
      prevTotalRef.current = total;
      onAmountChange?.(total);
    }
  }, [data.route_legs, data.round_trip, data.return_mode, data.same_amount, data.same_route, data.return_amount, data.return_legs, onAmountChange]);

  const setField = <K extends keyof TransportData>(key: K, value: TransportData[K]) => {
    onChange({ ...data, [key]: value });
  };

  // v0.30.1: 料金を調べる(普通電車・バス・新幹線・特急)
  // 区間キー(例: "out-0", "ret-1")で状態管理し、対象区間の amount を AI 概算で更新する
  const FARE_LOOKUP_METHODS = new Set(['普通電車', 'バス', '新幹線', '特急']);
  const lookupFare = async (key: string, leg: RouteLeg, applyAmount: (n: number) => void) => {
    if (!FARE_LOOKUP_METHODS.has(leg.method)) return;
    if (!leg.from?.trim() || !leg.to?.trim()) return;
    setFareLoading(prev => ({ ...prev, [key]: true }));
    setFareMessage(prev => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/transport/estimate-fare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: leg.from,
          to: leg.to,
          method: leg.method,
          carrier: leg.carrier || '',
        }),
      });
      const json = await res.json();
      if (json.amount && typeof json.amount === 'number' && json.amount > 0) {
        applyAmount(json.amount);
        setFareMessage(prev => ({ ...prev, [key]: `概算 ¥${json.amount.toLocaleString()} を入力しました。実額と異なる場合は修正してください。` }));
      } else {
        setFareMessage(prev => ({ ...prev, [key]: json.error || '料金を取得できませんでした。実額を入力してください。' }));
      }
    } catch (err) {
      console.error('lookupFare error:', err);
      setFareMessage(prev => ({ ...prev, [key]: '料金検索に失敗しました。時間をおいて再度お試しください。' }));
    } finally {
      setFareLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const updateLeg = (idx: number, field: keyof RouteLeg, value: string | number | boolean) => {
    const legs = data.route_legs.map((leg, i) => {
      if (i !== idx) return leg;
      return { ...leg, [field]: value };
    });
    if (field === 'to' && idx < legs.length - 1) {
      legs[idx + 1] = { ...legs[idx + 1], from: value as string };
    }
    onChange({ ...data, route_legs: legs });
  };

  const addLeg = () => {
    const lastLeg = data.route_legs[data.route_legs.length - 1];
    const newLeg: RouteLeg = {
      ...EMPTY_LEG,
      from: lastLeg?.to || '',
    };
    onChange({ ...data, route_legs: [...data.route_legs, newLeg] });
  };

  const removeLeg = (idx: number) => {
    if (data.route_legs.length <= 1) return;
    const legs = data.route_legs.filter((_, i) => i !== idx);
    onChange({ ...data, route_legs: legs });
  };

  // 復路用ヘルパー(往路と同等の操作を提供) — v0.6.6
  const updateReturnLeg = (idx: number, field: keyof RouteLeg, value: string | number | boolean) => {
    const legs = (data.return_legs || []).map((leg, i) => {
      if (i !== idx) return leg;
      return { ...leg, [field]: value };
    });
    if (field === 'to' && idx < legs.length - 1) {
      legs[idx + 1] = { ...legs[idx + 1], from: value as string };
    }
    onChange({ ...data, return_legs: legs });
  };

  const addReturnLeg = () => {
    const legs = data.return_legs || [];
    const lastLeg = legs[legs.length - 1];
    const newLeg: RouteLeg = {
      ...EMPTY_LEG,
      from: lastLeg?.to || '',
    };
    onChange({ ...data, return_legs: [...legs, newLeg] });
  };

  const removeReturnLeg = (idx: number) => {
    const legs = data.return_legs || [];
    if (legs.length <= 1) return;
    onChange({ ...data, return_legs: legs.filter((_, i) => i !== idx) });
  };

  const oneWayTotal = sumLegs(data.route_legs);
  // v0.38.1: 飛行機・フェリーは領収書が往復一括のため、往復モードでも合計=片道合計とする
  const hasRoundTripBundleMethod = (data.route_legs || []).some(
    l => l.method === '飛行機' || l.method === 'フェリー'
  );
  const returnTotal = data.round_trip === 'round_trip'
    ? hasRoundTripBundleMethod
      ? 0  // v0.38.1: 飛行機・フェリーの往復は片道合計がそのまま往復合計
      : data.same_amount
        ? oneWayTotal
        : data.same_route
          ? (data.return_amount || 0)
          : sumLegs(data.return_legs)
    : 0;
  const total = data.round_trip === 'round_trip' ? oneWayTotal + returnTotal : oneWayTotal;

  const routePreview = data.route_legs.length > 0
    ? [data.route_legs[0].from, ...data.route_legs.map(l => l.to)].filter(Boolean).join(' → ')
    : '';

  return (
    <div className="border border-app-gold/30 rounded-xl p-4 space-y-3 bg-app-gold/5">
      <p className="text-xs font-medium text-app-gold">{isTemplate ? '交通費テンプレート' : '交通費詳細'}</p>

      {/* 注意書き（v0.30.0: 観光列車・出演者交通費の誘導を追加） */}
      {!isTemplate && (
      <div className="leading-relaxed space-y-4 border-l-2 border-app-gold/30 pl-3">
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-app-gold">1件の単位</p>
          <p className="text-[11px] text-app-text-sub">1つの目的地への移動を1件として登録してください（往復も1件）。</p>
          <p className="text-[11px] text-app-text-sub">途中の乗り継ぎや経由は「区間を追加」で繋げていきます。</p>
          <p className="text-[11px] text-app-text-sub">領収書もまとめて添付できます。</p>
        </div>
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-app-gold">領収書</p>
          <p className="text-[11px] text-app-text-sub">普通電車・バス・近距離の鉄道は領収書なしでOK。</p>
          <p className="text-[11px] text-app-text-sub">新幹線・特急は領収書を取得可能な場合は添付してください（3万円以上は必須）。</p>
          <p className="text-[11px] text-app-text-sub">タクシーは領収書必須。</p>
          <p className="text-[11px] text-app-text-sub">飛行機は購入時の領収書（eチケット）を添付してください。</p>
        </div>
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-app-gold">区間や座席クラスの入力</p>
          <p className="text-[11px] text-app-text-sub">普通電車のグリーン車は乗車料金とは別にグリーン料金を入力。特急・新幹線・飛行機の上位クラス（グリーン・グランクラス・ビジネス等）は、区間ごとに座席を選び、業務上の利用理由を記録してください。</p>
        </div>
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-app-gold">観光列車に乗ったとき</p>
          <p className="text-[11px] text-app-text-sub">ふたつ星4047・伊予灘ものがたり・SL人吉などの観光列車は、乗車そのものが体験商品です。旅費交通費ではなく、用途に応じて取材費・広告宣伝費・研修費・調査研究費などで登録してください。</p>
          <p className="text-[11px] text-app-text-sub">ななつ星 in 九州・TRAIN SUITE 四季島・TWILIGHT EXPRESS 瑞風 などのクルーズトレインは、JR が販売する旅行プランです。旅費交通費では登録できません。</p>
        </div>
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-app-gold">出演者・社外スタッフの交通費</p>
          <p className="text-[11px] text-app-text-sub">出演者・社外スタッフの交通費は、本人または所属事務所からの請求書を受け取り、別取引（制作費・取材費 等）として登録してください。源泉徴収の対象になる場合があります。</p>
        </div>
      </div>
      )}

      {/* 目的（トランザクション単位） */}
      {/* v0.15.2: hidePurpose=true の時は非表示（制作費/取材費では科目+案件で目的が明確なため） */}
      {!isTemplate && !hidePurpose && (
      <div>
        <label className="text-xs text-app-text-mute block mb-1">目的</label>
        <select
          value={data.purpose}
          onChange={(e) => setField('purpose', e.target.value)}
          className={inputClass}
        >
          {purposes.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      )}

      {/* 区間リスト */}
      {data.route_legs.map((leg, idx) => {
        const classOptions = CLASS_OPTIONS_BY_METHOD[leg.method] || [];
        const showClassChips = classOptions.length > 0;
        const upper = isUpperClassValue(leg.class_value);
        const detailKey = `out-${idx}`;
        const detailOpen = !!openLegDetail[detailKey];
        const showFlightTrainNo = leg.method === '飛行機' || leg.method === '新幹線' || leg.method === '特急';
        return (
        <div key={idx} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-app-text-mute font-medium tracking-wide">区間 {idx + 1}</span>
            {idx > 0 && (
              <button
                type="button"
                onClick={() => removeLeg(idx)}
                className="p-1.5 hover:bg-red-50 rounded-full transition-colors"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>

          {/* 出発地 → 到着地 */}
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <input
                type="text"
                value={leg.from}
                onChange={(e) => updateLeg(idx, 'from', e.target.value)}
                className={`${inputClass} ${idx > 0 ? 'bg-app-surface-hover text-app-text-mute' : ''}`}
                placeholder="出発地"
                readOnly={idx > 0}
              />
            </div>
            <span className="text-xs text-app-text-mute shrink-0">→</span>
            <div className="flex-1">
              <input
                type="text"
                value={leg.to}
                onChange={(e) => updateLeg(idx, 'to', e.target.value)}
                className={inputClass}
                placeholder="到着地"
              />
            </div>
          </div>

          {/* 交通手段・利用会社 */}
          <div className="flex gap-2">
            <div className="w-[120px] shrink-0">
              <select
                value={leg.method}
                onChange={(e) => {
                  // 手段が変わったら座席クラスはリセット
                  const legs = data.route_legs.map((l, i) => {
                    if (i !== idx) return l;
                    return { ...l, method: e.target.value, class_value: '', class_reason: '', client_name: '' };
                  });
                  if (idx < legs.length - 1) {
                    // from の連動は不要(method 変更のみ)
                  }
                  onChange({ ...data, route_legs: legs });
                }}
                className={inputClass}
              >
                {TRANSPORT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={leg.carrier}
                onChange={(e) => updateLeg(idx, 'carrier', e.target.value)}
                className={inputClass}
                placeholder={leg.method === '飛行機' ? '航空会社' : '利用会社'}
              />
            </div>
          </div>

          {/* 金額 */}
          <div>
            <input
              type="text"
              inputMode="numeric"
              value={leg.amount ? `¥${leg.amount.toLocaleString()}` : ''}
              onChange={(e) => {
                const v = e.target.value.replace(/[¥,]/g, '');
                if (/^\d*$/.test(v)) updateLeg(idx, 'amount', parseInt(v) || 0);
              }}
              className={`${inputClass} font-['Saira_Condensed'] tabular-nums`}
              placeholder={leg.method === '普通電車' ? '¥ 乗車料金' : '¥ 金額（特急・座席込み）'}
            />
            {/* v0.30.1: 料金を調べる(普通電車・バス・新幹線・特急のみ) */}
            {!isTemplate && FARE_LOOKUP_METHODS.has(leg.method) && (() => {
              const key = `out-${idx}`;
              const canLookup = !!leg.from?.trim() && !!leg.to?.trim() && !fareLoading[key];
              return (
                <div className="mt-2 space-y-1">
                  <button
                    type="button"
                    disabled={!canLookup}
                    onClick={() => lookupFare(key, leg, (n) => updateLeg(idx, 'amount', n))}
                    className="text-xs text-app-gold hover:text-app-gold-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors py-0.5"
                  >
                    {fareLoading[key] ? '料金を調べています...' : '料金を調べる'}
                  </button>
                  {!fareMessage[key] && (
                    <p className="text-[10px] text-app-text-mute leading-relaxed">
                      普通電車・バス・新幹線・特急の通常料金を調べます。<br />
                      座席指定や繁忙期の追加料金は含まれません。飛行機・タクシーは対象外です。<br />
                      実際に支払った金額と異なる場合は修正してください。
                    </p>
                  )}
                  {fareMessage[key] && (
                    <p className="text-[10px] text-app-text-sub">{fareMessage[key]}</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* v0.30.0: 普通電車のグリーン車トグル + ON時にグリーン料金別欄
              v0.30.3: 過去合意「class_reasonはグリーン以上で必須」の復元 — 普通電車のグリーンON時にも業務理由欄を表示 */}
          {leg.method === '普通電車' && (
            <>
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <div
                  onClick={() => updateLeg(idx, 'green', !leg.green)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${leg.green ? 'bg-app-green' : 'bg-app-text-ghost'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${leg.green ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-app-text-sub">グリーン車</span>
              </label>
              {leg.green && (
                <>
                  <div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={leg.green_amount ? `¥${(leg.green_amount).toLocaleString()}` : ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[¥,]/g, '');
                        if (/^\d*$/.test(v)) updateLeg(idx, 'green_amount', parseInt(v) || 0);
                      }}
                      className={`${inputClass} font-['Saira_Condensed'] tabular-nums`}
                      placeholder="¥ グリーン料金"
                    />
                    <p className="text-[10px] text-app-text-mute mt-1">乗車料金とは別にグリーン券の料金を入力してください。</p>
                  </div>
                  {/* v0.30.3: 業務上の利用理由(過去session合意の復元) */}
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="text-[10px] text-app-text-mute block mb-1">業務上の利用理由</label>
                      <select
                        value={leg.class_reason || ''}
                        onChange={(e) => updateLeg(idx, 'class_reason', e.target.value)}
                        className={inputClass}
                      >
                        <option value="">選択してください</option>
                        {CLASS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    {leg.class_reason === 'クライアント同行' && (
                      <div>
                        <label className="text-[10px] text-app-text-mute block mb-1">同行したクライアント</label>
                        <input
                          type="text"
                          value={leg.client_name || ''}
                          onChange={(e) => updateLeg(idx, 'client_name', e.target.value)}
                          className={inputClass}
                          placeholder="例:◯◯商事 田中様"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* v0.30.0: 座席クラスのチップ選択(特急・新幹線・飛行機) */}
          {showClassChips && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {classOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateLeg(idx, 'class_value', c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      leg.class_value === c
                        ? 'bg-app-button text-white'
                        : 'bg-app-surface-alt text-app-text-mute hover:text-app-text-sub'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {leg.method === '特急' && (
                <p className="text-[10px] text-app-text-mute">個室・プレミアム = 東武スペーシアX（コックピットスイート）／サフィール踊り子（プレミアムグリーン）／近鉄しまかぜ（プレミアム・個室）など。</p>
              )}
              {/* 上位クラス選択時の理由 */}
              {upper && (
                <div className="space-y-2 pt-1">
                  <div>
                    <label className="text-[10px] text-app-text-mute block mb-1">業務上の利用理由</label>
                    <select
                      value={leg.class_reason || ''}
                      onChange={(e) => updateLeg(idx, 'class_reason', e.target.value)}
                      className={inputClass}
                    >
                      <option value="">選択してください</option>
                      {CLASS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {leg.class_reason === 'クライアント同行' && (
                    <div>
                      <label className="text-[10px] text-app-text-mute block mb-1">同行したクライアント</label>
                      <input
                        type="text"
                        value={leg.client_name || ''}
                        onChange={(e) => updateLeg(idx, 'client_name', e.target.value)}
                        className={inputClass}
                        placeholder="例：◯◯商事 田中様"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* v0.30.0: この区間の詳細(便名・人数・同行者メモ)折りたたみ */}
          <button
            type="button"
            onClick={() => toggleLegDetail(detailKey)}
            className="flex items-center gap-1.5 text-xs text-app-text-mute hover:text-app-text-sub transition-colors py-1"
          >
            {detailOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            この区間の詳細
          </button>
          {detailOpen && (
            <div className="space-y-2 pl-4 border-l-2 border-app-gold/20">
              {/* 人数(自分含む) */}
              <div>
                <label className="text-[10px] text-app-text-mute block mb-1">この区間の人数（自分含む）</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateLeg(idx, 'passenger_count', n)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        (leg.passenger_count || 1) === n
                          ? 'bg-app-button text-white'
                          : 'bg-app-surface-alt text-app-text-mute hover:text-app-text-sub'
                      }`}
                    >
                      {n}人
                    </button>
                  ))}
                  <input
                    type="number"
                    min={4}
                    inputMode="numeric"
                    value={(leg.passenger_count || 1) >= 4 ? leg.passenger_count : ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 0;
                      if (v >= 4) updateLeg(idx, 'passenger_count', v);
                    }}
                    placeholder="4+"
                    className={`${inputClass} max-w-[80px] tabular-nums`}
                  />
                </div>
                <p className="text-[10px] text-app-text-mute mt-1">この区間に同乗した人数（支払い対象の合計人数）。</p>
              </div>
              {/* 同行者メモ */}
              <div>
                <label className="text-[10px] text-app-text-mute block mb-1">同行者メモ（任意）</label>
                <input
                  type="text"
                  value={leg.companion_memo || ''}
                  onChange={(e) => updateLeg(idx, 'companion_memo', e.target.value)}
                  className={inputClass}
                  placeholder="例：トシキ／空港から合流"
                />
              </div>
              {/* 便名・列車名 */}
              {showFlightTrainNo && (
                <div>
                  <label className="text-[10px] text-app-text-mute block mb-1">便名・列車名</label>
                  <input
                    type="text"
                    value={leg.flight_train_no || ''}
                    onChange={(e) => updateLeg(idx, 'flight_train_no', e.target.value)}
                    className={inputClass}
                    placeholder={leg.method === '飛行機' ? 'JAL301' : 'のぞみ15号'}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        );
      })}

      {/* 区間追加 */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          type="button"
          onClick={addLeg}
          className="flex items-center gap-1.5 text-sm text-app-gold hover:text-app-gold-hover transition-colors py-1"
        >
          <Plus className="w-4 h-4" />
          区間を追加
        </button>
        {!isTemplate && data.route_legs.length >= 1 && (
          <button
            type="button"
            onClick={() => {
              // モーダルを開く時、既存の最初の区間値を初期値にセット
              const first = data.route_legs[0];
              setBulkPassengers(first?.passenger_count || 1);
              setBulkCompanion(first?.companion_memo || '');
              setBulkOpen(true);
            }}
            className="text-xs text-app-text-mute hover:text-app-text-sub transition-colors py-1 underline-offset-2 hover:underline"
          >
            全区間に人数・同行者をまとめて入力
          </button>
        )}
      </div>

      {/* ⑥ 片道/往復 */}
      {!isTemplate && (
      <div>
        <label className="text-xs text-app-text-mute block mb-1">片道 / 往復</label>
        <div className="flex gap-2">
          {(['one_way', 'round_trip'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                const updated: Partial<TransportData> = { round_trip: v };
                if (v === 'one_way') {
                  updated.return_mode = 'auto_reverse';
                  updated.same_route = true;
                  updated.same_amount = true;
                  updated.return_legs = [];
                  updated.return_amount = 0;
                }
                onChange({ ...data, ...updated });
              }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                data.round_trip === v
                  ? 'bg-app-button text-white'
                  : 'bg-app-surface-alt text-app-text-mute hover:text-app-text-sub'
              }`}
            >
              {v === 'one_way' ? '片道' : '往復'}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* ⑧ 往復の場合の分岐 — v0.14.0: 3択ラジオ化 */}
      {!isTemplate && data.round_trip === 'round_trip' && (() => {
        // return_mode が未設定の既存データは same_route/same_amount から推定
        const mode: 'auto_reverse' | 'different_route' | 'manual' =
          data.return_mode ?? (data.same_route ? 'auto_reverse' : 'different_route');
        const setMode = (nextMode: 'auto_reverse' | 'different_route' | 'manual') => {
          if (nextMode === 'auto_reverse') {
            // 往路の逆順モード — return_legs はクリア（保存時に動的逆順化）
            onChange({
              ...data,
              return_mode: 'auto_reverse',
              same_route: true,
              same_amount: true,
              return_legs: [],
              return_amount: 0,
            });
          } else if (nextMode === 'different_route') {
            // 別の片道テンプレを選ぶモード — 親から注入されるセレクタで選択
            // ここでは return_legs は空のまま（セレクト選択時に親が埋める）
            onChange({
              ...data,
              return_mode: 'different_route',
              same_route: false,
              same_amount: false,
              return_legs: [],
            });
          } else {
            // 手入力モード — 空の leg を1つ用意
            const initialReturnLeg: RouteLeg = {
              ...EMPTY_LEG,
              from: data.route_legs[data.route_legs.length - 1]?.to || '',
              to: data.route_legs[0]?.from || '',
            };
            onChange({
              ...data,
              return_mode: 'manual',
              same_route: false,
              same_amount: false,
              return_legs: [initialReturnLeg],
            });
          }
        };
        return (
          <div className="rounded-xl border-2 border-app-gold/50 bg-app-gold/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-app-text">帰りのルート</p>

            {/* 3択ラジオ */}
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="return_mode"
                  checked={mode === 'auto_reverse'}
                  onChange={() => setMode('auto_reverse')}
                  className="w-4 h-4 accent-app-gold"
                />
                <span className="text-sm text-app-text">往路の逆順（自動生成）</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="return_mode"
                  checked={mode === 'different_route'}
                  onChange={() => setMode('different_route')}
                  className="w-4 h-4 accent-app-gold"
                />
                <span className="text-sm text-app-text">別の片道テンプレを選ぶ</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="return_mode"
                  checked={mode === 'manual'}
                  onChange={() => setMode('manual')}
                  className="w-4 h-4 accent-app-gold"
                />
                <span className="text-sm text-app-text">手入力</span>
              </label>
            </div>

            {/* different_route モード: 親から注入されるセレクタ */}
            {mode === 'different_route' && returnRouteSelector && (
              <div className="pt-2 border-t border-app-gold/20">
                {returnRouteSelector}
              </div>
            )}

            {/* manual モード: 区間入力UI */}
            {mode === 'manual' && (
              <div className="space-y-2 pt-2 border-t border-app-gold/20">
                <p className="text-[10px] text-app-text-mute font-medium tracking-wide">帰りの区間</p>
                {(data.return_legs || []).map((leg, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-app-text-mute font-medium tracking-wide">区間 {idx + 1}</span>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => removeReturnLeg(idx)}
                          className="p-1.5 hover:bg-red-50 rounded-full transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <input type="text" value={leg.from}
                          onChange={(e) => updateReturnLeg(idx, 'from', e.target.value)}
                          className={`${inputClass} ${idx > 0 ? 'bg-app-surface-hover text-app-text-mute' : ''}`}
                          placeholder="出発地" readOnly={idx > 0} />
                      </div>
                      <span className="text-xs text-app-text-mute shrink-0">→</span>
                      <div className="flex-1">
                        <input type="text" value={leg.to}
                          onChange={(e) => updateReturnLeg(idx, 'to', e.target.value)}
                          className={inputClass} placeholder="到着地" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-[100px] shrink-0">
                        <select value={leg.method}
                          onChange={(e) => updateReturnLeg(idx, 'method', e.target.value)}
                          className={inputClass}>
                          {TRANSPORT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <input type="text" value={leg.carrier}
                          onChange={(e) => updateReturnLeg(idx, 'carrier', e.target.value)}
                          className={inputClass} placeholder="利用会社" />
                      </div>
                    </div>
                    <input type="text" inputMode="numeric"
                      value={leg.amount ? `¥${leg.amount.toLocaleString()}` : ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[¥,]/g, '');
                        if (/^\d*$/.test(v)) updateReturnLeg(idx, 'amount', parseInt(v) || 0);
                      }}
                      className={`${inputClass} font-['Saira_Condensed'] tabular-nums`} placeholder="¥ 金額" />

                    {/* グリーン車トグル(往路と同等) — v0.30.0: 普通電車のみ */}
                    {leg.method === '普通電車' && (
                      <>
                        <label className="flex items-center gap-2.5 cursor-pointer py-1">
                          <div
                            onClick={() => updateReturnLeg(idx, 'green', !leg.green)}
                            className={`relative w-9 h-5 rounded-full transition-colors ${leg.green ? 'bg-app-green' : 'bg-app-text-ghost'}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${leg.green ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="text-sm text-app-text-sub">グリーン車</span>
                        </label>
                        {leg.green && (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={leg.green_amount ? `¥${(leg.green_amount).toLocaleString()}` : ''}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[¥,]/g, '');
                              if (/^\d*$/.test(v)) updateReturnLeg(idx, 'green_amount', parseInt(v) || 0);
                            }}
                            className={`${inputClass} font-['Saira_Condensed'] tabular-nums`}
                            placeholder="¥ グリーン料金"
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addReturnLeg}
                  className="flex items-center gap-1.5 text-sm text-app-gold hover:text-app-gold-hover transition-colors py-1"
                >
                  <Plus className="w-4 h-4" />
                  区間を追加
                </button>
              </div>
            )}

            {/* different_route モード: テンプレ選択後の legs プレビュー（編集不可） */}
            {mode === 'different_route' && data.return_legs.length > 0 && (
              <div className="pt-2 border-t border-app-gold/20 space-y-1">
                <p className="text-[10px] text-app-text-mute font-medium tracking-wide">選択中の復路区間</p>
                {data.return_legs.map((leg, idx) => (
                  <p key={idx} className="text-xs text-app-text-sub">
                    {leg.from} → {leg.to}
                    {leg.method && leg.method !== '普通電車' && ` (${leg.method})`}
                    {leg.amount > 0 && ` / ¥${leg.amount.toLocaleString()}`}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ⑩ 支払方法 */}
      {!isTemplate && (
      <div>
        <label className="text-xs text-app-text-mute block mb-1">支払方法</label>
        <select value={data.payment_method} onChange={(e) => setField('payment_method', e.target.value)}
          className={inputClass}>
          <option value="ic">IC（Suica等）</option>
          <option value="cash">現金</option>
          <option value="credit">クレジットカード</option>
          <option value="invoice">請求書払い</option>
        </select>
      </div>
      )}

      {/* ルートプレビュー + 合計 */}
      {routePreview && (
        <div className="bg-white/60 rounded-lg px-3 py-2.5 space-y-1">
          <p className="text-xs text-app-text-mute">
            {routePreview}
            {data.round_trip === 'round_trip' && ' (往復)'}
          </p>
          {data.round_trip === 'round_trip' && (data.return_mode === 'different_route' || data.return_mode === 'manual' || (!data.return_mode && !data.same_amount)) && (
            <p className="text-[10px] text-app-text-mute">
              往路 ¥{oneWayTotal.toLocaleString()} + 復路 ¥{returnTotal.toLocaleString()}
            </p>
          )}
          {/* v0.38.1: 飛行機・フェリー往復時の補足説明 */}
          {data.round_trip === 'round_trip' && hasRoundTripBundleMethod && (
            <p className="text-[10px] text-app-text-mute">
              ※ 飛行機・フェリーは領収書が往復一括金額のため、入力金額をそのまま往復合計として扱います
            </p>
          )}
          <p className="text-base font-medium font-['Saira_Condensed'] tabular-nums text-app-text">
            合計 ¥{total.toLocaleString()}
          </p>
          {!isTemplate && total >= 30000 && (
            <p className="text-[11px] text-app-warn">
              3万円以上の交通費は領収書の添付が必須です
            </p>
          )}
        </div>
      )}

      {/* v0.30.0: 全体メモ(経路メモのみ) — 座席・同行者・便名は区間レベルへ移行済 */}
      {!isTemplate && (
      <button
        type="button"
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-1.5 text-sm text-app-text-mute hover:text-app-text-sub transition-colors py-1"
      >
        {showDetail ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        取引全体のメモ
      </button>
      )}

      {!isTemplate && showDetail && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs text-app-text-mute block mb-1">経路メモ</label>
            <input
              type="text"
              value={data.route_note}
              onChange={(e) => setField('route_note', e.target.value)}
              className={inputClass}
              placeholder="例：台風で経路変更／道路工事で迂回 など"
            />
          </div>
        </div>
      )}

      {/* v0.30.0: 一括設定モーダル — 全区間に人数・同行者を一括適用 */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setBulkOpen(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-app-text">全区間に人数・同行者をまとめて入力</h3>
              <button onClick={() => setBulkOpen(false)} className="p-1 rounded hover:bg-app-surface-alt">
                <X className="w-4 h-4 text-app-text-mute" />
              </button>
            </div>
            <p className="text-[11px] text-app-text-mute mb-4">適用後も、各区間で個別に編集できます（例：空港から合流など）。</p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[10px] text-app-text-mute block mb-1.5">人数（自分含む）</label>
                <div className="flex gap-1.5 items-center">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setBulkPassengers(n)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        bulkPassengers === n
                          ? 'bg-app-button text-white'
                          : 'bg-app-surface-alt text-app-text-mute hover:text-app-text-sub'
                      }`}
                    >
                      {n}人
                    </button>
                  ))}
                  <input
                    type="number"
                    min={4}
                    inputMode="numeric"
                    value={bulkPassengers >= 4 ? bulkPassengers : ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 0;
                      if (v >= 4) setBulkPassengers(v);
                    }}
                    placeholder="4+"
                    className={`${inputClass} max-w-[80px] tabular-nums`}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-app-text-mute block mb-1.5">同行者メモ（任意）</label>
                <input
                  type="text"
                  value={bulkCompanion}
                  onChange={(e) => setBulkCompanion(e.target.value)}
                  className={inputClass}
                  placeholder="例：トシキ"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setBulkOpen(false)}
                className="flex-1 py-2.5 text-xs text-app-text-mute bg-app-surface-alt rounded-xl hover:bg-app-surface-hover transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  // 全区間(往路+復路)に一括適用
                  const applyTo = (legs: RouteLeg[]): RouteLeg[] =>
                    legs.map(l => ({ ...l, passenger_count: bulkPassengers, companion_memo: bulkCompanion }));
                  onChange({
                    ...data,
                    route_legs: applyTo(data.route_legs),
                    return_legs: applyTo(data.return_legs || []),
                  });
                  setBulkOpen(false);
                }}
                className="flex-1 py-2.5 text-xs text-white bg-app-button rounded-xl hover:bg-app-button-hover transition-colors"
              >
                全区間に適用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
