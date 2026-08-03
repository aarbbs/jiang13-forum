import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import type { User, Comment } from '../api/types';
import EmojiPicker from './EmojiPicker';
import { commentNick } from '../utils/comment';
import { loginPath, registerPath } from '../utils/authRedirect';

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

/** 评论输入框：需登录后发表 */
export default function CommentBox({ user, replyTo, inline, submitting, submitCount = 0, onSubmit, onCancelReply }: Props) {
  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const owoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (inline && replyTo) {
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
