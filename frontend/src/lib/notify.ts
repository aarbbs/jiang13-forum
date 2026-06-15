import { toast } from 'sonner';

/** 统一 Toast 入口，替代 Arco Message */
export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) => toast.warning(message),
};
