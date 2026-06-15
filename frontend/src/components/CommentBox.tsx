import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { User, Comment } from '../api/types';
import EmojiPicker from './EmojiPicker';
import { loadGuestInfo, saveGuestInfo } from '../utils/guest';
import { commentNick } from '../utils/comment';

export interface CommentSubmitData {
  content: string;
  guestNick?: string;
  guestEmail?: string;
  guestUrl?: string;
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

/** Waline 风格评论输入框：登录用户 / 游客双模式 */
export default function CommentBox({ user, replyTo, inline, submitting, submitCount = 0, onSubmit, onCancelReply }: Props) {
  const saved = loadGuestInfo();
  const [content, setContent] = useState('');
  const [guestNick, setGuestNick] = useState(saved.nick);
  const [guestEmail, setGuestEmail] = useState(saved.email);
  const [guestUrl, setGuestUrl] = useState(saved.url);
  const [isPrivate, setIsPrivate] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inline && replyTo) {
      // preventScroll 避免 focus 与页面 scrollIntoView 争抢滚动位置
      textareaRef.current?.focus({ preventScroll: true });
    }
  }, [replyTo?.id, inline]);

  useEffect(() => {
    setContent('');
    setShowEmoji(false);
    setIsPrivate(false);
  }, [submitCount]);

  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? content.length;
      const end = el.selectionEnd ?? content.length;
      const next = content.slice(0, start) + emoji + content.slice(end);
      setContent(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setContent((prev) => prev + emoji);
    }
  };

  const handleSubmit = () => {
    const text = content.trim();
    if (!text) return;
    if (!user && !guestNick.trim()) return;

    if (!user) {
      saveGuestInfo({ nick: guestNick.trim(), email: guestEmail.trim(), url: guestUrl.trim() });
    }

    onSubmit({
      content: text,
      guestNick: user ? undefined : guestNick.trim(),
      guestEmail: user ? undefined : guestEmail.trim(),
      guestUrl: user ? undefined : guestUrl.trim(),
      isPrivate,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const avatarInitial = user?.nickname?.[0] || guestNick?.[0] || '?';

  return (
    <div className="comment-box" ref={boxRef}>
      <div className="comment-box-avatar">
        {user?.avatar ? (
          <img src={user.avatar} alt="" className="comment-box-avatar-img" />
        ) : (
          <div className={`comment-box-avatar-placeholder ${user ? '' : 'guest'}`}>
            {user ? avatarInitial : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            )}
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
          <textarea
            ref={textareaRef}
            className="comment-box-textarea"
            placeholder={isPrivate ? '正在隐私评论中...' : '说点什么吧'}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
          />
          <button
            type="button"
            className="comment-box-send"
            disabled={submitting || !content.trim() || (!user && !guestNick.trim())}
            onClick={handleSubmit}
            title="发送"
          >
            <Send size={16} />
          </button>
        </div>

        {!user && (
          <div className="comment-box-guest-fields">
            <label className="comment-box-guest-field">
              <span className="comment-box-guest-label">
                昵称
                <em className="comment-box-guest-required">必填</em>
              </span>
              <input
                className="comment-box-guest-input"
                placeholder="怎么称呼你"
                autoComplete="nickname"
                value={guestNick}
                onChange={(e) => setGuestNick(e.target.value)}
              />
            </label>
            <label className="comment-box-guest-field">
              <span className="comment-box-guest-label">
                邮箱
                <em className="comment-box-guest-optional">选填</em>
              </span>
              <input
                className="comment-box-guest-input"
                placeholder="name@example.com"
                type="email"
                autoComplete="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
            </label>
            <label className="comment-box-guest-field">
              <span className="comment-box-guest-label">
                网址
                <em className="comment-box-guest-optional">选填</em>
              </span>
              <input
                className="comment-box-guest-input"
                placeholder="https://example.com"
                type="url"
                autoComplete="url"
                value={guestUrl}
                onChange={(e) => setGuestUrl(e.target.value)}
              />
            </label>
            <p className="comment-box-guest-hint">邮箱不会公开展示，仅用于站内记录。</p>
          </div>
        )}

        <div className="comment-box-toolbar">
          <button
            type="button"
            className={`comment-box-owo ${showEmoji ? 'active' : ''}`}
            onClick={() => setShowEmoji((v) => !v)}
          >
            OwO
          </button>
          <label className="comment-box-private">
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            <span>隐私评论</span>
          </label>
        </div>

        {showEmoji && <EmojiPicker onSelect={insertEmoji} />}
      </div>
    </div>
  );
}
