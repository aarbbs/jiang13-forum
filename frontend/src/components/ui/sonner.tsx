import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/hooks/useTheme';

/** 全局 Toast，替代 Arco Message */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'font-sans',
        },
      }}
    />
  );
}
