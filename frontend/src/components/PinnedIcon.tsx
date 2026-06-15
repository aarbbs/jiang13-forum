import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: number;
}

/** 置顶图钉标识 */
export default function PinnedIcon({ className, size = 16 }: Props) {
  return (
    <Pin
      className={cn('post-pinned-icon', className)}
      size={size}
      fill="currentColor"
      aria-label="置顶"
      role="img"
    />
  );
}
