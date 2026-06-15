import { cloneElement, isValidElement, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

type TooltipSide = 'top' | 'bottom';
type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipProps {
  content: string;
  hint?: string;
  side?: TooltipSide;
  align?: TooltipAlign;
  children: ReactElement;
  className?: string;
}

/** 即时显示的网页式气泡提示，替代原生 title */
export function Tooltip({
  content,
  hint,
  side = 'bottom',
  align = 'center',
  children,
  className,
}: TooltipProps) {
  if (!isValidElement(children)) return children;

  const ariaLabel = hint ? `${content}，${hint}` : content;
  const child = cloneElement(children, {
    'aria-label': ariaLabel,
  } as Record<string, unknown>);

  return (
    <span className={cn('ui-tooltip', className)}>
      {child}
      <span
        role="tooltip"
        className={cn(
          'ui-tooltip-bubble',
          `ui-tooltip-bubble--${side}`,
          `ui-tooltip-bubble--${align}`,
          hint ? 'ui-tooltip-bubble--rich' : 'ui-tooltip-bubble--compact',
        )}
      >
        <span className="ui-tooltip-bubble__title">{content}</span>
        {hint ? <span className="ui-tooltip-bubble__hint">{hint}</span> : null}
      </span>
    </span>
  );
}
