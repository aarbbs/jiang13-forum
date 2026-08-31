import { useEffect, useRef, useState } from 'react';
import { subscribeSpaTransition } from '../utils/spaTransition';

/**
 * 视口顶部 2px 细进度条（类 Next.js / YouTube）。
 * 由 spaTransition start/done 驱动，假进度爬升至约 80%，结束冲到 100%。
 */
export default function TopProgressBar() {
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    const clearTick = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    const clearFade = () => {
      if (fadeRef.current) {
        clearTimeout(fadeRef.current);
        fadeRef.current = null;
      }
    };

    return subscribeSpaTransition((active) => {
      if (active) {
        activeRef.current = true;
        clearFade();
        setFading(false);
        setVisible(true);
        setWidth(12);
        clearTick();
        timerRef.current = setInterval(() => {
          setWidth((w) => {
            if (w >= 80) return w;
            // 越接近 80 越慢
            const step = Math.max(0.4, (80 - w) * 0.045);
            return Math.min(80, w + step);
          });
        }, 120);
        return;
      }

      if (!activeRef.current) return;
      activeRef.current = false;
      clearTick();
      setWidth(100);
      setFading(true);
      clearFade();
      fadeRef.current = setTimeout(() => {
        setVisible(false);
        setFading(false);
        setWidth(0);
      }, 220);
    });
  }, []);

  if (!visible && width <= 0) return null;

  return (
    <div
      className={[
        'top-progress',
        fading ? 'top-progress--done' : '',
      ].filter(Boolean).join(' ')}
      style={{ width: `${width}%` }}
      aria-hidden
    />
  );
}
