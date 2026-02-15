'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { USERS, COLORS } from '@/lib/constants';

interface HeaderProps {
  currentUser: string;
  onUserChange: (user: string) => void;
}

const NAV_ITEMS = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/transactions', label: '取引' },
  { href: '/projects', label: 'プロジェクト' },
  { href: '/journal', label: '仕訳帳' },
  { href: '/report', label: '確定申告' },
  { href: '/assets', label: '資産' },
  { href: '/anbun', label: '按分' },
  { href: '/settings', label: '設定' },
];

export default function Header({ currentUser, onUserChange }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white border-b" style={{ borderColor: COLORS.border }}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* ロゴ */}
          <Link href="/" className="font-logo text-lg tracking-wide" style={{ color: COLORS.green }}>
            komu10
          </Link>

          {/* ナビゲーション */}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 text-sm rounded-md transition-colors"
                  style={{
                    color: isActive ? COLORS.green : COLORS.textSecondary,
                    background: isActive ? 'rgba(27,77,62,0.08)' : 'transparent',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* ユーザー切り替え */}
          <div className="flex items-center gap-2">
            {USERS.map(user => (
              <button
                key={user.key}
                onClick={() => onUserChange(user.key)}
                className="px-3 py-1.5 text-sm rounded-full transition-all"
                style={{
                  background: currentUser === user.key ? COLORS.green : 'transparent',
                  color: currentUser === user.key ? 'white' : COLORS.textSecondary,
                  border: `1px solid ${currentUser === user.key ? COLORS.green : COLORS.border}`,
                }}
              >
                {user.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
