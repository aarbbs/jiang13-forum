import { useMemo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { renderPostContentHtml } from '../utils/postContent';
import { extractHeadingsFromHtml, type PostHeading } from '../utils/postHeadings';
import { loginPath, registerPath } from '../utils/authRedirect';
import { useForumLimits } from '../hooks/useForumLimits';
import { notify } from '@/lib/notify';
import ImageLightbox from './ImageLightbox';

interface Props {
  html: string;
  isLoggedIn: boolean;
  className?: string;
  /** 正文标题树变化时回调（用于侧栏目录） */
  onHeadingsChange?: (headings: PostHeading[]) => void;
}

/** 帖子正文渲染（含会员专属区块、代码块美化、图片灯箱） */
export default function PostContent({
  html,
  isLoggedIn,
  className = 'post-detail-content',
  onHeadingsChange,
}: Props) {
  const nav = useNavigate();
  const { limits } = useForumLimits();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');

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

  const openLightbox = useCallback((img: HTMLImageElement) => {
    const full = img.getAttribute('data-full') || img.currentSrc || img.src;
    if (!full) return;
    setLightboxSrc(full);
    setLightboxAlt(img.getAttribute('alt') || '');
  }, []);

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
    const zoomImg = target.closest<HTMLImageElement>('img.post-content-img--zoomable');
    if (zoomImg) {
      e.preventDefault();
      openLightbox(zoomImg);
      return;
    }
    const headingCopy = target.closest<HTMLElement>('[data-heading-copy]');
    if (headingCopy) {
      e.preventDefault();
      const id = headingCopy.getAttribute('data-heading-copy') || '';
      if (!id) return;
      const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${id}`;
      try {
        await navigator.clipboard.writeText(url);
        notify.success('已复制本节链接');
      } catch {
        notify.error('复制失败');
      }
      return;
    }
    const foldBtn = target.closest<HTMLElement>('[data-code-fold]');
    if (foldBtn) {
      e.preventDefault();
      const block = foldBtn.closest('.md-codeblock');
      if (!block) return;
      const collapsed = block.classList.toggle('md-codeblock--collapsed');
      const lineCount = parseInt(block.getAttribute('data-line-count') || '0', 10)
        || block.querySelectorAll('.md-code-line').length
        || 1;
      if (collapsed && lineCount <= 5) block.classList.add('md-codeblock--short');
      else block.classList.remove('md-codeblock--short');
      foldBtn.textContent = collapsed ? '展开' : '收起';
      return;
    }
    const copyBtn = target.closest<HTMLElement>('[data-code-copy]');
    if (copyBtn) {
      e.preventDefault();
      const block = copyBtn.closest('.md-codeblock');
      // 行号列不参与复制：取各行正文拼接
      const bodies = block?.querySelectorAll('.md-code-line__body');
      const text = bodies && bodies.length
        ? [...bodies].map(el => el.textContent ?? '').join('\n')
        : (block?.querySelector('pre')?.textContent ?? '');
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
  }, [nav, openLightbox]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const zoomImg = (e.target as HTMLElement).closest?.('img.post-content-img--zoomable');
    if (!zoomImg || !(zoomImg instanceof HTMLImageElement)) return;
    e.preventDefault();
    openLightbox(zoomImg);
  }, [openLightbox]);

  return (
    <>
      <div
        className={className}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{ __html: prepared.html }}
      />
      <ImageLightbox
        src={lightboxSrc}
        alt={lightboxAlt}
        open={!!lightboxSrc}
        onClose={() => setLightboxSrc(null)}
      />
    </>
  );
}
