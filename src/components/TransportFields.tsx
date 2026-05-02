'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
// v0.15.8: RouteLeg型を database.ts に一本化、こちらからimport
import type { RouteLeg } from '@/types/database';
export type { RouteLeg };

// ── 定数 ──────────────────────────────────────────────
const TRANSPORT_METHODS = [
  '電車', '新幹線', 'バス', 'タクシー', '飛行機', 'レンタカー', '自家用車', 'フェリー',
];

const CLASSES = [
  '普通席', 'エコノミー', 'プレミアムエコノミー', 'ビジネス', 'ファースト',
  'グリーン', 'クラスJ', '指定席', '自由席',
];

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
  method: '電車',
  carrier: '',
  amount: 0,
  green: false,
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
  class_value: '普通席',
  class_reason: '',
  companion: '',
  flight_train_no: '',
  route_note: '',
};

// v0.14.0: 往路 legs を復路用に逆順化するヘルパー
// 配列順を反転し、各 leg の from/to を swap
// method/carrier/amount/green は保持（逆方向でも同じ路線・金額のケースが多いため）
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
  const [purposes, setPurposes] = useState<{ id: string; name: string }[]>(DEFAULT_PURPOSES);
  const isTemplate = mode === 'template';

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

  // 合計金額を親に通知（往復対応）
  // v0.14.0: return_mode ベースに更新、既存データ互換のため same_route/same_amount もフォールバック
  const prevTotalRef = useRef<number>(0);
  useEffect(() => {
    const oneWayTotal = data.route_legs.reduce((s, l) => s + (l.amount || 0), 0);
    let total = oneWayTotal;
    if (data.round_trip === 'round_trip') {
      // return_mode が未設定なら same_route/same_amount から推定（既存データ互換）
      const mode = data.return_mode ?? (data.same_route ? (data.same_amount ? 'auto_reverse' : 'auto_reverse') : 'different_route');
      if (mode === 'auto_reverse') {
        // 往路の逆順 = 同ルート・同額
        total = oneWayTotal * 2;
      } else {
        // different_route / manual = return_legs の合計
        const returnTotal = data.return_legs.reduce((s, l) => s + (l.amount || 0), 0);
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

  const oneWayTotal = data.route_legs.reduce((s, l) => s + (l.amount || 0), 0);
  const returnTotal = data.round_trip === 'round_trip'
    ? data.same_amount
      ? oneWayTotal
      : data.same_route
        ? (data.return_amount || 0)
        : data.return_legs.reduce((s, l) => s + (l.amount || 0), 0)
    : 0;
  const total = data.round_trip === 'round_trip' ? oneWayTotal + returnTotal : oneWayTotal;

  const routePreview = data.route_legs.length > 0
    ? [data.route_legs[0].from, ...data.route_legs.map(l => l.to)].filter(Boolean).join(' → ')
    : '';

  const isUpperClass = data.class_value !== '普通席' && data.class_value !== '自由席' && data.class_value !== 'クラスJ' && data.class_value !== '';

  return (
    <div className="border border-app-gold/30 rounded-xl p-4 space-y-3 bg-app-gold/5">
      <p className="text-xs font-medium text-app-gold">{isTemplate ? '交通費テンプレート' : '交通費詳細'}</p>

      {/* 注意書き（v0.15.6: 1目的地=1件の原則準拠に再構成） */}
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
          <p className="text-[11px] text-app-text-sub">電車・バス・近距離の鉄道は領収書なしでOK。</p>
          <p className="text-[11px] text-app-text-sub">新幹線・特急は領収書を取得可能な場合は添付してください（3万円以上は必須）。</p>
          <p className="text-[11px] text-app-text-sub">タクシーは領収書必須。</p>
          <p className="text-[11px] text-app-text-sub">飛行機は購入時の領収書(eチケット)を添付してください。</p>
        </div>
        <div className="space-y-1">
          <p className="text-[12px] font-semibold text-app-gold">区間や座席クラスの入力</p>
          <p className="text-[11px] text-app-text-sub">新幹線・特急・飛行機など座席クラスがある手段は、区間ごとに手段・運賃・グリーン/普通席を入力してください。</p>
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
      {data.route_legs.map((leg, idx) => (
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

          {/* 交通手段・利用会社・金額 — スマホでは2行に分割 */}
          <div className="flex gap-2">
            <div className="w-[100px] shrink-0">
              <select
                value={leg.method}
                onChange={(e) => updateLeg(idx, 'method', e.target.value)}
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
                placeholder="利用会社"
              />
            </div>
          </div>
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
              placeholder="¥ 金額"
            />
          </div>

          {/* グリーン車トグル */}
          {(leg.method === '新幹線' || leg.method === '電車') && (
            <label className="flex items-center gap-2.5 cursor-pointer py-1">
              <div
                onClick={() => updateLeg(idx, 'green', !leg.green)}
                className={`relative w-9 h-5 rounded-full transition-colors ${leg.green ? 'bg-app-green' : 'bg-app-text-ghost'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${leg.green ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-app-text-sub">グリーン車</span>
            </label>
          )}
        </div>
      ))}

      {/* 区間追加 */}
      <button
        type="button"
        onClick={addLeg}
        className="flex items-center gap-1.5 text-sm text-app-gold hover:text-app-gold-hover transition-colors py-1"
      >
        <Plus className="w-4 h-4" />
        区間を追加
      </button>

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

                    {/* グリーン車トグル(往路と同等) */}
                    {(leg.method === '新幹線' || leg.method === '電車') && (
                      <label className="flex items-center gap-2.5 cursor-pointer py-1">
                        <div
                          onClick={() => updateReturnLeg(idx, 'green', !leg.green)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${leg.green ? 'bg-app-green' : 'bg-app-text-ghost'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${leg.green ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                        <span className="text-sm text-app-text-sub">グリーン車</span>
                      </label>
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
                    {leg.method && leg.method !== '電車' && ` (${leg.method})`}
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

      {/* 詳細トグル */}
      {!isTemplate && (
      <button
        type="button"
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-1.5 text-sm text-app-text-mute hover:text-app-text-sub transition-colors py-1"
      >
        {showDetail ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        詳細を追加
      </button>
      )}

      {!isTemplate && showDetail && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs text-app-text-mute block mb-1">座席クラス</label>
            <select
              value={data.class_value}
              onChange={(e) => setField('class_value', e.target.value)}
              className={inputClass}
            >
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {isUpperClass && (
            <div>
              <label className="text-xs text-app-text-mute block mb-1">上位クラス理由</label>
              <select
                value={data.class_reason}
                onChange={(e) => setField('class_reason', e.target.value)}
                className={inputClass}
              >
                <option value="">選択してください</option>
                {CLASS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-app-text-mute block mb-1">同行者</label>
            <input
              type="text"
              value={data.companion}
              onChange={(e) => setField('companion', e.target.value)}
              className={inputClass}
              placeholder="任意"
            />
          </div>

          <div>
            <label className="text-xs text-app-text-mute block mb-1">便名・列車名</label>
            <input
              type="text"
              value={data.flight_train_no}
              onChange={(e) => setField('flight_train_no', e.target.value)}
              className={inputClass}
              placeholder="JAL601 / のぞみ15号"
            />
          </div>

          <div>
            <label className="text-xs text-app-text-mute block mb-1">経路メモ</label>
            <input
              type="text"
              value={data.route_note}
              onChange={(e) => setField('route_note', e.target.value)}
              className={inputClass}
              placeholder="任意"
            />
          </div>
        </div>
      )}
    </div>
  );
}
