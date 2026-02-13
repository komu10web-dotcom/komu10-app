import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';
import { KAMOKU } from '@/lib/constants';
import type { AnbunSetting } from '@/lib/types';

async function getAnbunSettings(owner: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('anbun_settings')
    .select('*')
    .eq('owner', owner);

  if (error) {
    console.error('Error fetching anbun settings:', error);
    return [];
  }
  return data || [];
}

export default async function AnbunPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const settings = await getAnbunSettings(currentUser);

  // 按分対象科目
  const anbunKamoku = KAMOKU.filter((k) => k.anbun);

  // 設定をマップ化
  const settingsMap: Record<string, AnbunSetting> = {};
  settings.forEach((s: AnbunSetting) => {
    settingsMap[s.kamoku] = s;
  });

  return (
    <div className="pt-14 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold font-mincho">按分設定</h2>
      </div>

      <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200">
        <h3 className="text-sm font-medium text-yellow-800 mb-2">💡 按分とは</h3>
        <p className="text-sm text-yellow-700">
          自宅を事業でも使用している場合、家賃や光熱費などを事業使用割合に応じて経費計上できます。
          例えば、60㎡の住居のうち15㎡を仕事部屋として使用している場合、25%を経費にできます。
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">科目</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">事業使用割合</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">根拠メモ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {anbunKamoku.map((kamoku) => {
              const setting = settingsMap[kamoku.id];
              const ratio = setting?.ratio ?? 100;
              
              return (
                <tr key={kamoku.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <span className="flex items-center gap-2">
                      <span>{kamoku.icon}</span>
                      <span className="font-medium">{kamoku.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={ratio}
                        readOnly
                        className="w-32"
                      />
                      <span className="w-12 text-center font-saira font-medium text-k10-gold">
                        {ratio}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-500">
                    {setting?.note || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        ※ 按分設定の編集機能は Phase 2 で実装予定
      </p>
    </div>
  );
}
