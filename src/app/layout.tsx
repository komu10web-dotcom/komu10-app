import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navigation from '@/components/Navigation';
import HeaderControls from '@/components/HeaderControls';

export const metadata: Metadata = {
  title: 'komu10 会計',
  description: '経費を、消す。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div className="min-h-screen flex flex-col">
          {/* ヘッダー（sticky） */}
          <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
            {/* 上段: ロゴ + フィルター */}
            <div className="px-6 py-4 flex items-center justify-between">
              {/* 左: ロゴ */}
              <div className="flex items-center gap-3">
                <div className="font-['Questrial'] text-lg text-[#1B4D3E]">komu10</div>
                <div className="text-[10px] font-light tracking-wider text-gray-400">ACCOUNTING</div>
              </div>
              
              {/* 右: 担当者フィルター + 年度セレクター */}
              <Suspense fallback={<div className="h-8" />}>
                <HeaderControls />
              </Suspense>
            </div>
            
            {/* 下段: ナビゲーション */}
            <Navigation />
          </header>
          
          {/* メインコンテンツ */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
