import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { User, Comment } from '../api/types';
import EmojiPicker from './EmojiPicker';
import { commentNick } from '../utils/comment';
import { loginPath, registerPath } from '../utils/authRedirect';
import { cn } from '@/lib/utils';

export interface CommentSubmitData {
  content: string;
  isPrivate: boolean;
}

interface Props {
  user: User | null;
  replyTo?: Comment | null;
  inline?: boolean;
  submitting?: boolean;
  submitCount?: number;
  onSubmit: (data: CommentSubmitData) => void;
  onCancelReply?: () => void;
}

type MentionUser = { id: number; username: string; nickname: string; avatar?: string };

/** 评论输入框：需登录后发表；支持 @ 用户补全 */
export default function CommentBox({ user, replyTo, inline, submitting, submitCount = 0, onSubmit, onCancelReply }: Props) {
  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const owoRef = useRef<HTMLButtonElement>(null);
  const mentionTimer = useRef<number | null>(null);

  useEffect(() => {
    if (inline && replyTo) {
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [replyTo?.id, inline]);

  useEffect(() => {
    setContent('');
    setShowEmoji(false);
    setIsPrivate(false);
    setMentionQuery(null);
    setMentionUsers([]);
  }, [submitCount]);

  useEffect(() => {
    if (!showEmoji) return;
    const onPointer = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
        owoRef.current?.focus();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmoji(false);
        owoRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showEmoji]);

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setMentionUsers([]);
    setMentionIndex(0);
    setMentionStart(-1);
  }, []);

  const scanMention = useCallback((text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(/@([\w\u4e00-\u9fa5_-]*)$/);
    if (!m) {
      closeMention();
      return;
    }
    const start = caret - m[0].length;
    // @ 前须为行首或空白，避免邮箱等误触
    if (start > 0 && !/\s/.test(text[start - 1])) {
      closeMention();
      return;
    }
    setMentionStart(start);
    setMentionQuery(m[1] ?? '');
  }, [closeMention]);

  useEffect(() => {
    if (mentionQuery === null) return;
    if (mentionQuery.length === 0) {
      setMentionUsers([]);
      setMentionLoading(false);
      return;
    }
    if (mentionTimer.current) window.clearTimeout(mentionTimer.current);
    mentionTimer.current = window.setTimeout(() => {
      setMentionLoading(true);
      api.searchUsers(mentionQuery, 8)
        .then((r) => {
          setMentionUsers(r.users || []);
          setMentionIndex(0);
        })
        .catch(() => setMentionUsers([]))
        .finally(() => setMentionLoading(false));
    }, 200);
    return () => {
      if (mentionTimer.current) window.clearTimeout(mentionTimer.current);
    };
  }, [mentionQuery]);

  const insertAtCaret = (insert: string, replaceFrom?: number, replaceTo?: number) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) => prev + insert);
      return;
    }
    const start = replaceFrom ?? el.selectionStart ?? content.length;
    const end = replaceTo ?? el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + insert + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const insertEmoji = (emoji: string) => {
    insertAtCaret(emoji);
  };

  const pickMention = (u: MentionUser) => {
    if (mentionStart < 0) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? content.length;
    insertAtCaret(`@${u.username} `, mentionStart, caret);
    closeMention();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    scanMention(next, e.target.selectionStart ?? next.length);
  };

  const handleSubmit = () => {
    if (!user) return;
    const text = content.trim();
    if (!text) {
      notify.warning('请先写点内容');
      textareaRef.current?.focus();
      return;
    }
    onSubmit({ content: text, isPrivate });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionQuery !== null && mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionUsers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionUsers.length) % mentionUsers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(mentionUsers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!user) {
    return (
      <div className={`comment-login-gate${inline ? ' comment-login-gate--inline' : ''}`}>
        <p className="comment-login-gate__text">登录后即可参与讨论与回复</p>
        <div className="comment-login-gate__actions">
          <Button asChild size="sm">
            <Link to={loginPath()}>登录</Link>
          </Button>
          <Link to={registerPath()} className="comment-login-gate__register">
            注册账号
          </Link>
        </div>
      </div>
    );
  }

  const avatarInitial = user.nickname?.[0] || '?';
  const canSend = !!content.trim() && !submitting;
  const showMentionPopup = mentionQuery !== null && mentionQuery.length > 0;

  return (
    <div className="comment-box" ref={boxRef}>
      <div className="comment-box-avatar">
        {user.avatar ? (
          <img src={user.avatar} alt="" className="comment-box-avatar-img" loading="lazy" decoding="async" />
        ) : (
          <div className="comment-box-avatar-placeholder">
            {avatarInitial}
          </div>
        )}
      </div>

      <div className="comment-box-main">
        {replyTo && !inline && (
          <div className="comment-box-reply-hint">
            <span>回复 #{replyTo.floor} {commentNick(replyTo)}</span>
            {onCancelReply && (
              <button type="button" className="comment-box-reply-cancel" onClick={onCancelReply}>取消</button>
            )}
          </div>
        )}

        <div className={`comment-box-input-wrap ${isPrivate ? 'private-mode' : ''}`}>
          {showMentionPopup && (
            <div className="comment-mention-popup" role="listbox" aria-label="提及用户">
              {mentionLoading && mentionUsers.length === 0 ? (
                <div className="comment-mention-empty">搜索中…</div>
              ) : mentionUsers.length === 0 ? (
                <div className="comment-mention-empty">没有匹配用户</div>
              ) : (
                mentionUsers.map((u, i) => (
                  <button
                    key={u.id}
                    type="button"
                    role="option"
                    aria-selected={i === mentionIndex}
                    className={cn('comment-mention-item', i === mentionIndex && 'active')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(u);
                    }}
                  >
                    <span className="comment-mention-avatar" aria-hidden>
                      {u.avatar
                        ? <img src={u.avatar} alt="" />
                        : (u.nickname?.[0] || u.username[0] || '?')}
                    </span>
                    <span className="comment-mention-meta">
                      <span className="comment-mention-nick">{u.nickname || u.username}</span>
                      <span className="comment-mention-user">@{u.username}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="comment-box-textarea"
            placeholder={isPrivate ? '正在隐私评论中...' : '说点什么吧，可用 @ 提及用户'}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => scanMention(content, e.currentTarget.selectionStart ?? content.length)}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                scanMention(content, e.currentTarget.selectionStart ?? content.length);
              }
            }}
            rows={3}
          />
          <button
            type="button"
            className="comment-box-send"
            disabled={!canSend}
            onClick={handleSubmit}
            aria-label="发送评论"
            title="发送（Ctrl/⌘ + Enter）"
          >
            <Send size={16} />
          </button>
        </div>

        <div className="comment-box-toolbar">
          <button
            ref={owoRef}
            type="button"
            className={`comment-box-owo ${showEmoji ? 'active' : ''}`}
            onClick={() => setShowEmoji((v) => !v)}
            aria-label="插入表情"
            aria-expanded={showEmoji}
            aria-controls="comment-emoji-picker"
          >
            OwO
          </button>
          <label className="comment-box-private" title="仅作者与管理员可见">
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            <span>隐私评论</span>
          </label>
          <span className="comment-box-private-hint">仅作者与管理员可见</span>
        </div>

        {showEmoji && <EmojiPicker id="comment-emoji-picker" onSelect={insertEmoji} />}
      </div>
    </div>
  );
}
