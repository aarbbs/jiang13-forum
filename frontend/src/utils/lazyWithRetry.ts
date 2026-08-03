import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isChunkLoadError, reloadForStaleChunk } from './chunkLoad';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

/**
 * 带发版容错的 React.lazy：动态 import 失败时自动整页刷新一次。
 * （部署后 hashed chunk 更名，旧标签页点到懒加载路由时常见）
 */
export function lazyWithRetry<T extends AnyComponent>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkLoadError(err) && reloadForStaleChunk()) {
        // 刷新进行中，挂起 Promise，避免再抛到错误页闪一下
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
