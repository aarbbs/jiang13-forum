import type { To } from 'react-router-dom';
import { api } from '../api/client';
import type {
  CheckInStatus,
  Comment,
  CommunityShowcaseItem,
  FriendLinkApply,
  PollView,
  PostItem,
  PostLotteryView,
  SitePage,
} from '../api/types';
import { parseFeedSort } from '../components/FeedSortBar';
import { checkInCacheKey } from '../hooks/useCheckIn';
import { ensureForumLimitsLoaded, getCachedForumLimits } from '../hooks/useForumLimits';
import { ensureSiteBrandingLoaded } from '../hooks/useSiteBranding';
import { ensureSitePagesLoaded } from '../hooks/useSitePages';
import { feedCacheKey, getHomeStoreState } from '../store/homeStore';
import { resolveAsideWidgets } from './asideWidgets';
import { isTimeDiffSignificant } from './content';
import { loadMyCommentIds } from './guest';
import {
  setCachedBoards,
  setCachedStats,
  setCachedRecentComments,
  setCachedRecentUsers,
  setCachedTags,
} from './layoutCache';
import { isChunkLoadError, reloadForStaleChunk } from './chunkLoad';
import { parsePermalinkID, parsePermalinkSlug } from './permalink';
import { getSessionSnapshot, setSessionSnapshot } from './sessionPageCache';

/** 与 PostDetailPage 会话快照同形，供预取写入 */
type PostDetailSnapshot = {
  post: PostItem;
  comments: Comment[];
  poll: PollView | null;
  lottery: PostLotteryView | null;
  liked: boolean;
  favorited: boolean;
  canEdit: boolean;
  isEdited: boolean;
  editBlockReason: string;
  editWindowHours: number;
  bountyCanRefund: boolean;
  bountyRefundBlockReason: string;
  bountyEligibleReplyCount: number;
  scrollTop: number;
};

function resolveUrl(to: To): URL {
  if (typeof to === 'string') return new URL(to, window.location.origin);
  const path = to.pathname ?? '/';
  const search = to.search ?? '';
  const hash = to.hash ?? '';
  return new URL(path + search + hash, window.location.origin);
}

/** 预加载对应路由的 lazy chunk（与 App.tsx lazyWithRetry 对齐） */
function preloadChunk(pathname: string): Promise<unknown> {
  let load: Promise<unknown>;
  if (pathname === '/' || /^\/board\//.test(pathname)) {
    load = import('../pages/HomePage');
  } else if (/^\/post\/[^/]+\/edit$/.test(pathname) || pathname === '/compose') {
    load = import('../pages/ComposePage');
  } else if (/^\/post\//.test(pathname)) {
    load = import('../pages/PostDetailPage');
  } else if (pathname === '/profile') {
    load = import('../pages/ProfilePage');
  } else if (/^\/user\//.test(pathname)) {
    load = import('../pages/UserProfilePage');
  } else if (pathname === '/favorites') {
    load = import('../pages/FavoritesPage');
  } else if (pathname === '/projects') {
    load = import('../pages/ProjectsPage');
  } else if (pathname === '/links') {
    load = import('../pages/LinksPage');
  } else if (pathname === '/showcase') {
    load = import('../pages/ShowcasePage');
  } else if (pathname === '/messages') {
    load = import('../pages/MessagesPage');
  } else if (/^\/page\//.test(pathname)) {
    load = import('../pages/SitePageView');
  } else if (pathname === '/login') {
    load = import('../pages/LoginPage');
  } else if (pathname === '/register') {
    load = import('../pages/RegisterPage');
  } else if (pathname === '/forgot-password') {
    load = import('../pages/ForgotPasswordPage');
  } else {
    return Promise.resolve();
  }
  // 发版后旧 hashed URL 404：硬刷新，挂起 Promise 避免落到 toast
  return load.catch((err: unknown) => {
    if (isChunkLoadError(err) && reloadForStaleChunk()) {
      return new Promise(() => {});
    }
    throw err;
  });
}

