import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Message bref en bas de l'écran (« Ajouté aux favoris »…), qui disparaît seul.
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { id, message }
  const timerRef = useRef(null);

  const show = useCallback((message) => {
    clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message });
    timerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[10000] flex justify-center px-4" role="status" aria-live="polite">
        {toast && (
          <p
            key={toast.id}
            className="toast-in max-w-full rounded-full bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-surface"
          >
            {toast.message}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
