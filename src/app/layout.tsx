import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import Navigation from '@/components/Navigation';
import HeaderControls from '@/components/HeaderControls';
import TestModeBanner from '@/components/TestModeBanner';

export const metadata: Metadata = {
  title: 'THE MONEY BOOK · komu10',
  description: 'komu10 の本(books)— 経費・売上・経営を一冊に。',
  // session77 確定 favicon — 主シンボル X 単一グリフ
  // 規定: Step Glyph 別冊 v1.1-rev1 主記号(中央階段4線・stroke 14)
  // 裁定: Hedi(CEO) / Saville(CBO) / Paula Scher(CDO) / Maureen Stone(色彩)
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#14213D',
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
          <header className="sticky top-0 z-50 bg-white border-b border-app-line-medium">
            {/* 上段: THE MONEY BOOK タイプロゴ + フィルター
                session77 確定: アプリ正式名は THE MONEY BOOK
                  - 左: komu10(運営者表記・小)+ THE MONEY BOOK(アプリ本名・主役)
                  - 中央以下の各画面 = 本の章(Chapter)
                裁定: Hedi(CEO) / Saville(CBO) / Paula(CDO) */}
            <div className="px-6 py-4 flex items-center justify-between">
              {/* 左: komu10 運営表記 + THE MONEY BOOK アプリ名
                  session78 確定: 4軸の差で主従関係を完全に語る(区切り記号は不要)
                    - komu10(運営者)= X Black #0a0a0b・Questrial Regular・14px
                    - THE MONEY BOOK(作品)= ミッドナイトインク #14213D・Big Shoulders Display Black 900・22px
                  4軸(書体・重量・サイズ・色)で主従関係を表現するため middle dot は廃止。
                  裁定: Hedi(CEO) / Saville(CBO) / Paula(CDO) / Maureen Stone(色彩) */}
              <div className="flex items-baseline gap-2">
                <div
                  className="text-x-black"
                  style={{
                    fontFamily: "'Questrial', sans-serif",
                    fontSize: 14,
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                  }}
                >
                  komu10
                </div>
                <div
                  style={{
                    color: '#14213D',
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
          
          {/* v0.52.0: テストモードバナー(ON時のみ表示) */}
          <TestModeBanner />

          {/* メインコンテンツ */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
