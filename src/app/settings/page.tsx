import { Suspense } from 'react';
import SettingsContent from '@/components/SettingsContent';

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="bg-app-surface-alt min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-app-gold border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
