'use client';

import { useEffect } from 'react';
import { COLORS } from '@/lib/constants';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto animate-fadeIn"
        style={{ margin: 16 }}
      >
        {/* Header */}
        <div 
          className="sticky top-0 flex items-center justify-between px-5 py-4 bg-white border-b"
          style={{ borderColor: COLORS.border }}
        >
          <h2 className="text-base font-medium" style={{ color: COLORS.textPrimary }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors hover:bg-gray-100"
            style={{ color: COLORS.textMuted }}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
