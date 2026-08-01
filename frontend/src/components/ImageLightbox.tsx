import { useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Props {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

/** 帖子正文图片灯箱：展示原图，点击遮罩 / Esc / 关闭按钮退出 */
export default function ImageLightbox({ src, alt = '', open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="查看原图">
      <button
        type="button"
        className="image-lightbox-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <button
        type="button"
        className="image-lightbox-close"
        aria-label="关闭"
        onClick={onClose}
      >
        <X size={20} aria-hidden />
      </button>
      <div className="image-lightbox-stage">
        <img
          src={src}
          alt={alt || '原图'}
          className="image-lightbox-img"
          decoding="async"
        />
      </div>
      <p className="image-lightbox-hint">点击空白处关闭</p>
    </div>,
    document.body,
  );
}
