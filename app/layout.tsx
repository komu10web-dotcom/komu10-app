import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'komu10 会計・事業管理システム',
  description: '観光デザインDuoの会計・事業管理システム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
