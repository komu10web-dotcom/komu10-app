import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/Navigation';

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
            {/* 上段: ロゴ + ユーザー */}
            <div className="px-6 py-4 flex items-center justify-between">
              {/* 左: ロゴ */}
              <div className="flex items-center gap-3">
                <div className="font-['Questrial'] text-lg text-[#1B4D3E]">komu10</div>
                <div className="text-[10px] font-light tracking-wider text-gray-400">ACCOUNTING</div>
              </div>
              
              {/* 右: ユーザー名+アバター */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">トモ</span>
                <div className="w-8 h-8 rounded-full bg-[#1B4D3E] flex items-center justify-center">
                  <span className="text-white text-xs font-medium">T</span>
                </div>
              </div>
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
