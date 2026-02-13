import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'komu10 | 会計・事業管理システム',
  description: 'komu10 会計・事業管理システム v0.3',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';

  return (
    <html lang="ja">
      <body className="min-h-screen bg-k10-bg">
        <Header currentUser={currentUser} />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 ml-48">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
