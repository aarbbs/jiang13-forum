import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  AtSign,
  Bell,
  CheckCheck,
  Flag,
  Inbox,
  Mail,
  MessageCircleReply,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { MessageConversation, PrivateMessage, User } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { loginPath } from '../utils/authRedirect';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import { formatDateTime, formatTime } from '../utils/content';
import { postPath } from '../utils/permalink';
import { userPath } from '../utils/userPath';
import { InFlowSiteFooter } from '../components/SiteFooter';
import { cn } from '@/lib/utils';
import { getSessionSnapshot, setSessionSnapshot, deleteSessionSnapshot } from '../utils/sessionPageCache';
import { PAGE_FORCE_REFRESH_EVENT } from '../utils/feedCache';
import { PAGE_SOFT_REFRESH_COMMIT_EVENT } from '../utils/softRefresh';

type MsgTab = 'dm' | 'notify';
type ConvSnap = { conversations: MessageConversation[]; total: number; page: number };
type ThreadSnap = { messages: PrivateMessage[]; total: number; peerUser: User | null };

const NOTIFY_KINDS = [
  { key: 'all', label: '全部' },
  { key: 'reply', label: '回复' },
  { key: 'mention', label: '@提及' },
  { key: 'moderation', label: '待审' },
  { key: 'reject', label: '未通过' },
  { key: 'report_result', label: '举报' },
  { key: 'system', label: '系统' },
] as const;

function kindLabel(kind: string, relatedStatus?: string) {
  if (kind === 'moderation') {
    if (relatedStatus && relatedStatus !== 'pending') return '审核';
    return '待审';
  }
  switch (kind) {
    case 'reject': return '未通过';
    case 'report_result': return '举报结果';
    case 'reply': return '回复提醒';
    case 'mention': return '@提及';
    case 'system': return '系统通知';
    default: return '通知';
  }
}

function statusLabel(status?: string) {
  switch (status) {
    case 'pending': return '待审';
    case 'published': return '已通过';
    case 'rejected': return '未通过';
    case 'deleted': return '已删除';
    default: return '';
  }
}

/** 仍待处理的审核通知（无状态按待审处理，兼容未回填） */
function isPendingModeration(m: PrivateMessage) {
  return m.kind === 'moderation' && (!m.related_status || m.related_status === 'pending');
}

function KindIcon({ kind }: { kind: string }) {
  const props = { size: 15, 'aria-hidden': true as const };
  switch (kind) {
    case 'reply': return <MessageCircleReply {...props} />;
    case 'mention': return <AtSign {...props} />;
    case 'moderation': return <ShieldAlert {...props} />;
    case 'reject': return <XCircle {...props} />;
    case 'report_result': return <Flag {...props} />;
    default: return <Bell {...props} />;
  }
}

/** 按通知类型生成跳转目标与 CTA 文案（待审跳前台帖/楼层） */
function notifyTarget(m: PrivateMessage): { to: string; label: string } | null {
  const postID = m.related_post_id;
  const commentID = m.related_comment_id;
  const floor = m.related_floor && m.related_floor > 0 ? m.related_floor : 0;
  const looksLikeComment =
    (m.subject || '').includes('评论') || (m.content || '').includes('评论');

  if (m.kind === 'moderation') {
    if (!postID) return null;
    const isComment = !!commentID || looksLikeComment;
    const path = isComment && floor > 0
      ? `${postPath(postID)}#floor-${floor}`
      : postPath(postID);
    const pending = isPendingModeration(m);
    if (isComment) {
      return { to: path, label: pending ? '去审核评论' : '查看评论' };
    }
    return { to: path, label: pending ? '去审核帖子' : '查看帖子' };
  }

  if (postID) {
    const path = floor > 0 ? `${postPath(postID)}#floor-${floor}` : postPath(postID);
    if (m.kind === 'reply' || m.kind === 'mention') {
      return { to: path, label: floor > 0 ? '查看回复' : '查看帖子' };
    }
    if (m.kind === 'reject' && (commentID || looksLikeComment)) {
      return { to: path, label: '查看评论' };
    }
    if (m.kind === 'report_result' && floor > 0) {
      return { to: path, label: '查看评论' };
    }
    return { to: path, label: '查看帖子' };
  }

  return null;
}