async function prefetchFeed(url: URL, force: boolean): Promise<void> {
  const limits = getCachedForumLimits();
  const pageSize = Math.max(1, limits.page_size_default);
  const boardMatch = url.pathname.match(/^\/board\/([^/]+)/);
  const boardId = boardMatch ? (parsePermalinkID(boardMatch[1]) || 0) : 0;
  const keyword = url.searchParams.get('keyword') || '';
  const tag = url.searchParams.get('tag') || '';
  const author = url.searchParams.get('author') || '';
  const titleOnly = url.searchParams.get('title_only') === '1';
  const sort = parseFeedSort(url.searchParams.get('sort'), limits.feed_sort_tabs);
  const key = feedCacheKey({ boardId, keyword, sort, tag, author, titleOnly });

  if (!force) {
    const hit = getHomeStoreState().getFeed(key);
    if (hit && hit.posts.length > 0) return;
  }
  // force：不提前清空 store，等新数据写入时覆盖，避免软刷新中间态读到空列表

  const data = await api.posts({
    page: 1,
    size: pageSize,
    board_id: boardId || '',
    keyword: tag ? '' : keyword,
    tag: tag || '',
    author: tag ? '' : author,
    title_only: !tag && titleOnly ? '1' : '',
    sort,
  });
  getHomeStoreState().setFeed(key, {
    posts: Array.isArray(data.posts) ? data.posts : [],
    postTotal: data.total ?? 0,
    page: 1,
    scrollTop: 0,
    lastFetchTime: Date.now(),
  });
}

async function prefetchPost(id: number, force: boolean): Promise<void> {
  const key = `post:${id}`;
  if (!force && getSessionSnapshot(key) !== undefined) return;
  // force：保留旧快照直到新数据写回，避免软刷新中间态空白

  const myIds = loadMyCommentIds();
  const [detail, comm] = await Promise.all([
    api.post(id),
    api.comments(id, myIds),
  ]);
  const snap: PostDetailSnapshot = {
    post: detail.post,
    comments: Array.isArray(comm.comments) ? comm.comments : [],
    poll: detail.poll ?? null,
    lottery: detail.lottery ?? null,
    liked: detail.liked,
    favorited: detail.favorited,
    canEdit: detail.can_edit ?? false,
    isEdited: detail.is_edited
      ?? isTimeDiffSignificant(detail.post.created_at, detail.post.updated_at ?? detail.post.created_at),
    editBlockReason: detail.edit_block_reason ?? '',
    editWindowHours: detail.post_edit_window_hours ?? 0,
    bountyCanRefund: detail.bounty_can_refund ?? true,
    bountyRefundBlockReason: detail.bounty_refund_block_reason ?? '',
    bountyEligibleReplyCount: detail.bounty_eligible_reply_count ?? 0,
    scrollTop: 0,
  };
  setSessionSnapshot(key, snap);
}

async function prefetchUser(id: number, force: boolean): Promise<void> {
  const profileKey = `user:${id}`;
  if (!force && getSessionSnapshot(profileKey) !== undefined) return;

  const limits = getCachedForumLimits();
  const pageSize = limits.page_size_default > 0 ? limits.page_size_default : 20;
  const [profileRes, postsRes] = await Promise.all([
    api.userProfile(id),
    api.posts({ user_id: id, page: 1, size: pageSize, sort: 'latest' }),
  ]);
  setSessionSnapshot(profileKey, {
    profile: profileRes.user,
    stats: profileRes.stats ?? null,
  });
  setSessionSnapshot(`${profileKey}:posts:1:${pageSize}`, {
    posts: Array.isArray(postsRes.posts) ? postsRes.posts : [],
    total: postsRes.total ?? 0,
  });
}

async function prefetchKeyed<T>(
  key: string,
  force: boolean,
  fetcher: () => Promise<T>,
): Promise<void> {
  if (!force && getSessionSnapshot(key) !== undefined) return;
  const data = await fetcher();
  setSessionSnapshot(key, data);
}

