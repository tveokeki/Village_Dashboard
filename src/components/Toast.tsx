"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string;
  onClose?: () => void;
  duration?: number;
};

export default function Toast({ message, onClose, duration = 3500 }: ToastProps) {
  useEffect(() => {
    if (!message || !onClose) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, onClose, duration]);

  if (!message) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] max-w-[calc(100vw-2rem)] rounded-2xl bg-brand-600 text-white shadow-xl px-4 py-3 text-sm flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
      <span className="shrink-0">✅</span>
      <span>{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-2 text-white/80 hover:text-white"
          aria-label="Close notification"
        >
          ×
        </button>
      )}
    </div>
  );
}