function peerTitle(conv: MessageConversation | null, peerUser: User | null | undefined, peerId: number) {
  if (peerId === 0 || conv?.is_system) return '系统通知';
  return peerUser?.nickname || conv?.peer_user?.nickname || `用户 #${peerId}`;
}

function peerInitial(name: string) {
  return name.trim().charAt(0) || '?';
}

function previewText(msg?: PrivateMessage) {
  if (!msg) return '暂无消息';
  const text = (msg.content || msg.subject || '').replace(/\s+/g, ' ').trim();
  return text || msg.subject || '暂无消息';
}

function AvatarBubble({
  name,
  avatar,
  system,
}: {
  name: string;
  avatar?: string;
  system?: boolean;
}) {
  if (system) {
    return (
      <span className="pm-avatar pm-avatar--system" aria-hidden>
        <Bell size={14} />
      </span>
    );
  }
  if (avatar) {
    return <img src={avatar} alt="" className="pm-avatar" loading="lazy" decoding="async" />;
  }
  return <span className="pm-avatar pm-avatar--fallback">{peerInitial(name)}</span>;
}

function parseTab(raw: string | null, peer: string | null): MsgTab {
  if (peer !== null && peer !== '') return 'dm';
  return raw === 'notify' ? 'notify' : 'dm';
}

