'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, TrendingUp, FolderKanban, Settings } from 'lucide-react';

const navItems = [
  { href: '/', label: 'ホーム', icon: Home },
  { href: '/accounting', label: '会計', icon: BookOpen },
  { href: '/management', label: '経営', icon: TrendingUp },
  { href: '/projects', label: 'PJ', icon: FolderKanban },
  { href: '/settings', label: '設定', icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 z-50 md:top-0 md:bottom-auto md:border-t-0 md:border-b">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo - desktop only */}
          <Link 
            href="/" 
            className="hidden md:block font-display text-xl tracking-wide text-black/90"
          >
            komu10
          </Link>

          {/* Nav items */}
          <div className="flex items-center justify-around w-full md:w-auto md:gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex flex-col items-center justify-center px-3 py-2 rounded-lg
                    transition-smooth
                    md:flex-row md:gap-2 md:px-4
                    ${isActive 
                      ? 'text-gold' 
                      : 'text-black/40 hover:text-black/70'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
                  <span className={`text-[10px] mt-0.5 md:text-sm md:mt-0 ${isActive ? 'font-medium' : ''}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
