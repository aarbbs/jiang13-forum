import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };

/** 加载指示器，替代 Arco Spin */
export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-[var(--j13-green)]', sizeMap[size], className)}
      aria-label="加载中"
    />
  );
}
