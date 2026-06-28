import { cn } from '@/lib/utils';
import {
  BOARD_ICON_OPTIONS,
  BOARD_PALETTE_SIZE,
  getBoardIcon,
  getBoardThemeIndex,
} from '../utils/boardTheme';
import type { Board } from '../api/types';

interface IconPickerProps {
  value: string;
  onChange: (key: string) => void;
  board: Pick<Board, 'id' | 'color_index'>;
}

interface ColorPickerProps {
  value: number;
  onChange: (index: number) => void;
  boardId: number;
}

/** 板块图标选择器 */
export function BoardIconPicker({ value, onChange, board }: IconPickerProps) {
  const previewBoard = { id: board.id, icon: value || undefined, color_index: board.color_index };
  const PreviewIcon = getBoardIcon(previewBoard);
  const themeIdx = getBoardThemeIndex(previewBoard);

  return (
    <div className="board-appearance-picker">
      <div className="board-appearance-picker__preview">
        <span className={cn('board-appearance-picker__preview-icon', `sidebar-board-icon--${themeIdx}`)}>
          <PreviewIcon aria-hidden />
        </span>
        <span className="board-appearance-picker__preview-hint">预览</span>
      </div>
      <div className="board-icon-grid" role="listbox" aria-label="选择板块图标">
        <button
          type="button"
          role="option"
          aria-selected={!value}
          className={cn('board-icon-option', !value && 'board-icon-option--active')}
          title="自动（按板块 ID）"
          onClick={() => onChange('')}
        >
          <span className="board-icon-option__auto">A</span>
        </button>
        {BOARD_ICON_OPTIONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={value === key}
            aria-label={label}
            title={label}
            className={cn('board-icon-option', value === key && 'board-icon-option--active')}
            onClick={() => onChange(key)}
          >
            <Icon aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

/** 板块色标选择器（-1 为自动） */
export function BoardColorPicker({ value, onChange, boardId }: ColorPickerProps) {
  return (
    <div className="board-color-grid" role="listbox" aria-label="选择板块色标">
      <button
        type="button"
        role="option"
        aria-selected={value < 0}
        className={cn('board-color-option board-color-option--auto', value < 0 && 'board-color-option--active')}
        title="自动（按板块 ID）"
        onClick={() => onChange(-1)}
      >
        A
      </button>
      {Array.from({ length: BOARD_PALETTE_SIZE }, (_, i) => (
        <button
          key={i}
          type="button"
          role="option"
          aria-selected={value === i}
          className={cn('board-color-option', `board-color-option--${i}`, value === i && 'board-color-option--active')}
          title={`色标 ${i + 1}`}
          onClick={() => onChange(i)}
        />
      ))}
    </div>
  );
}
