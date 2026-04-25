import { Suspense } from 'react';
import TaxReturnContent from '@/components/TaxReturnContentRenaissance';

export default function TaxReturnPage() {
  return (
    <Suspense fallback={
      <div className="bg-[#0a0a0b] min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#D4A03A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <TaxReturnContent />
    </Suspense>
  );
}
