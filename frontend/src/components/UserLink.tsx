import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { UserBadge } from '../api/types';
import { userPath } from '../utils/userPath';
import UserBadges from './UserBadges';

export type UserLinkUser = {
  id?: number;
  nickname?: string;
  avatar?: string;
  role?: string;
  verified?: boolean;
  level?: number;
  exp?: number;
  badges?: UserBadge[];
} | null | undefined;

interface Props {
  user: UserLinkUser;
  className?: string;
  avatarClassName?: string;
  nameClassName?: string;
  showAvatar?: boolean;
  showName?: boolean;
  showBadges?: boolean;
  /** 嵌在可点击父级内时阻止冒泡（如帖子列表行） */
  stopPropagation?: boolean;
  children?: ReactNode;
  title?: string;
}

/** 统一用户入口：点击进入 /user/:id 公开主页 */
export default function UserLink({
  user,
  className,
  avatarClassName,
  nameClassName,
  showAvatar = false,
  showName = true,
  showBadges = false,
  stopPropagation = false,
  children,
  title,
}: Props) {
  const id = user?.id && user.id > 0 ? user.id : 0;
  const nick = user?.nickname?.trim() || '匿名';
  const initial = nick[0] || '?';
  const tip = title || nick;

  const onClick = stopPropagation
    ? (e: MouseEvent) => { e.stopPropagation(); }
    : undefined;

  const body = children ?? (
    <>
      {showAvatar && (
        <span className={cn('user-link-avatar', avatarClassName)} aria-hidden>
          {user?.avatar
            ? <img src={user.avatar} alt="" loading="lazy" decoding="async" />
            : initial}
        </span>
      )}
      {showName && <span className={cn('user-link-name', nameClassName)}>{nick}</span>}
      {showBadges && showName && <UserBadges user={user} />}
    </>
  );

  if (!id) {
    return (
      <span className={cn('user-link user-link--static', className)} title={tip}>
        {body}
      </span>
    );
  }

  return (
    <Link
      to={userPath(id)}
      className={cn('user-link', className)}
      title={tip}
      onClick={onClick}
    >
      {body}
    </Link>
  );
}
