'use client';

import { Navigation } from '@/components/Navigation';
import { FolderKanban } from 'lucide-react';

export default function ProjectsPage() {
  return (
    <div className="min-h-screen bg-surface pb-20 md:pt-20">
      <Navigation />

      <main className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-xl font-medium text-black/90 mb-1">PJ</h1>
          <p className="text-sm text-black/40">プロジェクト管理</p>
        </header>

        {/* Empty State */}
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-gold" />
          </div>
          <p className="text-sm text-black/60">プロジェクト機能は準備中です</p>
          <p className="text-xs text-black/40 mt-1">Phase 2で実装予定</p>
        </div>
      </main>
    </div>
  );
}
