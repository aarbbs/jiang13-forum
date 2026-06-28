import {
  Code2, Coffee, HelpCircle, MessageSquare, Lightbulb,
  BookOpen, Gamepad2, Palette, Music, Camera, Heart, Zap,
  Globe, Users, Briefcase, GraduationCap, ShoppingBag, MapPin,
  Megaphone, Flame, Star, Folder, Wrench, Cpu, type LucideIcon,
} from 'lucide-react';
import type { Board } from '../api/types';

/** 板块主题色槽位数（与 global.css 中 board-badge--N 对应） */
export const BOARD_PALETTE_SIZE = 8;

/** 可选板块图标（key 须与后端 AllowedBoardIcons 一致） */
export const BOARD_ICON_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'code-2', label: '代码', Icon: Code2 },
  { key: 'coffee', label: '咖啡', Icon: Coffee },
  { key: 'help-circle', label: '问答', Icon: HelpCircle },
  { key: 'message-square', label: '讨论', Icon: MessageSquare },
  { key: 'lightbulb', label: '灵感', Icon: Lightbulb },
  { key: 'book-open', label: '阅读', Icon: BookOpen },
  { key: 'gamepad-2', label: '游戏', Icon: Gamepad2 },
  { key: 'palette', label: '设计', Icon: Palette },
  { key: 'music', label: '音乐', Icon: Music },
  { key: 'camera', label: '摄影', Icon: Camera },
  { key: 'heart', label: '生活', Icon: Heart },
  { key: 'zap', label: '快讯', Icon: Zap },
  { key: 'globe', label: '综合', Icon: Globe },
  { key: 'users', label: '社区', Icon: Users },
  { key: 'briefcase', label: '职场', Icon: Briefcase },
  { key: 'graduation-cap', label: '学习', Icon: GraduationCap },
  { key: 'shopping-bag', label: '交易', Icon: ShoppingBag },
  { key: 'map-pin', label: '本地', Icon: MapPin },
  { key: 'megaphone', label: '公告', Icon: Megaphone },
  { key: 'flame', label: '热门', Icon: Flame },
  { key: 'star', label: '精华', Icon: Star },
  { key: 'folder', label: '资源', Icon: Folder },
  { key: 'wrench', label: '工具', Icon: Wrench },
  { key: 'cpu', label: '硬件', Icon: Cpu },
];

const ICON_MAP = Object.fromEntries(
  BOARD_ICON_OPTIONS.map(o => [o.key, o.Icon]),
) as Record<string, LucideIcon>;

const DEFAULT_ICONS: LucideIcon[] = [
  Code2, Coffee, HelpCircle, MessageSquare,
  Lightbulb, BookOpen, Gamepad2, Palette,
];

export type BoardVisual = Pick<Board, 'id' | 'icon' | 'color_index'>;

/** 按板块 id / color_index 取稳定色槽索引 */
export function getBoardThemeIndex(board: BoardVisual | number): number {
  if (typeof board === 'object' && board.color_index != null && board.color_index >= 0) {
    return board.color_index % BOARD_PALETTE_SIZE;
  }
  const id = typeof board === 'number' ? board : board.id;
  return ((id % BOARD_PALETTE_SIZE) + BOARD_PALETTE_SIZE) % BOARD_PALETTE_SIZE;
}

/** 解析板块图标：优先使用后台配置，否则按 id 回退 */
export function getBoardIcon(board: BoardVisual | number): LucideIcon {
  if (typeof board === 'object' && board.icon && ICON_MAP[board.icon]) {
    return ICON_MAP[board.icon];
  }
  return DEFAULT_ICONS[getBoardThemeIndex(board)];
}

export function getBoardIconOption(key: string | undefined) {
  if (!key) return undefined;
  return BOARD_ICON_OPTIONS.find(o => o.key === key);
}
