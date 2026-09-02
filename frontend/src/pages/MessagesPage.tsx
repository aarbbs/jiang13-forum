import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  AtSign,
  Bell,
  CheckCheck,
  Flag,
  ImagePlus,
  Inbox,
  Mail,
  MessageCircleReply,
  Search,
  Send,
  ShieldAlert,
  Smile,
  X,
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
import { formatConvListTime, formatDateTime, formatTime } from '../utils/content';
import { postPath } from '../utils/permalink';
import { userPath } from '../utils/userPath';
import { InFlowSiteFooter } from '../components/SiteFooter';
import StickerPicker from '../components/emoji/StickerPicker';
import type { Sticker } from '../data/stickers';
import PmComposerInput, { isPmStickerSrc, type PmComposerInputHandle } from '../components/PmComposerInput';
import { ArticleImagePickerDialog } from '../components/editor/ArticleImagePickerDialog';
import { Tooltip } from '../components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { getSessionSnapshot, setSessionSnapshot, deleteSessionSnapshot } from '../utils/sessionPageCache';
import { PAGE_FORCE_REFRESH_EVENT } from '../utils/feedCache';
import { PAGE_SOFT_REFRESH_COMMIT_EVENT } from '../utils/softRefresh';

type MsgTab = 'dm' | 'notify';
type ConvSnap = { conversations: MessageConversation[]; total: number; page: number };
type ThreadSnap = { messages: PrivateMessage[]; total: number; peerUser: User | null };
type PmDraftEmbed = { id: string; url: string; name: string };
type PmDraft = { text: string; embeds: PmDraftEmbed[] };

function newEmbedId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function serializePmDraft(text: string, embeds: PmDraftEmbed[]) {
  const trimmed = text.trim();
  const parts = [
    ...(trimmed ? [trimmed] : []),
    ...embeds.map((e) => `![${e.name}](${e.url})`),
  ];
  return parts.join('\n');
}

function isDraftEmpty(text: string, embeds: PmDraftEmbed[]) {
  return !text.trim() && embeds.length === 0;
}

/** 搜索/主页跳转用的对方用户摘要 → User */
function toPeerUser(u: { id: number; username: string; nickname: string; avatar?: string }): User {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    avatar: u.avatar || '',
    role: 'user',
  };
}

function makePendingConversation(peer: User): MessageConversation {
  return {
    peer_user_id: peer.id,
    peer_user: peer,
    is_system: false,
    unread_count: 0,
    updated_at: new Date().toISOString(),
  };
}

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

/** 私信气泡：纯文本 + 简易 markdown 图片 `![alt](url)` */
function PmBubbleContent({ content }: { content: string }) {
  const parts = content.split(/(!\[[^\]]*]\([^)]+\))/g);
  return (
    <div className="pm-bubble__text">
      {parts.map((part, i) => {
        const m = part.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
        if (m) {
          const sticker = isPmStickerSrc(m[2]);
          return (
            <img
              key={i}
              className={sticker ? 'pm-bubble__sticker' : 'pm-bubble__img'}
              src={m[2]}
              alt={m[1] || (sticker ? '表情' : '图片')}
              loading="lazy"
            />
          );
        }
        return part ? <span key={i}>{part}</span> : null;
      })}
    </div>
  );
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
  const raw = (msg.content || msg.subject || '').trim();
  if (!raw) return msg.subject || '暂无消息';
  const text = raw
    .replace(/!\[[^\]]*]\([^)]+\)/g, '[图片]')
    .replace(/\s+/g, ' ')
    .trim();
  return text || msg.subject || '暂无消息';
}

