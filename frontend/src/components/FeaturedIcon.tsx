import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: number;
}

/** 精华帖标识 */
export default function FeaturedIcon({ className, size = 16 }: Props) {
  return (
    <Sparkles
      className={cn('post-featured-icon', className)}
      size={size}
      aria-label="精华"
      role="img"
    />
  );
}