export default function MessagesPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  useNoIndexSEO('站内消息');

  const peerParam = params.get('peer');
  const tab = parseTab(params.get('tab'), peerParam);
  const selectedPeer = peerParam === null || peerParam === ''
    ? null
    : Number(peerParam);
  const peerSelected = tab === 'dm' && selectedPeer !== null && !Number.isNaN(selectedPeer);
  const notifyKind = params.get('kind') || 'all';

  const [conversations, setConversations] = useState<MessageConversation[]>([]);
  const [convTotal, setConvTotal] = useState(0);
  const [convPage, setConvPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);

  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [peerUser, setPeerUser] = useState<User | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [notifications, setNotifications] = useState<PrivateMessage[]>([]);
  const [notifyTotal, setNotifyTotal] = useState(0);
  const [notifyPage, setNotifyPage] = useState(1);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyUnread, setNotifyUnread] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const notifyLoadSeq = useRef(0);

  const dmConversations = useMemo(
    () => conversations.filter((c) => !c.is_system && c.peer_user_id > 0),
    [conversations],
  );

  const visibleNotifications = useMemo(
    () => (unreadOnly ? notifications.filter((m) => !m.is_read) : notifications),
    [notifications, unreadOnly],
  );

  const refreshUnreadSplit = useCallback(async () => {
    try {
      const r = await api.messageUnreadCount();
      setDmUnread(r.dm_count ?? 0);
      setNotifyUnread(r.notify_count ?? 0);
    } catch {
      // ignore
    }
  }, []);

  const loadConversations = useCallback(async (page = 1, append = false) => {
    const key = `messages:conv:${page}`;
    if (!append) {
      const hit = getSessionSnapshot<ConvSnap>(key);
      if (hit) {
        setConversations(hit.conversations);
        setConvTotal(hit.total);
        setConvPage(hit.page);
        setListLoading(false);
        return;
      }
    }
    setListLoading(true);
    try {
      const r = await api.messageConversations({ page, size: 30 });
      const next = r.conversations || [];
      setConversations((prev) => {
        const merged = append ? [...prev, ...next] : next;
        if (!append) {
          setSessionSnapshot(key, { conversations: merged, total: r.total || 0, page: r.page || page });
        }
        return merged;
      });
      setConvTotal(r.total || 0);
      setConvPage(r.page || page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setListLoading(false);
    }
  }, []);

  // 通知列表不走 session 短路，保证 related_status 实时
  const loadNotifications = useCallback(async (page = 1, append = false, kind = 'all') => {
    const seq = ++notifyLoadSeq.current;
    setNotifyLoading(true);
    try {
      const r = await api.messageNotifications({
        page,
        size: 30,
        kind: kind === 'all' ? undefined : kind,
      });
      if (seq !== notifyLoadSeq.current) return;
      const next = r.notifications || [];
      setNotifyTotal(r.total || 0);
      setNotifyPage(r.page || page);
      setNotifications((prev) => (append ? [...prev, ...next] : next));
    } catch (e: unknown) {
      if (seq !== notifyLoadSeq.current) return;
      notify.error(e instanceof Error ? e.message : '加载通知失败');
    } finally {
      if (seq === notifyLoadSeq.current) setNotifyLoading(false);
    }
  }, []);

  const [threadEpoch, setThreadEpoch] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      nav(loginPath('/messages'));
      return;
    }
    void refreshUnreadSplit();
    if (tab === 'dm') {
      loadConversations(1);
    } else {
      loadNotifications(1, false, notifyKind);
    }
  }, [user, authLoading, nav, tab, notifyKind, loadConversations, loadNotifications, refreshUnreadSplit]);

  useEffect(() => {
    const onForce = () => {
      void refreshUnreadSplit();
      if (tab === 'dm') {
        void loadConversations(1);
        if (peerSelected && selectedPeer !== null) {
          deleteSessionSnapshot(`messages:thread:${selectedPeer}`);
          setThreadEpoch(n => n + 1);
        }
      } else {
        void loadNotifications(1, false, notifyKind);
      }
    };
    window.addEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
    window.addEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onForce);
    return () => {
      window.removeEventListener(PAGE_FORCE_REFRESH_EVENT, onForce);
      window.removeEventListener(PAGE_SOFT_REFRESH_COMMIT_EVENT, onForce);
    };
  }, [tab, notifyKind, peerSelected, selectedPeer, loadConversations, loadNotifications, refreshUnreadSplit]);

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      threadEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    });
  }, []);

  useEffect(() => {
    if (!user || !peerSelected || selectedPeer === null) {
      setMessages([]);
      setPeerUser(null);
      setMsgTotal(0);
      return;
    }
    const cached = getSessionSnapshot<ThreadSnap>(`messages:thread:${selectedPeer}`);
    if (cached) {
      setMessages(cached.messages);
      setMsgTotal(cached.total);
      setPeerUser(cached.peerUser);
      setThreadLoading(false);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    stickToBottomRef.current = true;
    api.conversationMessages(selectedPeer, { size: 50 })
      .then((r) => {
        if (cancelled) return;
        const messages = r.messages || [];
        const peer = r.peer_user || null;
        setMessages(messages);
        setMsgTotal(r.total || 0);
        setPeerUser(peer);
        setSessionSnapshot(`messages:thread:${selectedPeer}`, {
          messages,
          total: r.total || 0,
          peerUser: peer,
        });
        setConversations((prev) => prev.map((c) => (
          c.peer_user_id === selectedPeer ? { ...c, unread_count: 0 } : c
        )));
        window.dispatchEvent(new Event('messages-unread-refresh'));
        void refreshUnreadSplit();
      })
      .catch((e: unknown) => {
        if (!cancelled) notify.error(e instanceof Error ? e.message : '加载会话失败');
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, peerSelected, selectedPeer, refreshUnreadSplit, threadEpoch]);

  useEffect(() => {
    if (!threadLoading && stickToBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages, threadLoading, scrollToBottom]);

  const setTab = (next: MsgTab) => {
    const p = new URLSearchParams();
    if (next === 'notify') {
      p.set('tab', 'notify');
      if (notifyKind !== 'all') p.set('kind', notifyKind);
    }
    setParams(p, { replace: true });
    setDraft('');
  };

  const setKind = (kind: string) => {
    const p = new URLSearchParams();
    p.set('tab', 'notify');
    if (kind !== 'all') p.set('kind', kind);
    setParams(p, { replace: true });
  };

  const openPeer = (peerId: number) => {
    const p = new URLSearchParams();
    p.set('tab', 'dm');
    p.set('peer', String(peerId));
    setParams(p, { replace: true });
    setDraft('');
  };

  const closeThread = () => {
    const p = new URLSearchParams();
    p.set('tab', 'dm');
    setParams(p, { replace: true });
    setDraft('');
  };

  const markAll = async () => {
    try {
      if (tab === 'notify') {
        await api.markNotificationsRead();
        setNotifications((prev) => prev.map((m) => ({ ...m, is_read: true })));
        setNotifyUnread(0);
        notify.success('通知已全部标为已读');
      } else {
        await api.markAllMessagesRead();
        setConversations((prev) => prev.map((c) => ({ ...c, unread_count: 0 })));
        setDmUnread(0);
        setNotifyUnread(0);
        notify.success('已全部标为已读');
      }
      window.dispatchEvent(new Event('messages-unread-refresh'));
      void refreshUnreadSplit();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const openNotification = async (m: PrivateMessage) => {
    const target = notifyTarget(m);
    if (!m.is_read) {
      setNotifications((prev) => prev.map((item) => (item.id === m.id ? { ...item, is_read: true } : item)));
      setNotifyUnread((n) => Math.max(0, n - 1));
      api.markMessageRead(m.id)
        .then(() => {
          window.dispatchEvent(new Event('messages-unread-refresh'));
          void refreshUnreadSplit();
        })
        .catch(() => undefined);
    }
    if (target) {
      nav(target.to);
    }
  };

  const loadOlder = async () => {
    if (!peerSelected || selectedPeer === null || messages.length === 0) return;
    const oldest = messages[0]?.id;
    if (!oldest) return;
    setLoadingOlder(true);
    const el = threadScrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const r = await api.conversationMessages(selectedPeer, { size: 40, before: oldest });
      const older = r.messages || [];
      if (older.length === 0) return;
      stickToBottomRef.current = false;
      setMessages((prev) => [...older, ...prev]);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    if (!peerSelected || selectedPeer === null || selectedPeer === 0) return;
    const content = draft.trim();
    if (!content) {
      notify.warning('请填写内容');
      return;
    }
    setSending(true);
    try {
      const r = await api.sendMessage({ to_user_id: selectedPeer, content });
      stickToBottomRef.current = true;
      setMessages((prev) => {
        const next = [...prev, r.message];
        if (selectedPeer != null) {
          setSessionSnapshot(`messages:thread:${selectedPeer}`, {
            messages: next,
            total: msgTotal + 1,
            peerUser,
          });
        }
        return next;
      });
      setMsgTotal((n) => n + 1);
      setDraft('');
      setConversations((prev) => {
        const rest = prev.filter((c) => c.peer_user_id !== selectedPeer);
        const existing = prev.find((c) => c.peer_user_id === selectedPeer);
        const next: MessageConversation = {
          peer_user_id: selectedPeer,
          peer_user: peerUser || existing?.peer_user,
          is_system: false,
          last_message: r.message,
          unread_count: 0,
          updated_at: r.message.created_at,
        };
        const merged = [next, ...rest];
        setSessionSnapshot('messages:conv:1', { conversations: merged, total: convTotal, page: 1 });
        return merged;
      });
      scrollToBottom(true);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  if (authLoading || (tab === 'dm' && listLoading && conversations.length === 0 && !peerSelected)) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }
  if (!user) return null;

  const activeConv = peerSelected && selectedPeer !== null
    ? conversations.find((c) => c.peer_user_id === selectedPeer) || null
    : null;
  const title = peerSelected && selectedPeer !== null
    ? peerTitle(activeConv, peerUser, selectedPeer)
    : '';
  const canCompose = peerSelected && selectedPeer !== null && selectedPeer > 0;
  const unreadForTab = tab === 'notify' ? notifyUnread : dmUnread;

  return (
    <div className="page-wrap">
      <div className="page-inner-wide">
        <div className="pm-page-head">
          <div>
            <h1 className="page-title">站内消息</h1>
            <p className="page-desc">点开才标已读；待审可直达帖内位置</p>
          </div>
          {unreadForTab > 0 && (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck size={14} />
              {tab === 'notify' ? '通知全部已读' : '全部已读'}
            </Button>
          )}
        </div>

        <div className="pm-workspace content-surface">
          <div className="pm-tabs" role="tablist" aria-label="消息类型">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'dm'}
              className={cn('pm-tab', tab === 'dm' && 'active')}
              onClick={() => setTab('dm')}
            >
              <Mail size={15} aria-hidden />
              私信
              {dmUnread > 0 && <span className="pm-tab__badge">{dmUnread > 99 ? '99+' : dmUnread}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'notify'}
              className={cn('pm-tab', tab === 'notify' && 'active')}
              onClick={() => setTab('notify')}
            >
              <Bell size={15} aria-hidden />
              通知
              {notifyUnread > 0 && <span className="pm-tab__badge">{notifyUnread > 99 ? '99+' : notifyUnread}</span>}
            </button>
          </div>

          {tab === 'notify' ? (
            <div className="pm-notify">
              <div className="pm-notify-toolbar">
                <div className="pm-notify-filters" role="tablist" aria-label="通知类型">
                  {NOTIFY_KINDS.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      role="tab"
                      aria-selected={notifyKind === k.key}
                      className={cn(
                        'pm-notify-filter',
                        notifyKind === k.key && 'active',
                      )}
                      onClick={() => setKind(k.key)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={cn('pm-notify-unread-toggle', unreadOnly && 'active')}
                  aria-pressed={unreadOnly}
                  onClick={() => setUnreadOnly((v) => !v)}
                >
                  只看未读
                </button>
              </div>

              {notifyLoading && notifications.length === 0 ? (
                <div className="flex justify-center py-16"><Spinner /></div>
              ) : visibleNotifications.length === 0 ? (
                <div className="pm-empty">
                  <Bell size={28} strokeWidth={1.5} aria-hidden />
                  <p>{unreadOnly ? '没有未读通知' : '暂无通知'}</p>
                  <span>{unreadOnly ? '切换筛选查看全部通知' : '有人回复你、审核结果等会出现在这里'}</span>
                </div>
              ) : (
                <ul className="pm-notify-list">
                  {visibleNotifications.map((m) => {
                    const target = notifyTarget(m);
                    const pendingMod = isPendingModeration(m);
                    const st = statusLabel(m.related_status);
                    const clickable = !!target || !m.is_read;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className={cn(
                            'pm-notify-item',
                            !m.is_read && 'unread',
                            pendingMod && 'pm-notify-item--moderation',
                            clickable && 'pm-notify-item--clickable',
                          )}
                          onClick={() => void openNotification(m)}
                          disabled={!clickable}
                        >
                          <span className="pm-notify-item__icon" aria-hidden>
                            <KindIcon kind={m.kind} />
                          </span>
                          <div className="pm-notify-item__body">
                            <div className="pm-notify-item__top">
                              <span className="pm-notify-item__kind">
                                {kindLabel(m.kind, m.related_status)}
                              </span>
                              {m.kind === 'moderation' && st && m.related_status && m.related_status !== 'pending' && (
                                <span className={cn('pm-notify-status', `pm-notify-status--${m.related_status}`)}>
                                  {st}
                                </span>
                              )}
                              {!m.is_read && <span className="pm-notify-item__dot" aria-label="未读" />}
                              <time className="pm-notify-item__time">{formatTime(m.created_at)}</time>
                            </div>
                            {m.subject && <div className="pm-notify-item__subject">{m.subject}</div>}
                            <div className="pm-notify-item__text">{m.content}</div>
                            {target && (
                              <span className="pm-notify-item__cta">{target.label} →</span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {notifyTotal > notifications.length && (
                <div className="pm-list-more">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={notifyLoading}
                    onClick={() => loadNotifications(notifyPage + 1, true, notifyKind)}
                  >
                    加载更多通知
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className={cn('pm-layout', peerSelected && 'pm-layout--thread')}>
              <aside className="pm-list" aria-label="会话列表">
                {listLoading && dmConversations.length === 0 ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : dmConversations.length === 0 ? (
                  <div className="pm-empty">
                    <Inbox size={28} strokeWidth={1.5} aria-hidden />
                    <p>还没有私信</p>
                    <span>在用户主页点击「发私信」开始对话</span>
                  </div>
                ) : (
                  dmConversations.map((c) => {
                    const name = peerTitle(c, c.peer_user, c.peer_user_id);
                    const active = peerSelected && selectedPeer === c.peer_user_id;
                    return (
                      <button
                        key={c.peer_user_id}
                        type="button"
                        className={cn('pm-conv-item', active && 'active', c.unread_count > 0 && 'unread')}
                        onClick={() => openPeer(c.peer_user_id)}
                      >
                        <AvatarBubble name={name} avatar={c.peer_user?.avatar} />
                        <div className="pm-conv-item__body">
                          <div className="pm-conv-item__top">
                            <span className="pm-conv-item__name">{name}</span>
                            <span className="pm-conv-item__time">
                              {formatDateTime(c.last_message?.created_at || c.updated_at)}
                            </span>
                          </div>
                          <div className="pm-conv-item__preview">
                            <span>{previewText(c.last_message)}</span>
                            {c.unread_count > 0 && (
                              <span className="pm-conv-item__badge">
                                {c.unread_count > 99 ? '99+' : c.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
                {convTotal > conversations.length && (
                  <div className="pm-list-more">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={listLoading}
                      onClick={() => loadConversations(convPage + 1, true)}
                    >
                      加载更多会话
                    </Button>
                  </div>
                )}
              </aside>

              <section className="pm-thread" aria-label="会话内容">
                {!peerSelected || selectedPeer === null ? (
                  <div className="pm-empty pm-empty--thread">
                    <Send size={32} strokeWidth={1.4} aria-hidden />
                    <p>选择左侧会话开始聊天</p>
                    <span>系统通知请切换到「通知」页签</span>
                  </div>
                ) : (
                  <>
                    <header className="pm-thread-head">
                      <button type="button" className="pm-thread-back" onClick={closeThread} aria-label="返回会话列表">
                        <ArrowLeft size={18} />
                      </button>
                      <AvatarBubble
                        name={title}
                        avatar={peerUser?.avatar || activeConv?.peer_user?.avatar}
                      />
                      <div className="pm-thread-head__meta">
                        <Link to={userPath(selectedPeer)} className="pm-thread-head__name">{title}</Link>
                        <span className="pm-thread-head__sub">私信对话</span>
                      </div>
                    </header>

                    <div
                      className="pm-thread-scroll"
                      ref={threadScrollRef}
                      onScroll={(e) => {
                        const t = e.currentTarget;
                        stickToBottomRef.current = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
                      }}
                    >
                      {threadLoading ? (
                        <div className="flex justify-center py-16"><Spinner /></div>
                      ) : (
                        <>
                          {msgTotal > messages.length && (
                            <div className="pm-thread-older">
                              <Button variant="ghost" size="sm" loading={loadingOlder} onClick={loadOlder}>
                                查看更早消息
                              </Button>
                            </div>
                          )}
                          {messages.length === 0 ? (
                            <div className="pm-empty">还没有消息，打个招呼吧</div>
                          ) : (
                            messages.map((m) => {
                              const mine = m.from_user_id === user.id;
                              return (
                                <div
                                  key={m.id}
                                  className={cn('pm-bubble-row', mine && 'pm-bubble-row--mine')}
                                >
                                  <div className={cn('pm-bubble', mine && 'pm-bubble--mine')}>
                                    <div className="pm-bubble__text">{m.content}</div>
                                    <div className="pm-bubble__meta">
                                      <time>{formatDateTime(m.created_at)}</time>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={threadEndRef} />
                        </>
                      )}
                    </div>

                    {canCompose && (
                      <footer className="pm-composer">
                        <textarea
                          className="pm-composer__input"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={2}
                          maxLength={4000}
                          placeholder={`发送给 ${title}…`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void send();
                            }
                          }}
                        />
                        <Button
                          className="pm-composer__send"
                          loading={sending}
                          disabled={!draft.trim()}
                          onClick={() => void send()}
                        >
                          <Send size={16} />
                          发送
                        </Button>
                      </footer>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
        <InFlowSiteFooter />
      </div>
    </div>
  );
}
