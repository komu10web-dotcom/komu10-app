import { cookies } from 'next/headers';
import { THEMES, USERS } from '@/lib/constants';

export default function SettingsPage() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  const user = USERS.find((u) => u.id === currentUser);

  return (
    <div className="pt-14 space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold font-mincho">設定</h2>

      <div className="bg-white rounded-xl p-6 border border-gray-100 space-y-6">
        {/* ユーザー情報 */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">ユーザー</h3>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-k10-gold flex items-center justify-center text-white font-medium">
              {user?.name.charAt(0)}
            </div>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="text-sm text-gray-500">{currentUser}</p>
            </div>
          </div>
        </div>

        {/* テーマ */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">テーマ</h3>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                className="p-3 rounded-lg border border-gray-200 hover:border-k10-gold transition-colors text-left"
              >
                <div
                  className="w-full h-8 rounded mb-2"
                  style={{ backgroundColor: theme.bg }}
                />
                <p className="text-sm font-medium">{theme.label}</p>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">※ テーマ切り替えは Phase 2 で実装予定</p>
        </div>

        {/* バージョン情報 */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">バージョン</h3>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm">
              <span className="text-k10-gold font-semibold">komu</span>
              <span>10</span>
              <span className="text-gray-400 ml-2">v0.3.0</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Next.js + Supabase + Vercel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
