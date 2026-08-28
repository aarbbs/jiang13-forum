import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface Props {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function touchDistance(a: Touch, b: Touch) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(a: Touch, b: Touch) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function clampScale(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** 帖子正文图片灯箱：展示原图，支持双指缩放 / 拖动，点击遮罩 / Esc / 关闭按钮退出 */
export default function ImageLightbox({ src, alt = '', open, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [settling, setSettling] = useState(false);

  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    startTx: number;
    startTy: number;
    midX: number;
    midY: number;
  } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const applyTransform = useCallback((nextScale: number, nextTx: number, nextTy: number) => {
    scaleRef.current = nextScale;
    txRef.current = nextTx;
    tyRef.current = nextTy;
    setScale(nextScale);
    setTx(nextTx);
    setTy(nextTy);
  }, []);

  const resetTransform = useCallback((animate = false) => {
    if (animate) setSettling(true);
    applyTransform(1, 0, 0);
  }, [applyTransform]);

  useEffect(() => {
    if (!open) return;
    resetTransform(false);
    setSettling(false);
  }, [open, src, resetTransform]);

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

  // 原生非 passive 监听，才能在 pinch/pan 时 preventDefault
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      setSettling(false);
      if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        const mid = touchMidpoint(a, b);
        pinchRef.current = {
          startDist: touchDistance(a, b) || 1,
          startScale: scaleRef.current,
          startTx: txRef.current,
          startTy: tyRef.current,
          midX: mid.x,
          midY: mid.y,
        };
        panRef.current = null;
        return;
      }
      if (e.touches.length === 1 && scaleRef.current > 1.01) {
        panRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startTx: txRef.current,
          startTy: tyRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        if (e.cancelable) e.preventDefault();
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = touchDistance(a, b) || 1;
        const nextScale = clampScale(
          pinchRef.current.startScale * (dist / pinchRef.current.startDist),
        );
        const mid = touchMidpoint(a, b);
        applyTransform(
          nextScale,
          pinchRef.current.startTx + (mid.x - pinchRef.current.midX),
          pinchRef.current.startTy + (mid.y - pinchRef.current.midY),
        );
        return;
      }
      if (e.touches.length === 1 && panRef.current && scaleRef.current > 1.01) {
        if (e.cancelable) e.preventDefault();
        const dx = e.touches[0].clientX - panRef.current.startX;
        const dy = e.touches[0].clientY - panRef.current.startY;
        applyTransform(
          scaleRef.current,
          panRef.current.startTx + dx,
          panRef.current.startTy + dy,
        );
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
      if (e.touches.length === 0) {
        panRef.current = null;
        if (scaleRef.current <= 1.05) resetTransform(true);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setSettling(false);
      const delta = -e.deltaY * 0.01;
      const next = clampScale(scaleRef.current * (1 + delta));
      if (next <= 1.01) {
        resetTransform(true);
        return;
      }
      applyTransform(next, txRef.current, tyRef.current);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [open, applyTransform, resetTransform]);

  const handleBackdropClick = useCallback(() => {
    if (scaleRef.current > 1.01) {
      resetTransform(true);
      return;
    }
    onClose();
  }, [onClose, resetTransform]);

  if (!open || !src) return null;

  return createPortal(
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="查看原图">
      <button
        type="button"
        className="image-lightbox-backdrop"
        aria-label="关闭"
        onClick={handleBackdropClick}
      />
      <button
        type="button"
        className="image-lightbox-close"
        aria-label="关闭"
        onClick={onClose}
      >
        <X size={20} aria-hidden />
      </button>
      <div ref={stageRef} className="image-lightbox-stage">
        <img
          src={src}
          alt={alt || '原图'}
          className={`image-lightbox-img${settling ? ' image-lightbox-img--settling' : ''}`}
          decoding="async"
          draggable={false}
          style={{ transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})` }}
          onTransitionEnd={() => setSettling(false)}
          onClick={e => e.stopPropagation()}
        />
      </div>
      <p className="image-lightbox-hint image-lightbox-hint--desktop">点击空白处关闭</p>
      <p className="image-lightbox-hint image-lightbox-hint--mobile">双指缩放 · 点击空白关闭</p>
    </div>,
    document.body,
  );
}
