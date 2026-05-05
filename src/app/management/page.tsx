import { Suspense } from 'react';
import ManagementContent from '@/components/ManagementContentRenaissance';

export default function ManagementPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a1424' }}>
        <div className="w-5 h-5 border-2 border-app-gold border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ManagementContent />
    </Suspense>
  );
}
