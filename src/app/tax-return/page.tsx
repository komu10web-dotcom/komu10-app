import { Suspense } from 'react';
import TaxReturnContent from '@/components/TaxReturnContentRenaissance';

export default function TaxReturnPage() {
  return (
    <Suspense fallback={
      <div className="bg-x-black min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-app-gold border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <TaxReturnContent />
    </Suspense>
  );
}