function AvatarBubble({
  name,
  avatar,
  system,
  className,
}: {
  name: string;
  avatar?: string;
  system?: boolean;
  className?: string;
}) {
  if (system) {
    return (
      <span className={cn('pm-avatar pm-avatar--system', className)} aria-hidden>
        <Bell size={14} />
      </span>
    );
  }
  if (avatar) {
    return <img src={avatar} alt="" className={cn('pm-avatar', className)} loading="lazy" decoding="async" />;
  }
  return <span className={cn('pm-avatar pm-avatar--fallback', className)}>{peerInitial(name)}</span>;
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
  const [draftText, setDraftText] = useState('');
  const [draftEmbeds, setDraftEmbeds] = useState<PmDraftEmbed[]>([]);
  const [showSticker, setShowSticker] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const composerRef = useRef<PmComposerInputHandle>(null);
  const draftsByPeerRef = useRef<Map<number, PmDraft>>(new Map());
  const draftPeerRef = useRef<number | null>(null);
  const draftTextRef = useRef(draftText);
  const draftEmbedsRef = useRef(draftEmbeds);
  const [sending, setSending] = useState(false);

  const [convSearchQuery, setConvSearchQuery] = useState('');
  const [convSearchResults, setConvSearchResults] = useState<User[]>([]);
  const [convSearchLoading, setConvSearchLoading] = useState(false);
  const [convSearchOpen, setConvSearchOpen] = useState(false);
  const convSearchSeq = useRef(0);
  const convSearchBlurTimer = useRef<number | null>(null);

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

  useEffect(() => {
    draftTextRef.current = draftText;
  }, [draftText]);

  useEffect(() => {
    draftEmbedsRef.current = draftEmbeds;
  }, [draftEmbeds]);

  const updateDraftText = useCallback((next: string | ((prev: string) => string)) => {
    setDraftText((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      draftTextRef.current = value;
      return value;
    });
  }, []);

  const updateDraftEmbeds = useCallback((next: PmDraftEmbed[] | ((prev: PmDraftEmbed[]) => PmDraftEmbed[])) => {
    setDraftEmbeds((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      draftEmbedsRef.current = value;
      return value;
    });
  }, []);

  const dmConversations = useMemo(
    () => conversations.filter((c) => !c.is_system && c.peer_user_id > 0),
    [conversations],
  );

  /** 将会话加入左侧列表（无历史消息时也显示，类似飞书「发起会话」） */
  const ensurePeerConversation = useCallback((peer: User) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.peer_user_id === peer.id);
      if (idx >= 0) {
        const cur = prev[idx];
        if (cur.peer_user) return prev;
        const next = [...prev];
        next[idx] = { ...cur, peer_user: peer };
        return next;
      }
      return [makePendingConversation(peer), ...prev];
    });
  }, []);

  /** 更新会话未读数，同时同步 session 缓存防止后续恢复 stale 数据 */
  const updateConvUnread = useCallback((peerId: number, unread: number) => {
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.peer_user_id === peerId ? { ...c, unread_count: unread } : c
      );
      const cached = getSessionSnapshot<ConvSnap>('messages:conv:1');
      if (cached) {
        setSessionSnapshot('messages:conv:1', {
          ...cached,
          conversations: next,
        });
      }
      return next;
    });
  }, []);

  const clearConvSearch = useCallback(() => {
    setConvSearchQuery('');
    setConvSearchResults([]);
    setConvSearchOpen(false);
  }, []);

  const selectSearchUser = useCallback((peer: User) => {
    ensurePeerConversation(peer);
    clearConvSearch();
    setShowSticker(false);
    setImagePickerOpen(false);
    const p = new URLSearchParams();
    p.set('tab', 'dm');
    p.set('peer', String(peer.id));
    setParams(p, { replace: true });
  }, [clearConvSearch, ensurePeerConversation, setParams]);

  /** 切换会话：缓存当前草稿、恢复目标草稿，并关闭表情/图片面板 */
  useEffect(() => {
    setShowSticker(false);
    setImagePickerOpen(false);

    const prev = draftPeerRef.current;
    const nextPeer = peerSelected && selectedPeer !== null ? selectedPeer : null;

    if (prev != null && prev !== nextPeer) {
      const text = draftTextRef.current;
      const embeds = draftEmbedsRef.current;
      if (isDraftEmpty(text, embeds)) {
        draftsByPeerRef.current.delete(prev);
      } else {
        draftsByPeerRef.current.set(prev, { text, embeds });
      }
    }

    draftPeerRef.current = nextPeer;
    if (nextPeer != null) {
      const saved = draftsByPeerRef.current.get(nextPeer);
      const text = saved?.text ?? '';
      const embeds = saved?.embeds ?? [];
      draftTextRef.current = text;
      draftEmbedsRef.current = embeds;
      setDraftText(text);
      setDraftEmbeds(embeds);
    } else {
      draftTextRef.current = '';
      draftEmbedsRef.current = [];
      setDraftText('');
      setDraftEmbeds([]);
    }
  }, [peerSelected, selectedPeer]);

  /** 搜索用户（发起新会话） */
  useEffect(() => {
    const q = convSearchQuery.trim();
    if (!q) {
      setConvSearchResults([]);
      setConvSearchLoading(false);
      return;
    }
    const seq = ++convSearchSeq.current;
    setConvSearchLoading(true);
    const timer = window.setTimeout(() => {
      api.searchUsers(q, 8)
        .then((r) => {
          if (seq !== convSearchSeq.current) return;
          const list = (r.users || [])
            .filter((u) => u.id !== user?.id)
            .map(toPeerUser);
          setConvSearchResults(list);
        })
        .catch(() => {
          if (seq !== convSearchSeq.current) return;
          setConvSearchResults([]);
        })
        .finally(() => {
          if (seq === convSearchSeq.current) setConvSearchLoading(false);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [convSearchQuery, user?.id]);

  /** URL 指定 peer 但列表尚无该会话时，补入列表并预载用户信息 */
  useEffect(() => {
    if (!user || !peerSelected || selectedPeer === null || selectedPeer <= 0) return;
    const hit = conversations.find((c) => c.peer_user_id === selectedPeer);
    if (hit?.peer_user) {
      setPeerUser((prev) => prev ?? hit.peer_user!);
      return;
    }
    let cancelled = false;
    api.userProfile(selectedPeer)
      .then((r) => {
        if (cancelled) return;
        const peer = toPeerUser(r.user);
        ensurePeerConversation(peer);
        setPeerUser((prev) => prev ?? peer);
      })
      .catch(() => {
        if (cancelled) return;
        ensurePeerConversation({
          id: selectedPeer,
          username: `user${selectedPeer}`,
          nickname: `用户 #${selectedPeer}`,
          avatar: '',
          role: 'user',
        });
      });
    return () => { cancelled = true; };
  }, [user, peerSelected, selectedPeer, conversations, ensurePeerConversation]);

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
      if (cached.peerUser) ensurePeerConversation(cached.peerUser);
      setThreadLoading(false);
      // 缓存命中时仍需标记后端已读，并更新前端会话列表未读数
      void api.markConversationRead(selectedPeer).catch(() => undefined);
      updateConvUnread(selectedPeer, 0);
      window.dispatchEvent(new Event('messages-unread-refresh'));
      void refreshUnreadSplit();
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
        if (peer) ensurePeerConversation(peer);
        setSessionSnapshot(`messages:thread:${selectedPeer}`, {
          messages,
          total: r.total || 0,
          peerUser: peer,
        });
        updateConvUnread(selectedPeer, 0);
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
  }, [user, peerSelected, selectedPeer, refreshUnreadSplit, threadEpoch, ensurePeerConversation]);

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
  };

  const closeThread = () => {
    const p = new URLSearchParams();
    p.set('tab', 'dm');
    setParams(p, { replace: true });
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
        setConversations((prev) => {
          const next = prev.map((c) => ({ ...c, unread_count: 0 }));
          const cached = getSessionSnapshot<ConvSnap>('messages:conv:1');
          if (cached) {
            setSessionSnapshot('messages:conv:1', { ...cached, conversations: next });
          }
          return next;
        });
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
    const content = serializePmDraft(draftTextRef.current, draftEmbedsRef.current);
    if (!content) {
      notify.warning('请填写内容或添加图片');
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
      setDraftText('');
      setDraftEmbeds([]);
      draftTextRef.current = '';
      draftEmbedsRef.current = [];
      draftsByPeerRef.current.delete(selectedPeer);
      setShowSticker(false);
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

  const onPickSticker = useCallback((sticker: Sticker) => {
    if (sticker.type === 'text' && sticker.text) {
      composerRef.current?.insertText(sticker.text);
    } else if (sticker.url) {
      composerRef.current?.insertSticker(sticker);
    }
    setShowSticker(false);
    composerRef.current?.focus();
  }, []);

  const onInsertImages = useCallback((urls: string[]) => {
    if (!urls.length) return;
    updateDraftEmbeds((prev) => [
      ...prev,
      ...urls.map((url) => ({ id: newEmbedId(), url, name: '图片' })),
    ]);
  }, [updateDraftEmbeds]);

  const removeEmbed = useCallback((id: string) => {
    updateDraftEmbeds((prev) => prev.filter((e) => e.id !== id));
  }, [updateDraftEmbeds]);

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

        <div className={cn('pm-workspace content-surface', tab === 'dm' && 'pm-workspace--im')}>
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
                <div className="pm-list-search">
                  <Search size={16} className="pm-list-search__icon" aria-hidden />
                  <input
                    type="search"
                    className="pm-list-search__input"
                    value={convSearchQuery}
                    placeholder="搜索用户…"
                    aria-label="搜索用户发起私信"
                    aria-expanded={convSearchOpen}
                    aria-controls="pm-conv-search-results"
                    onChange={(e) => {
                      setConvSearchQuery(e.target.value);
                      setConvSearchOpen(true);
                    }}
                    onFocus={() => {
                      if (convSearchBlurTimer.current) {
                        window.clearTimeout(convSearchBlurTimer.current);
                        convSearchBlurTimer.current = null;
                      }
                      if (convSearchQuery.trim()) setConvSearchOpen(true);
                    }}
                    onBlur={() => {
                      convSearchBlurTimer.current = window.setTimeout(() => {
                        setConvSearchOpen(false);
                      }, 160);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') clearConvSearch();
                      if (e.key === 'Enter' && convSearchResults[0]) {
                        e.preventDefault();
                        selectSearchUser(convSearchResults[0]);
                      }
                    }}
                  />
                  {convSearchOpen && convSearchQuery.trim() && (
                    <ul
                      id="pm-conv-search-results"
                      className="pm-list-search__dropdown"
                      role="listbox"
                      aria-label="搜索结果"
                    >
                      {convSearchLoading ? (
                        <li className="pm-list-search__empty">
                          <Spinner size="sm" />
                          <span>搜索中…</span>
                        </li>
                      ) : convSearchResults.length === 0 ? (
                        <li className="pm-list-search__empty">未找到用户</li>
                      ) : (
                        convSearchResults.map((u) => (
                          <li key={u.id} role="option">
                            <button
                              type="button"
                              className="pm-list-search__item"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => selectSearchUser(u)}
                            >
                              <AvatarBubble name={u.nickname || u.username} avatar={u.avatar} className="pm-avatar--search" />
                              <span className="pm-list-search__name">{u.nickname || u.username}</span>
                              <span className="pm-list-search__username">@{u.username}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                {listLoading && dmConversations.length === 0 ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : dmConversations.length === 0 ? (
                  <div className="pm-empty">
                    <Inbox size={28} strokeWidth={1.5} aria-hidden />
                    <p>还没有私信</p>
                    <span>搜索用户或在用户主页点击「发私信」</span>
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
                            {c.last_message && (
                              <span className="pm-conv-item__time">
                                {formatConvListTime(c.last_message.created_at || c.updated_at)}
                              </span>
                            )}
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
                        <span className="pm-thread-head__name">{title}</span>
                      </div>
                      <Link to={userPath(selectedPeer)} className="pm-thread-head__profile">主页</Link>
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
                              const peerAvatarUser = m.from_user
                                || peerUser
                                || activeConv?.peer_user;
                              const avatarName = mine
                                ? (user.nickname || user.username || '我')
                                : (peerAvatarUser?.nickname || peerAvatarUser?.username || title);
                              const avatarSrc = mine
                                ? user.avatar
                                : peerAvatarUser?.avatar;
                              const avatar = (
                                <AvatarBubble
                                  name={avatarName}
                                  avatar={avatarSrc}
                                  className="pm-avatar--bubble"
                                />
                              );
                              return (
                                <div
                                  key={m.id}
                                  className={cn('pm-bubble-row', mine && 'pm-bubble-row--mine')}
                                >
                                  {!mine && avatar}
                                  <div className="pm-bubble-stack">
                                    <div className={cn('pm-bubble', mine && 'pm-bubble--mine')}>
                                      <PmBubbleContent content={m.content} />
                                    </div>
                                    <time className="pm-bubble__time">{formatDateTime(m.created_at)}</time>
                                  </div>
                                  {mine && avatar}
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
                        <PmComposerInput
                          ref={composerRef}
                          value={draftText}
                          onChange={updateDraftText}
                          placeholder={`发送给 ${title}…`}
                          onSubmit={() => { void send(); }}
                          disabled={sending}
                        />
                        {draftEmbeds.length > 0 && (
                          <ul className="pm-composer__embeds" aria-label="待发送图片">
                            {draftEmbeds.map((emb) => (
                              <li key={emb.id} className="pm-composer__embed">
                                <img src={emb.url} alt={emb.name} loading="lazy" />
                                <button
                                  type="button"
                                  className="pm-composer__embed-remove"
                                  aria-label={`移除${emb.name}`}
                                  onClick={() => removeEmbed(emb.id)}
                                >
                                  <X size={12} aria-hidden />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="pm-composer__toolbar">
                          <div className="pm-composer__tools">
                            <Tooltip content="表情" side="top">
                              <button
                                type="button"
                                className={cn('pm-composer__tool', showSticker && 'active')}
                                aria-label="表情"
                                aria-pressed={showSticker}
                                onClick={() => {
                                  setImagePickerOpen(false);
                                  setShowSticker((v) => !v);
                                }}
                              >
                                <Smile size={18} aria-hidden />
                              </button>
                            </Tooltip>
                            <Tooltip content="图片" side="top">
                              <button
                                type="button"
                                className="pm-composer__tool"
                                aria-label="图片"
                                onClick={() => {
                                  setShowSticker(false);
                                  setImagePickerOpen(true);
                                }}
                              >
                                <ImagePlus size={18} aria-hidden />
                              </button>
                            </Tooltip>
                          </div>
                          <button
                            type="button"
                            className="pm-composer__send"
                            disabled={isDraftEmpty(draftText, draftEmbeds) || sending}
                            onClick={() => void send()}
                          >
                            {sending ? (
                              <Spinner size="sm" />
                            ) : (
                              <>
                                发送
                                <Send size={14} aria-hidden />
                              </>
                            )}
                          </button>
                        </div>
                        {showSticker && (
                          <div className="pm-composer__picker">
                            <StickerPicker onSelect={onPickSticker} />
                          </div>
                        )}
                        <p className="pm-composer__hint">Enter 发送 · Shift+Enter 换行</p>
                        <ArticleImagePickerDialog
                          open={imagePickerOpen}
                          onOpenChange={setImagePickerOpen}
                          onInsert={onInsertImages}
                        />
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
