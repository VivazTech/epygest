import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

const TOAST_DURATION_MS = 5000;

type ToastItem = {
  id: string;
  message: string;
};

type ToastContextValue = {
  showSuccess: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

type ToastProviderProps = {
  children: React.ReactNode;
};

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback(
    (message: string) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message }]);
      window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    },
    [dismissToast]
  );

  const value = useMemo(() => ({ showSuccess }), [showSuccess]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de ToastProvider');
  }
  return ctx;
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-5 right-5 z-[60] flex flex-col gap-2 max-w-sm pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg shadow-emerald-900/10 animate-[toast-in_0.25s_ease-out]"
          role="status"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 leading-snug">{toast.message}</p>
            <div className="mt-2 h-0.5 rounded-full bg-emerald-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 animate-[toast-progress_5s_linear_forwards]" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Fechar notificação"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
