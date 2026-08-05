import {
  Award,
  Calendar,
  CalendarHeart,
  Coins,
  Flame,
  Gem,
  Heart,
  HeartHandshake,
  Medal,
  Shield,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/** 徽章可用图标（与前端展示、后台选择器一致） */
export const BADGE_ICON_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'star', label: '星星', Icon: Star },
  { key: 'award', label: '奖章', Icon: Award },
  { key: 'medal', label: '勋章', Icon: Medal },
  { key: 'trophy', label: '奖杯', Icon: Trophy },
  { key: 'sparkles', label: '闪光', Icon: Sparkles },
  { key: 'shield', label: '盾牌', Icon: Shield },
  { key: 'heart', label: '爱心', Icon: Heart },
  { key: 'heart-handshake', label: '人心', Icon: HeartHandshake },
  { key: 'flame', label: '火焰', Icon: Flame },
  { key: 'coins', label: '金币', Icon: Coins },
  { key: 'gem', label: '宝石', Icon: Gem },
  { key: 'calendar', label: '日历', Icon: Calendar },
  { key: 'calendar-heart', label: '纪念日', Icon: CalendarHeart },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  BADGE_ICON_OPTIONS.map(o => [o.key, o.Icon]),
);

export function badgeIcon(key?: string): LucideIcon {
  if (!key) return Star;
  return ICON_MAP[key] || Star;
}

export const BADGE_METRIC_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'tenure_days', label: '注册天数', hint: '账号注册满 N 天自动获得' },
  { value: 'likes_received', label: '帖子获赞', hint: '公开帖累计获赞达到 N' },
  { value: 'creator_income', label: '创作收入', hint: '积分解锁分成累计达到 N' },
];

export function metricLabel(metric?: string): string {
  return BADGE_METRIC_OPTIONS.find(m => m.value === metric)?.label || metric || '—';
}

export function formatBadgeCondition(b: {
  kind?: string;
  metric?: string;
  threshold?: number;
  description?: string;
}): string {
  if (b.kind === 'auto') {
    return `${metricLabel(b.metric)} ≥ ${b.threshold ?? 0}`;
  }
  return b.description?.trim() || '由站长手动颁发';
}
