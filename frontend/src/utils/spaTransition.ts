import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';
import { notify } from '@/lib/notify';
import { isChunkLoadError, reloadForStaleChunk } from './chunkLoad';
import { prefetchRoute } from './prefetchRoute';

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let activeCount = 0;
let seq = 0;

function emit() {
  const active = activeCount > 0;
  listeners.forEach((fn) => fn(active));
}

/** 订阅顶栏进度条显隐 */
export function subscribeSpaTransition(fn: Listener): () => void {
  listeners.add(fn);
  fn(activeCount > 0);
  return () => { listeners.delete(fn); };
}

/** 开始一次过渡（可嵌套，全部结束才收条） */
export function startTransition(): number {
  const id = ++seq;
  activeCount += 1;
  emit();
  return id;
}

/** 结束过渡；若 id 已过期则忽略 */
export function doneTransition(id?: number) {
  if (id != null && id !== seq && activeCount > 0) {
    // 仍允许减计数，避免卡死；连续点击用 seq 作废预取即可
  }
  activeCount = Math.max(0, activeCount - 1);
  emit();
}

export function isSpaTransitionActive(): boolean {
  return activeCount > 0;
}

export type TransitionToOpts = NavigateOptions & {
  /** 强制重拉（Logo / 同 URL 刷新），跳过会话快照 */
  force?: boolean;
  /** 跳过等待，立即导航（纠偏、POP 等） */
  immediate?: boolean;
  /** 不显示顶栏进度条（软刷新换页） */
  silent?: boolean;
};

function toPathname(to: To): string {
  if (typeof to === 'number') return '';
  if (typeof to === 'string') {
    try {
      return new URL(to, window.location.origin).pathname;
    } catch {
      return to.split('?')[0].split('#')[0];
    }
  }
  return to.pathname ?? '';
}

function isOnlyHashChange(to: To): boolean {
  if (typeof to !== 'string') return false;
  if (!to.startsWith('#')) return false;
  return true;
}

/**
 * 站内点击：顶栏进度条 + 预热 chunk/接口后再跳转。
 * `nav(-1)`、仅 hash、immediate、外链风格路径直接走。
 */
export async function transitionTo(
  nav: NavigateFunction,
  to: To | number,
  opts?: TransitionToOpts,
): Promise<void> {
  const { force, immediate, silent, ...navOpts } = opts ?? {};

  if (typeof to === 'number' || immediate || isOnlyHashChange(to as To)) {
    nav(to as To, navOpts);
    return;
  }

  const target = to as To;
  const path = toPathname(target);
  // 后台第一期不做等待跳转
  if (path.startsWith('/admin')) {
    nav(target, navOpts);
    return;
  }

  const id = silent ? undefined : startTransition();
  const mySeq = silent ? seq : (id as number);
  try {
    await prefetchRoute(target, { force: !!force });
    if (!silent && mySeq !== seq) return;
    nav(target, navOpts);
  } catch (e: unknown) {
    if (!silent && mySeq !== seq) return;
    // 发版后 chunk 404：整页刷新，不 toast 英文原错
    if (isChunkLoadError(e) && reloadForStaleChunk()) return;
    notify.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    if (id != null) {
      if (mySeq === seq) doneTransition(id);
      else doneTransition();
    }
  }
}
