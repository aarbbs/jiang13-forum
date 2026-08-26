import type { Board } from '../api/types';

/** 板块图标背景色 */
const BOARD_COLORS = ['#2d8a55', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c', '#34495e'];

export function boardColor(id: number) {
  return BOARD_COLORS[id % BOARD_COLORS.length];
}

export function boardInitial(name: string) {
  return (name?.trim()?.[0] || '?').toUpperCase();
}

/** 是否为公告类板块（名称含「公告」或 megaphone 图标） */
function isAnnouncementBoard(board: Board): boolean {
  if (board.name.includes('公告')) return true;
  return (board.icon || '').trim() === 'megaphone';
}

/** 是否为闲聊类板块（名称含「闲聊」） */
function isCasualBoard(board: Board): boolean {
  return board.name.includes('闲聊');
}

/**
 * 发帖页板块排序：闲聊置顶、公告置底，其余保持 API 原序。
 * 仅用于发帖选择器，不影响侧栏/导航排序。
 */
export function sortBoardsForCompose(boards: Board[]): Board[] {
  const casual: Board[] = [];
  const middle: Board[] = [];
  const announcement: Board[] = [];
  for (const b of boards) {
    if (isCasualBoard(b)) casual.push(b);
    else if (isAnnouncementBoard(b)) announcement.push(b);
    else middle.push(b);
  }
  return [...casual, ...middle, ...announcement];
}
