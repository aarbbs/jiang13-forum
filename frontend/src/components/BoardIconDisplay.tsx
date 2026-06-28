import { getBoardIcon } from '../utils/boardTheme';
import type { Board } from '../api/types';

/** 渲染板块 Lucide 图标 */
export default function BoardIconDisplay({
  board,
  className,
}: {
  board: Pick<Board, 'id' | 'icon' | 'color_index'>;
  className?: string;
}) {
  const Icon = getBoardIcon(board);
  return <Icon className={className} aria-hidden />;
}
