'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const TRANSPORT_TYPES = [
  '飛行機', '新幹線', '電車', 'バス', 'タクシー', 'レンタカー', '自家用車', 'フェリー',
];

const PURPOSES = [
  '撮影', '取材', '打合せ（対面）', 'ロケハン', '納品', 'イベント・登壇', 'その他',
];

const CLASSES = [
  '普通席', 'エコノミー', 'ビジネス', 'ファースト', 'グリーン', '指定席', '自由席',
];

const CLASS_REASONS = [
  '車内業務', 'WEB会議', '機材運搬', '対面打合せ', 'クライアント同行', '長距離移動', 'その他',
];

export interface TransportData {
  from_location: string;
  to_location: string;
  transport_type: string;
  purpose: string;
  carrier: string;
  class_value: string;
  class_reason: string;
  round_trip: string;
  companion: string;
  flight_train_no: string;
  route_note: string;
}

export const EMPTY_TRANSPORT: TransportData = {
  from_location: '',
  to_location: '',
  transport_type: '電車',
  purpose: '撮影',
  carrier: '',
  class_value: '普通席',
  class_reason: '',
  round_trip: 'one_way',
  companion: '',
  flight_train_no: '',
  route_note: '',
};

interface TransportFieldsProps {
  data: TransportData;
  onChange: (data: TransportData) => void;
}

const inputClass = "w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50";

export default function TransportFields({ data, onChange }: TransportFieldsProps) {
  const [showDetail, setShowDetail] = useState(false);

  const set = (key: keyof TransportData, value: string) => {
    onChange({ ...data, [key]: value });
  };

  const isUpperClass = data.class_value !== '普通席' && data.class_value !== '自由席' && data.class_value !== '';

  return (
    <div className="border border-[#D4A03A]/30 rounded-xl p-4 space-y-3 bg-[#D4A03A]/5">
      <p className="text-xs font-medium text-[#D4A03A]">交通費詳細</p>

      {/* 必須5項目 */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-[#999] block mb-1">出発地</label>
          <input
            type="text"
            value={data.from_location}
            onChange={(e) => set('from_location', e.target.value)}
            className={inputClass}
            placeholder="東京"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#999] block mb-1">到着地</label>
          <input
            type="text"
            value={data.to_location}
            onChange={(e) => set('to_location', e.target.value)}
            className={inputClass}
            placeholder="長崎"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-[#999] block mb-1">交通手段</label>
          <select
            value={data.transport_type}
            onChange={(e) => set('transport_type', e.target.value)}
            className={inputClass}
          >
            {TRANSPORT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#999] block mb-1">目的</label>
          <select
            value={data.purpose}
            onChange={(e) => set('purpose', e.target.value)}
            className={inputClass}
          >
            {PURPOSES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-[#999] block mb-1">利用会社</label>
        <input
          type="text"
          value={data.carrier}
          onChange={(e) => set('carrier', e.target.value)}
          className={inputClass}
          placeholder="JAL / JR東日本 / 東急 等"
        />
      </div>

      {/* 任意項目トグル */}
      <button
        type="button"
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-1 text-xs text-[#999] hover:text-[#6b6b6b] transition-colors"
      >
        {showDetail ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        詳細を追加
      </button>

      {showDetail && (
        <div className="space-y-3 pt-1">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[#999] block mb-1">座席クラス</label>
              <select
                value={data.class_value}
                onChange={(e) => set('class_value', e.target.value)}
                className={inputClass}
              >
                {CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#999] block mb-1">片道/往復</label>
              <select
                value={data.round_trip}
                onChange={(e) => set('round_trip', e.target.value)}
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
                onChange={(e) => set('class_reason', e.target.value)}
                className={inputClass}
              >
                <option value="">選択してください</option>
                {CLASS_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-[#999] block mb-1">同行者</label>
            <input
              type="text"
              value={data.companion}
              onChange={(e) => set('companion', e.target.value)}
              className={inputClass}
              placeholder="任意"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">便名・列車名</label>
            <input
              type="text"
              value={data.flight_train_no}
              onChange={(e) => set('flight_train_no', e.target.value)}
              className={inputClass}
              placeholder="JAL601 / のぞみ15号"
            />
          </div>

          <div>
            <label className="text-xs text-[#999] block mb-1">経路メモ</label>
            <input
              type="text"
              value={data.route_note}
              onChange={(e) => set('route_note', e.target.value)}
              className={inputClass}
              placeholder="任意"
            />
          </div>
        </div>
      )}
    </div>
  );
}
