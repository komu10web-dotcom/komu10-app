import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
