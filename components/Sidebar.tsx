'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'ダッシュボード', icon: '📊' },
  { href: '/transactions', label: '取引一覧', icon: '💳' },
  { href: '/transactions/new', label: '取引追加', icon: '➕' },
  { href: '/projects', label: 'プロジェクト', icon: '📁' },
  { href: '/journal', label: '仕訳帳', icon: '📒' },
  { href: '/report', label: '申告レポート', icon: '📋' },
  { href: '/assets', label: '固定資産', icon: '🏷️' },
  { href: '/anbun', label: '按分設定', icon: '⚖️' },
  { href: '/settings', label: '設定', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-48 bg-white border-r border-gray-100 py-4">
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-k10-gold/10 text-k10-gold font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
