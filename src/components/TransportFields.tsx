'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── 定数 ──────────────────────────────────────────────
const TRANSPORT_METHODS = [
  '電車', '新幹線', 'バス', 'タクシー', '飛行機', 'レンタカー', '自家用車', 'フェリー',
];

const CLASSES = [
  '普通席', 'エコノミー', 'ビジネス', 'ファースト', 'グリーン', '指定席', '自由席',
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
export interface RouteLeg {
  from: string;
  to: string;
  method: string;
  carrier: string;
  amount: number;
  green: boolean;
}

export interface TransportData {
  purpose: string;
  route_legs: RouteLeg[];
  round_trip: string;
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
  class_value: '普通席',
  class_reason: '',
  companion: '',
  flight_train_no: '',
  route_note: '',
};

// ── Props ──────────────────────────────────────────────
interface TransportFieldsProps {
  data: TransportData;
  onChange: (data: TransportData) => void;
  onAmountChange?: (total: number) => void;
}

// スマホ最適化: 16px以上でiOSのズーム防止、タッチターゲット44px以上
const inputClass = "w-full px-3 py-2.5 bg-[#F5F5F3] rounded-lg text-[16px] sm:text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50";

// ── コンポーネント ──────────────────────────────────────────
export default function TransportFields({ data, onChange, onAmountChange }: TransportFieldsProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [purposes, setPurposes] = useState<{ id: string; name: string }[]>(DEFAULT_PURPOSES);

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

  // 合計金額を親に通知
  const prevTotalRef = useRef<number>(0);
  useEffect(() => {
    const total = data.route_legs.reduce((s, l) => s + (l.amount || 0), 0);
    if (total !== prevTotalRef.current) {
      prevTotalRef.current = total;
      onAmountChange?.(total);
    }
  }, [data.route_legs, onAmountChange]);

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

  const total = data.route_legs.reduce((s, l) => s + (l.amount || 0), 0);
  const routePreview = data.route_legs.length > 0
    ? [data.route_legs[0].from, ...data.route_legs.map(l => l.to)].filter(Boolean).join(' → ')
    : '';

  const isUpperClass = data.class_value !== '普通席' && data.class_value !== '自由席' && data.class_value !== '';

  return (
    <div className="border border-[#D4A03A]/30 rounded-xl p-4 space-y-3 bg-[#D4A03A]/5">
      <p className="text-xs font-medium text-[#D4A03A]">交通費詳細</p>

      {/* 注意書き */}
      <div className="text-[11px] text-[#888] leading-relaxed space-y-2 border-l-2 border-[#D4A03A]/30 pl-3">
        <div>
          <p className="font-medium text-[#666]">電車・バス</p>
          <p className="mt-0.5">出発地と最終目的地だけ入力。乗り継ぎはメモ欄に記載してください。</p>
          <p className="text-[10px] text-[#aaa] mt-0.5">※ 不安な場合は「区間追加」で経由地も登録できます。</p>
        </div>
        <div>
          <p className="font-medium text-[#666]">タクシー・飛行機</p>
          <p className="mt-0.5">領収書ごとに1件ずつ登録してください。</p>
          <p className="text-[10px] text-[#aaa] mt-0.5">※ 区間追加には対応していません。</p>
        </div>
      </div>

      {/* 目的（トランザクション単位） */}
      <div>
        <label className="text-xs text-[#999] block mb-1">目的</label>
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

      {/* 区間リスト */}
      {data.route_legs.map((leg, idx) => (
        <div key={idx} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#999] font-medium tracking-wide">区間 {idx + 1}</span>
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
                className={`${inputClass} ${idx > 0 ? 'bg-[#EDEDEB] text-[#999]' : ''}`}
                placeholder="出発地"
                readOnly={idx > 0}
              />
            </div>
            <span className="text-xs text-[#999] shrink-0">→</span>
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
                className={`relative w-9 h-5 rounded-full transition-colors ${leg.green ? 'bg-[#1B4D3E]' : 'bg-[#DDD]'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${leg.green ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-[#555]">グリーン車</span>
            </label>
          )}
        </div>
      ))}

      {/* 区間追加 */}
      <button
        type="button"
        onClick={addLeg}
        className="flex items-center gap-1.5 text-sm text-[#D4A03A] hover:text-[#B8862D] transition-colors py-1"
      >
        <Plus className="w-4 h-4" />
        区間を追加
      </button>

      {/* ルートプレビュー + 合計 */}
      {routePreview && (
        <div className="bg-white/60 rounded-lg px-3 py-2.5 space-y-1">
          <p className="text-xs text-[#999]">{routePreview}</p>
          <p className="text-base font-medium font-['Saira_Condensed'] tabular-nums text-[#1a1a1a]">
            合計 ¥{total.toLocaleString()}
          </p>
          {total >= 30000 && (
            <p className="text-[11px] text-[#E07A3A]">
              3万円以上の交通費は領収書の保管が推奨されます
            </p>
          )}
        </div>
      )}

      {/* 詳細トグル */}
      <button
        type="button"
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-1.5 text-sm text-[#999] hover:text-[#6b6b6b] transition-colors py-1"
      >
        {showDetail ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        詳細を追加
      </button>

      {showDetail && (
        <div className="space-y-3 pt-1">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[#999] block mb-1">座席クラス</label>
              <select
                value={data.class_value}
                onChange={(e) => setField('class_value', e.target.value)}
                className={inputClass}
              >
                {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#999] block mb-1">片道/往復</label>
              <select
                value={data.round_trip}
                onChange={(e) => setField('round_trip', e.target.value)}
                className={inputClass}
              >
                <option value="one_way">片道</option>
                <option value="round_trip">往復</option>
              </select>
            </div>
          </div>

          {isUpperClass && (
            <div>
              <label className="text-xs text-[#999] block mb-1">上位クラス理由</label>
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
            <label className="text-xs text-[#999] block mb-1">同行者</label>
            <input
              type="text"
              value={data.companion}
              onChange={(e) => setField('companion', e.target.value)}
              className={inputClass}
              placeholder="任意"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">便名・列車名</label>
            <input
              type="text"
              value={data.flight_train_no}
              onChange={(e) => setField('flight_train_no', e.target.value)}
              className={inputClass}
              placeholder="JAL601 / のぞみ15号"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">経路メモ</label>
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
