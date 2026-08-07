import TagInput from '../TagInput';
import BoardIconDisplay from '../BoardIconDisplay';
import { getBoardThemeIndex } from '../../utils/boardTheme';
import type { Board, ForumLimitsPublic } from '../../api/types';

export type PostType = 'normal' | 'question';

interface Props {
  isEdit: boolean;
  postType: PostType;
  onPostTypeChange: (type: PostType) => void;
  boards: Board[];
  boardId: string;
  onBoardChange: (boardId: string) => void;
  tags: string;
  onTagsChange: (tags: string) => void;
  limits: ForumLimitsPublic;
}

/**
 * 发帖页发布设置模块：帖子类型、板块、标签三行配置。
 * 受控组件，所有状态由父级持有。
 */
export default function ComposeContextBar({
  isEdit,
  postType,
  onPostTypeChange,
  boards,
  boardId,
  onBoardChange,
  tags,
  onTagsChange,
  limits,
}: Props) {
  return (
    <section className="compose-context" aria-label="发布设置">
      <div className="compose-context-row">
        <span className="compose-context-label">类型</span>
        <div className="compose-type-field">
          <div className="compose-type-pills" role="radiogroup" aria-label="帖子类型">
            <button
              type="button"
              role="radio"
              aria-checked={postType === 'normal'}
              className={`compose-type-pill${postType === 'normal' ? ' active' : ''}`}
              onClick={() => onPostTypeChange('normal')}
            >
              讨论
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={postType === 'question'}
              className={`compose-type-pill${postType === 'question' ? ' active' : ''}`}
              onClick={() => onPostTypeChange('question')}
            >
              问答
            </button>
          </div>
          {postType === 'question' && (
            <span className="compose-type-hint">问答可标记解决状态</span>
          )}
        </div>
      </div>
      <div className="compose-context-row">
        <span className="compose-context-label">板块</span>
        <div
          className="compose-board-pills"
          role="listbox"
          aria-label={isEdit ? '修改板块' : '选择板块'}
        >
          {boards.map(b => {
            const themeIdx = getBoardThemeIndex(b);
            const isActive = String(b.id) === boardId;
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`compose-board-pill compose-board-pill--${themeIdx}${isActive ? ' active' : ''}`}
                onClick={() => onBoardChange(String(b.id))}
              >
                <BoardIconDisplay
                  board={b}
                  className="compose-board-icon"
                />
                <span>{b.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="compose-context-row compose-context-row--tags">
        <span className="compose-context-label">标签</span>
        <TagInput
          value={tags}
          onChange={onTagsChange}
          placeholder="添加标签，回车确认"
          maxLength={limits.post_tags_max > 0 ? limits.post_tags_max : undefined}
        />
      </div>
    </section>
  );
}
