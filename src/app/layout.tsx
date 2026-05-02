import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navigation from '@/components/Navigation';
import HeaderControls from '@/components/HeaderControls';

export const metadata: Metadata = {
  title: 'THE MONEY BOOK · komu10',
  description: 'komu10 の本(books)— 経費・売上・経営を一冊に。',
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
            {/* 上段: THE MONEY BOOK タイプロゴ + フィルター
                session77 確定: アプリ正式名は THE MONEY BOOK
                  - 左: komu10(運営者表記・小)+ THE MONEY BOOK(アプリ本名・主役)
                  - 中央以下の各画面 = 本の章(Chapter)
                裁定: Hedi(CEO) / Saville(CBO) / Paula(CDO) */}
            <div className="px-6 py-4 flex items-center justify-between">
              {/* 左: komu10 運営表記 + THE MONEY BOOK アプリ名 */}
              <div className="flex items-baseline gap-3">
                <div
                  className="text-[11px] tracking-[0.32em] text-gray-400 uppercase"
                  style={{ fontFamily: "'Questrial', sans-serif" }}
                >
                  komu<span className="text-app-gold">10</span>
                </div>
                <div
                  className="text-x-black"
                  style={{
                    fontFamily: "'Big Shoulders Display', sans-serif",
                    fontWeight: 900,
                    fontSize: 22,
                    letterSpacing: '-0.01em',
                    lineHeight: 1,
                  }}
                >
                  THE MONEY BOOK
                </div>
              </div>

              {/* 右: 担当者フィルター + 年度セレクター */}
              <Suspense fallback={<div className="h-8" />}>
                <HeaderControls />
              </Suspense>
            </div>

            {/* 下段: ナビゲーション(章リンク) */}
            <Suspense fallback={<div className="h-10" />}>
              <Navigation />
            </Suspense>
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
