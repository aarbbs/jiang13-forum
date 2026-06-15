import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderPostContentHtml } from '../utils/postContent';

interface Props {
  html: string;
  isLoggedIn: boolean;
  className?: string;
}

/** 帖子正文渲染（含会员专属区块） */
export default function PostContent({ html, isLoggedIn, className = 'post-detail-content' }: Props) {
  const nav = useNavigate();

  const rendered = useMemo(
    () => renderPostContentHtml(html, isLoggedIn),
    [html, isLoggedIn],
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-members-login]')) {
      e.preventDefault();
      nav('/login');
      return;
    }
    if (target.closest('[data-members-register]')) {
      e.preventDefault();
      nav('/register');
    }
  }, [nav]);

  return (
    <div
      className={className}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}
