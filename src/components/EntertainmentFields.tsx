'use client';

const RELATIONSHIPS = [
  '取引先', '見込客', '協力会社', '同業者', 'その他',
];

const PURPOSES = [
  '打合せ', '接待', '会食', '手土産・贈答', 'その他',
];

export interface EntertainmentData {
  guest_name: string;
  guest_company: string;
  guest_count: string;
  relationship: string;
  purpose: string;
}

export const EMPTY_ENTERTAINMENT: EntertainmentData = {
  guest_name: '',
  guest_company: '',
  guest_count: '',
  relationship: '取引先',
  purpose: '打合せ',
};

interface EntertainmentFieldsProps {
  data: EntertainmentData;
  onChange: (data: EntertainmentData) => void;
}

const inputClass = "w-full px-3 py-2 bg-[#F5F5F3] rounded-lg text-sm border-0 outline-none focus:ring-2 focus:ring-[#D4A03A]/50";

export default function EntertainmentFields({ data, onChange }: EntertainmentFieldsProps) {
  const set = (key: keyof EntertainmentData, value: string) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="border border-[#D4A03A]/30 rounded-xl p-4 space-y-3 bg-[#D4A03A]/5">
      <p className="text-xs font-medium text-[#D4A03A]">接待交際費詳細</p>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-[#999] block mb-1">相手先名</label>
          <input
            type="text"
            value={data.guest_name}
            onChange={(e) => set('guest_name', e.target.value)}
            className={inputClass}
            placeholder="山田太郎"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#999] block mb-1">会社・所属</label>
          <input
            type="text"
            value={data.guest_company}
            onChange={(e) => set('guest_company', e.target.value)}
            className={inputClass}
            placeholder="長崎市DMO"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="w-20">
          <label className="text-xs text-[#999] block mb-1">人数</label>
          <input
            type="text"
            inputMode="numeric"
            value={data.guest_count}
            onChange={(e) => {
              if (/^\d*$/.test(e.target.value)) set('guest_count', e.target.value);
            }}
            className={inputClass}
            placeholder="3"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-[#999] block mb-1">関係性</label>
          <select
            value={data.relationship}
            onChange={(e) => set('relationship', e.target.value)}
            className={inputClass}
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>{r}</option>
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
    </div>
  );
}
