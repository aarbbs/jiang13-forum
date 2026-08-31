import type { PostItem } from '../api/types';
import type { FeedSort } from './FeedSortBar';
import { getBoardThemeIndex } from '../utils/boardTheme';
import { postPath } from '../utils/permalink';
import { useForumLimits } from '../hooks/useForumLimits';

import { formatTime } from '../utils/content';
import { MessageCircle } from 'lucide-react';

/** 与 Go formatSSRRelativeTime / 前端 formatTime 对齐的列表时间 */

function stripHtmlPlain(html: string): string {
  if (!html) return '';
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

function truncateRunes(s: string, max: number): string {
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return chars.slice(0, max).join('');
}

function firstImageSrc(html: string): string {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  const src = m?.[1]?.trim() || '';
  if (!src || src.startsWith('data:')) return '';
  return src;
}

function displayName(post: PostItem): string {
  const n = post.user?.nickname?.trim() || post.user?.username?.trim();
  return n || '用户';
}

type Props = {
  posts: PostItem[];
  sort: FeedSort;
  boardId: number;
};

/** 与 Go writeSSRPostRow 同构的静态列表（hydrate 首帧专用） */
export default function StaticFeedList({ posts, sort, boardId }: Props) {
  const { limits } = useForumLimits();
  const style = limits.feed_list_style ?? 'title';
  const titleOnly = style === 'title';
  const needExcerpt = style === 'excerpt' || style === 'thumbnail';
  const needThumb = style === 'thumbnail';

  return (
    <div className="post-list-scroll post-list-scroll--ssr">
      <div className="content-surface content-surface--ssr">
        {posts.length === 0 ? (
          <div className="feed-empty">暂无帖子</div>
        ) : (
          posts.map((post) => {
            const href = postPath(post.id, limits);
            const author = displayName(post);
            const initial = Array.from(author)[0] || '?';
            let excerpt = '';
            let thumb = '';
            if (needExcerpt || needThumb) {
              excerpt = truncateRunes(stripHtmlPlain(post.content || ''), 120);
            }
            if (needThumb) thumb = firstImageSrc(post.content || '');

            const rowClass = [
              'post-row',
              'post-row--v2',
              titleOnly ? 'post-row--title-only' : '',
              thumb ? 'post-row--has-thumb' : '',
            ].filter(Boolean).join(' ');

            let timeLabel = formatTime(post.created_at);
            if (sort === 'reply' && !post.last_reply_at) {
              timeLabel = '暂无回复';
            }
            const lastReplyName = post.last_reply_user?.nickname?.trim()
              || post.last_reply_user?.username?.trim()
              || post.last_reply_guest_nick?.trim()
              || '';
            const showLastReply = !!post.last_reply_at && (!!post.last_reply_user || !!lastReplyName);
            const commentCount = post.comment_count ?? 0;

            const hasTypeBadge = post.post_type === 'question'
              || post.post_type === 'poll'
              || post.post_type === 'lottery'
              || (post.post_type === 'bounty' && (
                (post.bounty_status === 'open' && (post.bounty_points ?? 0) > 0)
                || post.bounty_status === 'awarded'
              ));

            const titleRow = (
              <div className="post-title-row">
                {post.pinned ? (
                  <span className="post-pin-badge" title="全局置顶">全局置顶</span>
                ) : null}
                {post.board_pinned ? (
                  <span className="post-pin-badge post-pin-badge--board" title="板块置顶">板块置顶</span>
                ) : null}
                {post.featured ? <span className="post-feature-badge" title="推荐">推荐</span> : null}
                {post.status === 'pending' ? (
                  <span className="post-status-badge post-status-badge--pending" title="审核中">审核中</span>
                ) : null}
                {post.status === 'rejected' ? (
                  <span className="post-status-badge post-status-badge--rejected" title="未通过">未通过</span>
                ) : null}
                <span className="post-title">{post.title}</span>
                {hasTypeBadge ? (
                  <span className="post-title-type-badges">
                    {post.post_type === 'question' ? (
                      <span
                        className={`post-qa-badge${post.question_resolved ? ' post-qa-badge--resolved' : ' post-qa-badge--open'}`}
                        title={post.question_resolved ? '已解决' : '未解决'}
                      >
                        {post.question_resolved ? '已解决' : '未解决'}
                      </span>
                    ) : null}
                    {post.post_type === 'poll' ? (
                      <span className="post-type-badge post-type-badge--poll" title="投票">投票</span>
                    ) : null}
                    {post.post_type === 'bounty' && post.bounty_status === 'open' && (post.bounty_points ?? 0) > 0 ? (
                      <span className="post-bounty-badge post-bounty-badge--open" title="悬赏">
                        悬赏 {post.bounty_points}
                      </span>
                    ) : null}
                    {post.post_type === 'bounty' && post.bounty_status === 'awarded' ? (
                      <span className="post-bounty-badge post-bounty-badge--awarded" title="已采纳">已采纳</span>
                    ) : null}
                    {post.post_type === 'lottery' ? (
                      <span className="post-type-badge post-type-badge--lottery" title="抽奖">
                        {post.lottery_status === 'drawn' ? '已开奖' : '抽奖'}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            );

            const metaLeft = (
              <div className="post-meta-left">
                {boardId === 0 && post.board?.id ? (
                  <span className="post-list-board-btn">
                    <span
                      className={`post-list-board-badge board-badge board-badge--${getBoardThemeIndex(post.board)}`}
                    >
                      {post.board.name}
                    </span>
                  </span>
                ) : null}
                <span className="post-meta-author">{author}</span>
                <span className="post-meta-sep post-meta-sep--before-time" aria-hidden>·</span>
                <span className="post-meta-time post-meta-time--created">{timeLabel}</span>
                {showLastReply ? (
                  <span className="post-meta-last-reply">
                    <span className="post-meta-last-reply-arrow" aria-hidden>←</span>
                    {/* 外层是 <a class="post-row">，禁止嵌套 a */}
                    <span className="post-meta-last-reply-user">{lastReplyName}</span>
                    <span className="post-meta-last-reply-time">{formatTime(post.last_reply_at!)}</span>
                  </span>
                ) : null}
              </div>
            );

            const stats = (
              <div className="post-stats">
                <span
                  className={`post-stat${commentCount === 0 ? ' post-stat--zero' : ''}`}
                  title="评论"
                >
                  <MessageCircle aria-hidden />
                  {commentCount}
                </span>
              </div>
            );

            return (
              <a key={post.id} className={rowClass} href={href}>
                {post.user?.avatar ? (
                  <span className="post-avatar user-link--avatar-only">
                    <img src={post.user.avatar} alt="" loading="lazy" decoding="async" />
                  </span>
                ) : (
                  <span className="post-avatar user-link--avatar-only">{initial}</span>
                )}
                {thumb ? (
                  <div className="post-main post-main--with-thumb">
                    <div className="post-content">
                      {titleRow}
                      {excerpt ? <p className="post-excerpt">{excerpt}</p> : null}
                      <div className="post-meta post-meta--inline">
                        {metaLeft}
                        {stats}
                      </div>
                    </div>
                    <div className="post-aside">
                      <div className="post-thumb" aria-hidden>
                        <img src={thumb} alt="" loading="lazy" decoding="async" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="post-main">
                    <div className="post-text">
                      {titleRow}
                      {excerpt ? <p className="post-excerpt">{excerpt}</p> : null}
                    </div>
                    <div className="post-meta">
                      {metaLeft}
                      {stats}
                    </div>
                  </div>
                )}
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
