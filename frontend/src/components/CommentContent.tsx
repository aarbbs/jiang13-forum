import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { renderCommentContent } from '../utils/content';
import { handleMdCodeBlockUiClick } from '../utils/enhanceCodeBlocks';
import { userPath } from '../utils/userPath';
import { notify } from '@/lib/notify';

interface Props {
  content: string;
}

/** 渲染评论正文（支持正文内 @ 高亮、代码块阅读态与点击跳转） */
export default function CommentContent({ content }: Props) {
  const nav = useNavigate();
  const html = useMemo(() => renderCommentContent(content), [content]);

  const openMention = async (name: string) => {
    try {
      const r = await api.searchUsers(name, 5);
      const exact = (r.users || []).find(
        (u) => u.username === name || u.nickname === name,
      );
      const user = exact || r.users?.[0];
      if (user) {
        nav(userPath(user.id));
      }
    } catch {
      // 未登录或失败时忽略
    }
  };

  const onClick = useCallback(async (e: React.MouseEvent) => {
    try {
      if (await handleMdCodeBlockUiClick(e.target)) {
        e.preventDefault();
        return;
      }
    } catch {
      notify.error('复制失败');
      return;
    }

    const el = (e.target as HTMLElement).closest('.mention') as HTMLElement | null;
    if (!el) return;
    const name = el.getAttribute('data-name');
    if (!name) return;
    e.preventDefault();
    void openMention(name);
  }, [nav]);

  return (
    <div
      className="floor-body post-detail-content"
      onClick={(e) => { void onClick(e); }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target as HTMLElement;
        if (!el.classList.contains('mention')) return;
        const name = el.getAttribute('data-name');
        if (!name) return;
        e.preventDefault();
        void openMention(name);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
