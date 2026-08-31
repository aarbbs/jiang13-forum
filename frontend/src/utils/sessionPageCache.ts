/** 会话内页面快照：前进后退命中则不再请求，手动刷新或登录态变化时清空 */

const MAX_ENTRIES = 48;

const order: string[] = [];
const store = new Map<string, unknown>();

function touch(key: string) {
  const i = order.indexOf(key);
  if (i >= 0) order.splice(i, 1);
  order.push(key);
  while (order.length > MAX_ENTRIES) {
    const old = order.shift();
    if (old) store.delete(old);
  }
}

export function getSessionSnapshot<T>(key: string): T | undefined {
  if (!store.has(key)) return undefined;
  touch(key);
  return store.get(key) as T;
}

export function setSessionSnapshot<T>(key: string, data: T): void {
  store.set(key, data);
  touch(key);
}

export function deleteSessionSnapshot(key: string): void {
  if (!store.delete(key)) return;
  const i = order.indexOf(key);
  if (i >= 0) order.splice(i, 1);
}

/** 不传 prefix 则清空全部；否则只删该前缀的 key */
export function clearSessionSnapshots(prefix?: string): void {
  if (!prefix) {
    store.clear();
    order.length = 0;
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) deleteSessionSnapshot(key);
  }
}
