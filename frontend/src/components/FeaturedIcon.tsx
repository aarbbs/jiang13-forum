import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  size?: number;
}

/** 推荐帖标识 */
export default function FeaturedIcon({ className, size = 16 }: Props) {
  return (
    <BadgeCheck
      className={cn('post-featured-icon', className)}
      size={size}
      aria-label="推荐"
      role="img"
    />
  );
}
