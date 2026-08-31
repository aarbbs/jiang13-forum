import { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Inbox, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostListItem from './PostListItem';
import { feedListRowEstimate } from './PostListSkeleton';
import FeedPagination from './FeedPagination';
import { InFlowSiteFooter } from './SiteFooter';
import { useAuth } from '../hooks/useAuth';
import { useForumLimits } from '../hooks/useForumLimits';
import { useMediaQuery } from '../hooks/useTheme';
import { loginPath } from '../utils/authRedirect';
import { dispatchOpenPostSearch } from '../hooks/usePostSearch';
import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';
import { getDefaultFeedSortFromCache } from './FeedSortBar';

interface Props {
  posts: PostItem[];
  sort?: FeedSort;
  loading: boolean;
  /** 当前页之后是否还有更多 */
  hasMore: boolean;
  /** 是否显示底部分页控件 */
  showPagination: boolean;
  page: number;
  totalPages: number;
  postTotal: number;
  onPageChange: (page: number) => void;
  onSelect: (id: number) => void;
  restoreScrollTop?: number | null;
  resetScrollKey?: number;
  onScrollTopChange?: (top: number) => void;
  onScrollRestored?: () => void;
  /** 搜索关键词（用于空态文案） */
  keyword?: string;
  /** 是否为帖子搜索（区别于标签筛选） */
  isSearchMode?: boolean;
  searchKeyword?: string;
  searchAuthor?: string;
  searchTitleOnly?: boolean;
  searchScopeBoardId?: number;
  onClearSearch?: () => void;
  /** 当前板块 id，0 表示全部 */
  boardId?: number;
  /** 当前板块名 */
  boardName?: string;
  /** 站点是否尚无任何板块（全新安装） */
  noBoards?: boolean;
}

/** 手机 Feed 整栏滚动时的容器 */
function getMobileFeedScrollEl(): HTMLElement | null {
  return document.querySelector('.main-content--feed-mobile-scroll');
}

export default function VirtualPostList({
  posts,
  sort = getDefaultFeedSortFromCache(),
  loading,
  hasMore,
  showPagination,
  page,
  totalPages,
  postTotal,
  onPageChange,
  onSelect,
  restoreScrollTop,
  resetScrollKey = 0,
  onScrollTopChange,
  onScrollRestored,
  keyword = '',
  isSearchMode = false,
  searchKeyword = '',
  searchAuthor = '',
  searchTitleOnly = false,
  searchScopeBoardId = 0,
  onClearSearch,
  boardId = 0,
  boardName = '',
  noBoards = false,
}: Props) {
  const nav = useNavigate();
  const { user } = useAuth();
  const { limits } = useForumLimits();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const feedStyle = limits.feed_list_style ?? 'title';
  const rowEstimate = feedListRowEstimate(feedStyle);
  const parentRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const onScrollTopChangeRef = useRef(onScrollTopChange);
  const onScrollRestoredRef = useRef(onScrollRestored);
  onScrollTopChangeRef.current = onScrollTopChange;
  onScrollRestoredRef.current = onScrollRestored;

  const [scrollMargin, setScrollMargin] = useState(0);

  const getScrollElement = useCallback(() => {
    if (isMobile) {
      return getMobileFeedScrollEl() ?? parentRef.current;
    }
    return parentRef.current;
  }, [isMobile]);

  /** 列表相对整栏滚动容器顶部的偏移，供虚拟列表对齐 */
  useLayoutEffect(() => {
    if (!isMobile) {
      setScrollMargin(0);
      return;
    }
    const main = getMobileFeedScrollEl();
    const list = parentRef.current;
    if (!main || !list) return;

    const update = () => {
      // 相对 main 内容顶（含当前 scrollTop），避免 offsetParent 链不准
      const next = Math.max(
        0,
        Math.round(list.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop),
      );
      setScrollMargin(prev => (prev === next ? prev : next));
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(main);
    const boardBar = main.querySelector('.mobile-board-bar');
    const feedTop = main.querySelector('.feed-top');
    if (boardBar) ro.observe(boardBar);
    if (feedTop) ro.observe(feedTop);
    return () => ro.disconnect();
  }, [isMobile, posts.length, loading, keyword, boardId]);

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement,
    estimateSize: () => rowEstimate,
    overscan: 8,
    scrollMargin: isMobile ? scrollMargin : 0,
    measureElement:
      typeof window !== 'undefined' && !navigator.userAgent.includes('Firefox')
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  const showEnd = !hasMore && !showPagination && posts.length > 0 && !loading;
  const isInitialLoad = loading && posts.length === 0;
  const isEmpty = !loading && posts.length === 0;
  const isSearchEmpty = isEmpty && (isSearchMode || !!keyword.trim());
  const composeTarget = boardId > 0 ? `/compose?board=${boardId}` : '/compose';
  const isAdmin = user?.role === 'admin';

  useLayoutEffect(() => {
    if (resetScrollKey <= 0) return;
    const el = getScrollElement();
    if (el) {
      el.scrollTop = 0;
      virtualizer.scrollToOffset(0);
    }
    restoredRef.current = true;
    onScrollTopChangeRef.current?.(0);
  }, [resetScrollKey, virtualizer, getScrollElement]);

  useLayoutEffect(() => {
    // 收到新的恢复目标时允许再次 restore；null 表示已消费，勿动标记
    if (restoreScrollTop == null) return;
    restoredRef.current = false;
  }, [restoreScrollTop]);

  useLayoutEffect(() => {
    if (restoreScrollTop == null || restoredRef.current || posts.length === 0) return;
    const el = getScrollElement();
    if (el) {
      el.scrollTop = restoreScrollTop;
    } else {
      virtualizer.scrollToOffset(restoreScrollTop);
    }
    restoredRef.current = true;
    onScrollRestoredRef.current?.();
  }, [restoreScrollTop, posts.length, virtualizer, getScrollElement]);

  useEffect(() => {
    const el = getScrollElement();
    if (!el) return;
    const onScroll = () => {
      onScrollTopChangeRef.current?.(el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [getScrollElement, isMobile]);

  const searchSummaryParts: string[] = [];
  if (searchKeyword.trim()) searchSummaryParts.push(`关键词「${searchKeyword.trim()}」`);
  if (searchAuthor.trim()) searchSummaryParts.push(`作者 ${searchAuthor.trim()}`);
  if (searchTitleOnly && searchKeyword.trim()) searchSummaryParts.push('仅标题');
  if (searchScopeBoardId > 0 && boardName) searchSummaryParts.push(`板块 ${boardName}`);

  const emptyActions = (
    <div className="empty-feed-actions">
      {noBoards ? (
        isAdmin ? (
          <Button type="button" size="sm" onClick={() => nav('/admin/boards')}>
            去创建板块
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => nav('/')}>
            刷新看看
          </Button>
        )
      ) : isSearchEmpty ? (
        <>
          <Button type="button" size="sm" variant="outline" onClick={dispatchOpenPostSearch}>
            修改搜索
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => (onClearSearch ? onClearSearch() : nav('/'))}>
            清除筛选
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => nav('/')}>
            返回全部帖子
          </Button>
        </>
      ) : (
        <>
          {boardId > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => nav('/')}>
              看看其他板块
            </Button>
          )}
          {user ? (
            <Button type="button" size="sm" onClick={() => nav(composeTarget)}>
              {boardName ? `成为「${boardName}」第一帖` : '发第一帖'}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => nav(loginPath(composeTarget))}>
              登录后发帖
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="post-list-scroll" ref={parentRef}>
      {isInitialLoad ? null : isEmpty ? (
        <div className="empty-feed" role="status">
          {isSearchEmpty
            ? <SearchX className="empty-feed-icon" aria-hidden size={36} strokeWidth={1.5} />
            : <Inbox className="empty-feed-icon" aria-hidden size={36} strokeWidth={1.5} />}
          <p>
            {noBoards
              ? '暂无板块'
              : isSearchEmpty
                ? '没有匹配的帖子'
                : '暂无帖子'}
          </p>
          <p className="empty-feed-hint">
            {noBoards
              ? (isAdmin ? '创建第一个板块后即可开始发帖' : '管理员创建板块后即可参与讨论')
              : isSearchEmpty
                ? (searchSummaryParts.length > 0
                  ? `当前筛选：${searchSummaryParts.join(' · ')}。试试更短的关键词或放宽条件。`
                  : '试试更短的关键词，或浏览标签云 / 板块')
                : boardName
                  ? `「${boardName}」还没有内容，来发第一篇吧`
                  : '换个板块看看，或发第一篇内容'}
          </p>
          {emptyActions}
        </div>
      ) : (
        <>
          <div className="content-surface" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vi => {
              const post = posts[vi.index];
              if (!post) return null;
              // scrollMargin 模式下 start 含偏移，需减回才能在列表内绝对定位
              const offsetY = isMobile ? vi.start - scrollMargin : vi.start;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${offsetY}px)`,
                  }}
                >
                  <PostListItem post={post} sort={sort} boardId={boardId} onSelect={onSelect} />
                </div>
              );
            })}
          </div>
          {showPagination && (
            <div className="feed-list-footer feed-list-footer--pagination">
              <FeedPagination
                page={page}
                totalPages={totalPages}
                postTotal={postTotal}
                loading={loading}
                onPageChange={onPageChange}
              />
            </div>
          )}
          {showEnd && (
            <div className="feed-list-footer feed-list-footer--end">— 已加载全部 —</div>
          )}
        </>
      )}
      <InFlowSiteFooter />
    </div>
  );
}
