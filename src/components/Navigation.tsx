'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'ホーム' },
  { href: '/accounting', label: '会計' },
  { href: '/tax-return', label: '確定申告' },
  { href: '/management', label: '経営' },
  { href: '/projects', label: 'PJ' },
  { href: '/settings', label: '設定' },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-t border-gray-100">
      <div className="px-6 flex gap-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                relative py-3 font-['Shippori_Mincho'] text-[13px] transition-colors
                ${isActive 
                  ? 'text-[#0a0a0b]' 
                  : 'text-gray-400 hover:text-gray-600'
                }
              `}
            >
              {item.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0a0a0b]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
