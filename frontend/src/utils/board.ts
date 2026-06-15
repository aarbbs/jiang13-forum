/** 板块图标背景色 */
const BOARD_COLORS = ['#2d8a55', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c', '#34495e'];

export function boardColor(id: number) {
  return BOARD_COLORS[id % BOARD_COLORS.length];
}

export function boardInitial(name: string) {
  return (name?.trim()?.[0] || '?').toUpperCase();
}
