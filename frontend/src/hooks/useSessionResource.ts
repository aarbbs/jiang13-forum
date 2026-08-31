import { useCallback, useEffect, useRef, useState } from 'react';
import { PAGE_FORCE_REFRESH_EVENT } from '../utils/feedCache';
import { PAGE_SOFT_REFRESH_COMMIT_EVENT } from '../utils/softRefresh';
import {
  getSessionSnapshot,
  setSessionSnapshot,
  deleteSessionSnapshot,
} from '../utils/sessionPageCache';

type Fetcher<T> = () => Promise<T>;

/**
 * 会话快照数据源：有缓存则跳过请求；无缓存时保留上一份画面直到新数据返回。
 * 手机下拉软刷新 commit / PAGE_FORCE_REFRESH_EVENT 会应用新快照。
 */
export function useSessionResource<T>(
  key: string | null,
  fetcher: Fetcher<T>,
  opts?: {
    enabled?: boolean;
    onError?: (e: unknown) => void;
  },
) {
  const enabled = opts?.enabled !== false;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onErrorRef = useRef(opts?.onError);
  onErrorRef.current = opts?.onError;

  const [data, setData] = useState<T | undefined>(() =>
    key && enabled ? getSessionSnapshot<T>(key) : undefined,
  );
  const [loading, setLoading] = useState(() => {
    if (!key || !enabled) return false;
    return getSessionSnapshot<T>(key) === undefined;
  });
  const [pending, setPending] = useState(false);
  const seqRef = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (!key || !enabled) {
      if (!enabled) {
        setLoading(false);
        setPending(false);
      }
      return;
    }

    const hit = getSessionSnapshot<T>(key);
    if (hit !== undefined) {
      setData(hit);
      setLoading(false);
      setPending(false);
      return;
    }

    const seq = ++seqRef.current;
    const keep = dataRef.current !== undefined;
    if (keep) setPending(true);
    else setLoading(true);

    fetcherRef.current()
      .then((next) => {
        if (seq !== seqRef.current) return;
        setSessionSnapshot(key, next);
        setData(next);
      })
      .catch((e: unknown) => {
        if (seq !== seqRef.current) return;
        onErrorRef.current?.(e);
        if (!keep) setData(undefined);
      })
      .finally(() => {
        if (seq !== seqRef.current) return;
        setLoading(false);
        setPending(false);
      });

    return () => {
      seqRef.current += 1;
    };
  }, [key, enabled]);

  const replace = useCallback((next: T | ((prev: T | undefined) => T)) => {
    setData((prev) => {
      const value = typeof next === 'function' ? (next as (p: T | undefined) => T)(prev) : next;
      if (key) setSessionSnapshot(key, value);
      return value;
    });
  }, [key]);

  const invalidate = useCallback(() => {
    if (key) deleteSessionSnapshot(key);
  }, [key]);

  useEffect(() => {
    const reload = (opts: { allowLoading: boolean }) => {
      if (!key || !enabled) return;
      const warm = getSessionSnapshot<T>(key);
      if (warm !== undefined) {
        setData(warm);
        setLoading(false);
        setPending(false);
        return;
      }
      const seq = ++seqRef.current;
      const keep = dataRef.current !== undefined;
      if (opts.allowLoading) {
        deleteSessionSnapshot(key);
        if (keep) setPending(true);
        else setLoading(true);
      }
      fetcherRef.current()
        .then((next) => {
          if (seq !== seqRef.current) return;
          setSessionSnapshot(key, next);
          setData(next);
        })
        .catch((e: unknown) => {
          if (seq !== seqRef.current) return;
          onErrorRef.current?.(e);
          if (opts.allowLoading && !keep) setData(undefined);
        })
        .finally(() => {
          if (seq !== seqRef.current) return;
          setLoading(false);
          setPending(false);
        });
    };
    const onForce = () => reload({ allowLoading: true });
    // 软刷新 commit：未命中不卸 UI，后台静默再拉
    const onCommit = () => reload({ allowLoading: false });
    window.addEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
    window.addEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onCommit);
    return () => {
      window.removeEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
      window.removeEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onCommit);
    };
  }, [key, enabled]);

  return { data, loading, pending, replace, invalidate };
}
