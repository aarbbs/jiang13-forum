import { BadgeCheck, Crown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserBadge } from '../api/types';
import { badgeIcon } from '../utils/badgeIcons';
import { levelToneFromLevel, resolveUserLevel } from '../utils/userMeta';
import LevelEmblem from './LevelEmblem';

type BadgeUser = {
  role?: string;
  verified?: boolean;
  level?: number;
  exp?: number;
  badges?: UserBadge[];
} | null | undefined;

interface Props {
  user: BadgeUser;
  className?: string;
  /** 用户名旁最多展示几枚成就徽章 */
  maxAchievement?: number;
  showLevel?: boolean;
  compact?: boolean;
}

/** 用户名旁：站长/认证 + Lv + 成就徽章 */
export default function UserBadges({
  user,
  className,
  maxAchievement = 2,
  showLevel = true,
  compact = true,
}: Props) {
  if (!user) return null;
  const level = resolveUserLevel(user);
  const achievements = (user.badges ?? []).slice(0, maxAchievement);
  const isAdmin = user.role === 'admin';
  const isVerified = !!user.verified && !isAdmin;

  if (!isAdmin && !isVerified && !showLevel && achievements.length === 0) return null;

  const levelTone = levelToneFromLevel(level);

  return (
    <span className={cn('user-badges', compact && 'user-badges--compact', className)}>
      {isAdmin && (
        <span className="user-badge user-badge--owner" title="站长">
          <Crown size={compact ? 12 : 14} aria-hidden />
          {!compact && <span>站长</span>}
        </span>
      )}
      {isVerified && (
        <span className="user-badge user-badge--verified" title="认证用户">
          <BadgeCheck size={compact ? 12 : 14} aria-hidden />
          {!compact && <span>认证</span>}
        </span>
      )}
      {showLevel && (
        <span
          className={cn('user-badge user-badge--level', `user-badge--level-${levelTone}`)}
          title={`经验 ${user.exp ?? 0}`}
        >
          <LevelEmblem level={level} tone={levelTone} size={compact ? 12 : 14} />
          <span className="user-badge__level-text">Lv.{level}</span>
        </span>
      )}
      {achievements.map(b => {
        const Icon: LucideIcon = badgeIcon(b.icon);
        return (
          <span key={b.code} className="user-badge user-badge--ach" title={`${b.name}：${b.description}`}>
            <Icon size={compact ? 11 : 13} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}
