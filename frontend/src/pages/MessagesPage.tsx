import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bell, CheckCheck, Inbox, Send } from 'lucide-react';
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

function kindLabel(kind: string) {
  switch (kind) {
    case 'reject': return '拒帖通知';
    case 'report_result': return '举报结果';
    case 'system': return '系统通知';
    default: return '';
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

export default function MessagesPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  useNoIndexSEO('站内私信');

  const peerParam = params.get('peer');
  const selectedPeer = peerParam === null || peerParam === ''
    ? null
    : Number(peerParam);
  const peerSelected = selectedPeer !== null && !Number.isNaN(selectedPeer);

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

  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      nav(loginPath('/messages'));
      return;
    }
    loadConversations(1);
  }, [user, authLoading, nav, loadConversations]);

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
      })
      .catch((e: unknown) => {
        if (!cancelled) notify.error(e instanceof Error ? e.message : '加载会话失败');
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, peerSelected, selectedPeer]);

  useEffect(() => {
    if (!threadLoading && stickToBottomRef.current) {
      scrollToBottom(false);
    }
  }, [messages, threadLoading, scrollToBottom]);

  const openPeer = (peerId: number) => {
    const p = new URLSearchParams();
    p.set('peer', String(peerId));
    setParams(p, { replace: true });
    setDraft('');
  };

  const closeThread = () => {
    setParams(new URLSearchParams(), { replace: true });
    setDraft('');
  };

  const markAll = async () => {
    try {
      await api.markAllMessagesRead();
      notify.success('已全部标为已读');
      setConversations((prev) => prev.map((c) => ({ ...c, unread_count: 0 })));
      window.dispatchEvent(new Event('messages-unread-refresh'));
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

  if (authLoading || (listLoading && conversations.length === 0 && !peerSelected)) {
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
  const unreadTotal = conversations.reduce((n, c) => n + (c.unread_count || 0), 0);

  return (
    <div className="page-wrap">
      <div className="page-inner-wide">
        <Button variant="ghost" className="mb-3" onClick={() => nav('/')}>
          <ArrowLeft />
          返回
        </Button>

        <div className="pm-page-head">
          <div>
            <h1 className="page-title">站内私信</h1>
            <p className="page-desc">按会话查看，与用户即时沟通，并接收系统通知</p>
          </div>
          {unreadTotal > 0 && (
            <Button variant="outline" size="sm" onClick={markAll}>
              <CheckCheck size={14} />
              全部已读
            </Button>
          )}
        </div>

        <div className={cn('pm-layout content-surface', peerSelected && 'pm-layout--thread')}>
          <aside className="pm-list" aria-label="会话列表">
            {listLoading && conversations.length === 0 ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : conversations.length === 0 ? (
              <div className="pm-empty">
                <Inbox size={28} strokeWidth={1.5} aria-hidden />
                <p>还没有会话</p>
                <span>在用户主页点击「发私信」开始对话</span>
              </div>
            ) : (
              conversations.map((c) => {
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
                      system={c.is_system || c.peer_user_id === 0}
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
                <span>系统通知也会出现在会话列表中</span>
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
                    system={selectedPeer === 0}
                  />
                  <div className="pm-thread-head__meta">
                    {selectedPeer > 0 ? (
                      <Link to={userPath(selectedPeer)} className="pm-thread-head__name">{title}</Link>
                    ) : (
                      <span className="pm-thread-head__name">{title}</span>
                    )}
                    <span className="pm-thread-head__sub">
                      {selectedPeer === 0 ? '审核与系统消息' : '私信对话'}
                    </span>
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
                          const system = m.from_user_id === 0 || m.kind !== 'user';
                          const label = kindLabel(m.kind);
                          return (
                            <div
                              key={m.id}
                              className={cn(
                                'pm-bubble-row',
                                mine && 'pm-bubble-row--mine',
                                system && !mine && 'pm-bubble-row--system',
                              )}
                            >
                              <div className={cn('pm-bubble', mine && 'pm-bubble--mine', system && !mine && 'pm-bubble--system')}>
                                {label && !mine && (
                                  <span className="pm-bubble__kind">{label}</span>
                                )}
                                {m.subject && m.kind !== 'user' && (
                                  <div className="pm-bubble__subject">{m.subject}</div>
                                )}
                                <div className="pm-bubble__text">{m.content}</div>
                                {m.related_post_id ? (
                                  <Link className="pm-bubble__link" to={postPath(m.related_post_id)}>
                                    查看相关帖子 #{m.related_post_id}
                                  </Link>
                                ) : null}
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

                {canCompose ? (
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
                ) : (
                  <footer className="pm-composer pm-composer--readonly">
                    系统通知不可回复；如需联系管理员，请从用户主页发私信。
                  </footer>
                )}
              </>
            )}
          </section>
        </div>
        <InFlowSiteFooter />
      </div>
    </div>
  );
}
