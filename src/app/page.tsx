'use client';

import { Uploader } from '@/components/Uploader';

export default function HomePage() {
  return (
    <div className="bg-[#F5F5F3] min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* ページタイトル */}
        <div className="mb-6">
          <h1 className="font-['Shippori_Mincho'] text-xl text-[#1a1a1a]">経費申請</h1>
          <p className="text-[11px] font-light tracking-wider text-[#999] mt-1">EXPENSE FILING</p>
        </div>

        {/* アップローダー */}
        <Uploader onUploadComplete={() => {
          // 将来: RECENT一覧のリフレッシュ等
        }} />
      </div>
    </div>
  );
}