/** 静默预热签到（401 / 失败不阻断跳转） */
async function prefetchCheckIn(force: boolean): Promise<void> {
  try {
    const me = await api.me();
    const id = me.user?.id;
    if (!id) return;
    const key = checkInCacheKey(id);
    if (!force && getSessionSnapshot<CheckInStatus>(key) !== undefined) return;
    const d = await api.checkInStatus();
    setSessionSnapshot(key, d.check_in);
  } catch {
    // 未登录或接口失败：忽略
  }
}

/** 右栏展柜与全页共用 showcase 快照 */
async function prefetchShowcaseIfEnabled(force: boolean): Promise<void> {
  const limits = getCachedForumLimits();
  const enabled = resolveAsideWidgets(limits).some((w) => w.id === 'showcase' && w.enabled);
  if (!enabled) return;
  await prefetchKeyed<CommunityShowcaseItem[]>('showcase', force, () =>
    api.communityShowcase().then((r) => (Array.isArray(r.items) ? r.items : [])),
  ).catch(() => undefined);
}

/** MainLayout 壳层：签到 +（可选）展柜，与主内容并行 */
function prefetchShell(force: boolean): Promise<void> {
  return Promise.all([
    prefetchCheckIn(force),
    prefetchShowcaseIfEnabled(force),
  ]).then(() => undefined);
}

