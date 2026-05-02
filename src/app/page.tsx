import { Suspense } from 'react';
import HomeContent from '@/components/HomeContent';

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="bg-app-surface-alt min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-app-gold border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
