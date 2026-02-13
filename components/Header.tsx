'use client';

import { USERS } from '@/lib/constants';

interface HeaderProps {
  currentUser: string;
}

export function Header({ currentUser }: HeaderProps) {
  const handleUserChange = async (userId: string) => {
    document.cookie = `k10_user=${userId}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-100 z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <h1 className="font-questrial text-xl tracking-wide">
          <span className="text-k10-gold font-semibold">komu</span>
          <span className="text-k10-dark">10</span>
        </h1>
        <span className="text-xs text-gray-400 font-inter">v0.3</span>
      </div>
      
      <div className="flex items-center gap-4">
        <select
          value={currentUser}
          onChange={(e) => handleUserChange(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-k10-gold transition-colors cursor-pointer"
        >
          {USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
