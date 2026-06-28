import { cn } from '@/lib/utils';
import { getBoardThemeIndex } from '../utils/boardTheme';
import type { Board } from '../api/types';

interface Props {
  board: Pick<Board, 'id' | 'name' | 'color_index'>;
  className?: string;
}

/** 按板块配置或 id 映射不同色标的 Badge */
export default function BoardBadge({ board, className }: Props) {
  const idx = getBoardThemeIndex(board);
  return (
    <span className={cn('board-badge', `board-badge--${idx}`, className)}>
      {board.name}
    </span>
  );
}
