import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import type { User, Comment } from '../api/types';
import CommentEditor, { type CommentEditorHandle } from './CommentEditor';
import { commentNick } from '../utils/comment';
import { loginPath, registerPath } from '../utils/authRedirect';
import { isHtmlEmpty } from '../utils/postContent';

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

/** 评论输入框：需登录后发表；富文本编辑器 + 贴纸 + 隐私评论 */
export default function CommentBox({ user, replyTo, inline, submitting, submitCount = 0, onSubmit, onCancelReply }: Props) {
  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const editorRef = useRef<CommentEditorHandle>(null);

  useEffect(() => {
    if (inline && replyTo) {
      editorRef.current?.focus();
    }
  }, [replyTo?.id, inline]);

  useEffect(() => {
    setContent('');
    setIsPrivate(false);
    editorRef.current?.focus();
  }, [submitCount]);

  const handleSubmit = () => {
    if (!user) return;
    if (isHtmlEmpty(content)) {
      notify.warning('请先写点内容');
      editorRef.current?.focus();
      return;
    }
    onSubmit({ content, isPrivate });
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
  const canSend = !submitting && !isHtmlEmpty(content);

  return (
    <div className="comment-box">
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
          <CommentEditor
            ref={editorRef}
            value={content}
            onChange={setContent}
            placeholder={isPrivate ? '正在隐私评论中...' : '说点什么吧，可用 @ 提及用户'}
          />
        </div>

        <div className="comment-box-toolbar">
          <label className="comment-box-private" title="仅作者与管理员可见">
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            <span>隐私评论</span>
          </label>
          <span className="comment-box-private-hint">仅作者与管理员可见</span>
          <button
            type="button"
            className="comment-box-send"
            disabled={!canSend}
            onClick={handleSubmit}
            aria-label="发送评论"
            title="发送"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
