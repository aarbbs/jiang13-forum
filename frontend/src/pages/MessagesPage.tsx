import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCheck, Inbox, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { MessageConversation, PrivateMessage, User } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { loginPath } from '../utils/authRedirect';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import { formatTime } from '../utils/content';
import { postPath } from '../utils/permalink';
import { userPath } from '../utils/userPath';
import { InFlowSiteFooter } from '../components/SiteFooter';
import { cn } from '@/lib/utils';

type MsgTab = 'dm' | 'notify';

const NOTIFY_KINDS = [
  { key: 'all', label: '全部' },
  { key: 'reply', label: '回复' },
  { key: 'mention', label: '@提及' },
  { key: 'moderation', label: '待审' },
  { key: 'reject', label: '拒帖' },
  { key: 'report_result', label: '举报' },
  { key: 'system', label: '系统' },
] as const;

function kindLabel(kind: string) {
  switch (kind) {
    case 'reject': return '拒帖通知';
    case 'report_result': return '举报结果';
    case 'reply': return '回复提醒';
    case 'mention': return '@提及';
    case 'moderation': return '待审提醒';
    case 'system': return '系统通知';
    default: return '通知';
  }
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
        <Bell size={16} />
      </span>
    );
  }
  if (avatar) {
    return <img src={avatar} alt="" className="pm-avatar" loading="lazy" decoding="async" />;
  }
  return <span className="pm-avatar pm-avatar--fallback">{peerInitial(name)}</span>;
}

function parseTab(raw: string | null, peer: string | null): MsgTab {
  // 带 peer 时强制私信页（用户主页「发私信」入口）
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

  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const dmConversations = useMemo(
    () => conversations.filter((c) => !c.is_system && c.peer_user_id > 0),
    [conversations],
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
    setListLoading(true);
    try {
      const r = await api.messageConversations({ page, size: 30 });
      const next = r.conversations || [];
      setConversations((prev) => (append ? [...prev, ...next] : next));
      setConvTotal(r.total || 0);
      setConvPage(r.page || page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async (page = 1, append = false, kind = 'all') => {
    setNotifyLoading(true);
    try {
      const r = await api.messageNotifications({
        page,
        size: 30,
        kind: kind === 'all' ? undefined : kind,
      });
      const next = r.notifications || [];
      setNotifyTotal(r.total || 0);
      setNotifyPage(r.page || page);
      // 打开通知页时标已读（首屏）
      if (!append && page === 1) {
        await api.markNotificationsRead().catch(() => undefined);
        setNotifications(next.map((m) => ({ ...m, is_read: true })));
        setNotifyUnread(0);
        window.dispatchEvent(new Event('messages-unread-refresh'));
      } else {
        setNotifications((prev) => (append ? [...prev, ...next] : next));
      }
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载通知失败');
    } finally {
      setNotifyLoading(false);
    }
  }, []);

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
    let cancelled = false;
    setThreadLoading(true);
    stickToBottomRef.current = true;
    api.conversationMessages(selectedPeer, { size: 50 })
      .then((r) => {
        if (cancelled) return;
        setMessages(r.messages || []);
        setMsgTotal(r.total || 0);
        setPeerUser(r.peer_user || null);
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
  }, [user, peerSelected, selectedPeer, refreshUnreadSplit]);

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
      setMessages((prev) => [...prev, r.message]);
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
        return [next, ...rest];
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
        <Button variant="ghost" className="mb-3" onClick={() => nav('/')}>
          <ArrowLeft />
          返回
        </Button>

        <div className="pm-page-head">
          <div>
            <h1 className="page-title">站内消息</h1>
            <p className="page-desc">私信与系统通知分开查看，回复提醒可直达帖子</p>
          </div>
          {unreadForTab > 0 && (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck size={14} />
              {tab === 'notify' ? '通知全部已读' : '全部已读'}
            </Button>
          )}
        </div>

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
          <div className="pm-notify content-surface">
            <div className="pm-notify-filters" role="tablist" aria-label="通知类型">
              {NOTIFY_KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  role="tab"
                  aria-selected={notifyKind === k.key}
                  className={cn('pm-notify-filter', notifyKind === k.key && 'active')}
                  onClick={() => setKind(k.key)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {notifyLoading && notifications.length === 0 ? (
              <div className="flex justify-center py-16"><Spinner /></div>
            ) : notifications.length === 0 ? (
              <div className="pm-empty">
                <Bell size={28} strokeWidth={1.5} aria-hidden />
                <p>暂无通知</p>
                <span>有人回复你、审核结果等会出现在这里</span>
              </div>
            ) : (
              <ul className="pm-notify-list">
                {notifications.map((m) => (
                  <li key={m.id} className={cn('pm-notify-item', !m.is_read && 'unread')}>
                    <div className="pm-notify-item__kind">{kindLabel(m.kind)}</div>
                    {m.subject && <div className="pm-notify-item__subject">{m.subject}</div>}
                    <div className="pm-notify-item__text">{m.content}</div>
                    <div className="pm-notify-item__meta">
                      <time>{formatTime(m.created_at)}</time>
                      {m.related_post_id ? (
                        <Link className="pm-notify-item__link" to={postPath(m.related_post_id)}>
                          查看帖子
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
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
          <div className={cn('pm-layout content-surface', peerSelected && 'pm-layout--thread')}>
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
                      <AvatarBubble
                        name={name}
                        avatar={c.peer_user?.avatar}
                      />
                      <div className="pm-conv-item__body">
                        <div className="pm-conv-item__top">
                          <span className="pm-conv-item__name">{name}</span>
                          <span className="pm-conv-item__time">
                            {formatTime(c.last_message?.created_at || c.updated_at)}
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
                                    <time>{formatTime(m.created_at)}</time>
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
        <InFlowSiteFooter />
      </div>
    </div>
  );
}
