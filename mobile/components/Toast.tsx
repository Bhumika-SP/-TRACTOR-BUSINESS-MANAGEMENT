import { CheckCircle2, XCircle } from 'lucide-react-native';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/config';

type Kind = 'success' | 'error';
interface ToastValue {
  show: (message: string, kind?: Kind) => void;
}

const ToastContext = createContext<ToastValue>({ show: () => undefined });

/** Small message at the top of the screen, e.g. "Work saved". */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: Kind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: Kind = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16 }}
          className={`flex-row items-center rounded-2xl px-4 py-4 ${toast.kind === 'success' ? 'bg-profit' : 'bg-expense'}`}
        >
          {toast.kind === 'success' ? <CheckCircle2 color={COLORS.white} size={26} /> : <XCircle color={COLORS.white} size={26} />}
          <Text className="ml-3 flex-1 text-lg font-semibold text-white">{toast.message}</Text>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
