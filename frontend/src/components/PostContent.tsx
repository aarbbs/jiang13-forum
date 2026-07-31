import { useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderPostContentHtml } from '../utils/postContent';
import { extractHeadingsFromHtml, type PostHeading } from '../utils/postHeadings';
import { loginPath, registerPath } from '../utils/authRedirect';
import { useForumLimits } from '../hooks/useForumLimits';
import { notify } from '@/lib/notify';

interface Props {
  html: string;
  isLoggedIn: boolean;
  className?: string;
  /** 正文标题树变化时回调（用于侧栏目录） */
  onHeadingsChange?: (headings: PostHeading[]) => void;
}

/** 帖子正文渲染（含会员专属区块、代码块美化） */
export default function PostContent({
  html,
  isLoggedIn,
  className = 'post-detail-content',
  onHeadingsChange,
}: Props) {
  const nav = useNavigate();
  const { limits } = useForumLimits();

  const prepared = useMemo(() => {
    const rendered = renderPostContentHtml(html, isLoggedIn, {
      openLinksInNewTab: limits.open_content_links_in_new_tab,
    });
    return {
      html: rendered,
      headings: extractHeadingsFromHtml(rendered),
    };
  }, [html, isLoggedIn, limits.open_content_links_in_new_tab]);

  useEffect(() => {
    onHeadingsChange?.(prepared.headings);
  }, [prepared.headings, onHeadingsChange]);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-members-login]')) {
      e.preventDefault();
      nav(loginPath());
      return;
    }
    if (target.closest('[data-members-register]')) {
      e.preventDefault();
      nav(registerPath());
      return;
    }
    const copyBtn = target.closest<HTMLElement>('[data-code-copy]');
    if (copyBtn) {
      e.preventDefault();
      const block = copyBtn.closest('.md-codeblock');
      const text = block?.querySelector('pre')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        const prev = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        copyBtn.classList.add('is-copied');
        window.setTimeout(() => {
          copyBtn.textContent = prev || '复制';
          copyBtn.classList.remove('is-copied');
        }, 1600);
      } catch {
        notify.error('复制失败');
      }
    }
  }, [nav]);

  return (
    <div
      className={className}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: prepared.html }}
    />
  );
}
