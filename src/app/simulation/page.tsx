'use client';

import { Suspense } from 'react';
import SimulationContent from '@/components/SimulationContent';

export default function SimulationPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-[#ccc]">読み込み中...</div>}>
      <SimulationContent />
    </Suspense>
  );
}
