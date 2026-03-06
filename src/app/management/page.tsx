import { Suspense } from 'react';
import ManagementContent from '@/components/ManagementContent';

export default function ManagementPage() {
  return (
    <Suspense fallback={
      <div className="bg-[#F5F5F3] min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#D4A03A] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ManagementContent />
    </Suspense>
  );
}