/** 是否会挂载前台 MainLayout（非纯 auth / 后台页） */
export function isMainLayoutPath(pathname: string): boolean {
  if (pathname.startsWith('/admin')) return false;
  if (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password') return false;
  return true;
}

/** 按目标 URL 预热会话快照 / Feed 缓存（不改 fetch 缓存策略） */
export async function prefetchData(to: To, opts?: { force?: boolean }): Promise<void> {
  const force = !!opts?.force;
  const url = resolveUrl(to);
  const { pathname } = url;

  const shell = isMainLayoutPath(pathname) ? prefetchShell(force) : Promise.resolve();

  if (pathname === '/' || /^\/board\//.test(pathname)) {
    await Promise.all([prefetchFeed(url, force), shell]);
    return;
  }

  const postEdit = pathname.match(/^\/post\/([^/]+)\/edit$/);
  if (postEdit) {
    await shell;
    return;
  }

  const postMatch = pathname.match(/^\/post\/([^/]+)/);
  if (postMatch) {
    const id = parsePermalinkID(postMatch[1]);
    await Promise.all([
      id && !Number.isNaN(id) ? prefetchPost(id, force) : Promise.resolve(),
      shell,
    ]);
    return;
  }

  const userMatch = pathname.match(/^\/user\/([^/]+)/);
  if (userMatch) {
    const id = parsePermalinkID(userMatch[1]);
    await Promise.all([
      id && !Number.isNaN(id) ? prefetchUser(id, force) : Promise.resolve(),
      shell,
    ]);
    return;
  }

  if (pathname === '/favorites') {
    await Promise.all([
      prefetchKeyed('favorites', force, () =>
        api.favorites().then((d) => (Array.isArray(d.favorites) ? d.favorites : [])),
      ),
      shell,
    ]);
    return;
  }

  if (pathname === '/projects') {
    await Promise.all([
      prefetchKeyed(`projects:1:`, force, () =>
        api.projects({ page: 1, limit: 30 }).then((d) => ({
          list: Array.isArray(d.projects) ? d.projects : [],
          total: d.total ?? 0,
          totalPages: d.total_pages ?? 0,
        })),
      ),
      shell,
    ]);
    return;
  }

  if (pathname === '/links') {
    await Promise.all([
      prefetchKeyed<FriendLinkApply[]>('links:applies', force, () =>
        api.myFriendLinkApplies().then((r) => r.applies ?? []).catch(() => []),
      ),
      shell,
    ]);
    return;
  }

  if (pathname === '/showcase') {
    await Promise.all([
      prefetchKeyed('showcase', force, () =>
        api.communityShowcase().then((r) => (Array.isArray(r.items) ? r.items : [])),
      ),
      shell,
    ]);
    return;
  }

  if (pathname === '/messages') {
    await Promise.all([
      prefetchKeyed('messages:conv:1', force, () =>
        api.messageConversations({ page: 1, size: 30 }).then((r) => ({
          conversations: r.conversations || [],
          total: r.total || 0,
          page: r.page || 1,
        })),
      ),
      shell,
    ]);
    return;
  }

  if (pathname === '/profile' || pathname === '/compose') {
    await shell;
    return;
  }

  const pageMatch = pathname.match(/^\/page\/([^/]+)/);
  if (pageMatch) {
    const slug = parsePermalinkSlug(pageMatch[1]);
    await Promise.all([
      slug
        ? prefetchKeyed<SitePage | null>(`sitepage:${slug}`, force, () =>
          api.page(slug).then((d) => d.page),
        )
        : Promise.resolve(),
      shell,
    ]);
  }
}

/** chunk + 数据并行预热 */
export async function prefetchRoute(to: To, opts?: { force?: boolean }): Promise<void> {
  const url = resolveUrl(to);
  await Promise.all([
    preloadChunk(url.pathname),
    prefetchData(to, opts),
  ]);
}

/** 壳层数据：boards/stats/站点页/右栏（与冷启动、软刷新共用） */
export async function prefetchLayoutShell(opts?: { force?: boolean }): Promise<void> {
  const force = !!opts?.force;
  await ensureForumLimitsLoaded({ force });
  const limits = getCachedForumLimits();
  const widgets = resolveAsideWidgets(limits);
  const showRecentComments = widgets.some((w) => w.id === 'recent_comments' && w.enabled);
  const showRecentUsers = widgets.some((w) => w.id === 'recent_users' && w.enabled);
  const showTagCloud = widgets.some((w) => w.id === 'tag_cloud' && w.enabled);
  const hideAside = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 1100px)').matches;

  const tasks: Promise<unknown>[] = [
    api.boards().then((d) => {
      setCachedBoards(d.boards ?? []);
    }).catch(() => undefined),
    api.stats().then((next) => {
      if (next) setCachedStats(next);
    }).catch(() => undefined),
    ensureSitePagesLoaded({ force }),
  ];

  // 软刷新：与壳层同拍重拉站名 / 友链等品牌文案
  if (force) {
    tasks.push(ensureSiteBrandingLoaded({ force: true }).catch(() => undefined));
  }

  if (!hideAside) {
    if (showRecentComments) {
      tasks.push(
        api.recentComments().then((d) => {
          setCachedRecentComments(Array.isArray(d.comments) ? d.comments : []);
        }).catch(() => undefined),
      );
    }
    if (showRecentUsers) {
      tasks.push(
        api.recentUsers().then((d) => {
          setCachedRecentUsers(Array.isArray(d.users) ? d.users : []);
        }).catch(() => undefined),
      );
    }
    if (showTagCloud) {
      tasks.push(
        api.tags(40).then((d) => {
          setCachedTags(Array.isArray(d.tags) ? d.tags : []);
        }).catch(() => undefined),
      );
    }
  }

  await Promise.all(tasks);
}

let coldBootEnsured = false;

/** main.tsx 是否已完成前台冷启动预热（MainLayout 可同步放行） */
export function wasColdBootEnsured(): boolean {
  return coldBootEnsured;
}

/**
 * 冷启动：在 createRoot 之前静默预热当前前台路由与壳层。
 * 不触发顶栏进度条；失败也放行，避免永久空白。
 */
export async function ensureColdBootReady(to?: string): Promise<void> {
  const path = to ?? `${window.location.pathname}${window.location.search}`;
  const url = resolveUrl(path);
  if (!isMainLayoutPath(url.pathname)) {
    coldBootEnsured = true;
    return;
  }

  try {
    await Promise.all([
      prefetchRoute(path, { force: false }),
      prefetchLayoutShell(),
    ]);
  } catch {
    // 忽略：仍挂载 App
  } finally {
    coldBootEnsured = true;
  }
}
