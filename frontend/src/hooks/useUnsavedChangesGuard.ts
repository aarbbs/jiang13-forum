import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

interface Options {
  /** 是否存在未保存的修改 */
  isDirty: boolean;
}

/**
 * 拦截页面内导航与关闭标签页，在存在未保存修改时提示用户确认。
 */
export function useUnsavedChangesGuard({ isDirty }: Options) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingLeaveRef = useRef<(() => void) | null>(null);
  /** 同步标记，避免 setState 未及时生效导致 useBlocker 二次拦截 */
  const allowNavigationRef = useRef(false);

  const shouldBlock = isDirty && !allowNavigationRef.current;
  const blocker = useBlocker(() => isDirty && !allowNavigationRef.current);

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setDialogOpen(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    if (!shouldBlock) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [shouldBlock]);

  const stayOnPage = useCallback(() => {
    setDialogOpen(false);
    pendingLeaveRef.current = null;
    if (blocker.state === 'blocked') {
      blocker.reset?.();
    }
  }, [blocker]);

  const discardAndLeave = useCallback(() => {
    setDialogOpen(false);
    allowNavigationRef.current = true;
    if (blocker.state === 'blocked') {
      blocker.proceed?.();
      return;
    }
    const action = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    action?.();
  }, [blocker]);

  /** 主动发起离开（如点击返回按钮） */
  const requestLeave = useCallback((action: () => void) => {
    if (!shouldBlock) {
      action();
      return;
    }
    pendingLeaveRef.current = action;
    setDialogOpen(true);
  }, [shouldBlock]);

  /** 保存成功后调用，允许后续导航不再拦截 */
  const markSaved = useCallback(() => {
    allowNavigationRef.current = true;
  }, []);

  return {
    dialogOpen,
    stayOnPage,
    discardAndLeave,
    requestLeave,
    markSaved,
  };
}
