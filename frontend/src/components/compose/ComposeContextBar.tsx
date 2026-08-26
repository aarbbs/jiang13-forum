import TagInput from '../TagInput';
import BoardIconDisplay from '../BoardIconDisplay';
import { getBoardThemeIndex } from '../../utils/boardTheme';
import type { Board, ForumLimitsPublic } from '../../api/types';

export type PostType = 'normal' | 'question' | 'poll' | 'bounty' | 'lottery';

const SPECIAL_TYPE_LABELS: Record<'poll' | 'bounty' | 'lottery', string> = {
  poll: '投票',
  bounty: '悬赏',
  lottery: '抽奖',
};

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
  const isSpecialEdit = isEdit && (postType === 'poll' || postType === 'bounty' || postType === 'lottery');

  return (
    <section className="compose-context" aria-label="发布设置">
      <div className="compose-context-row">
        <span className="compose-context-label">类型</span>
        <div className="compose-type-field">
          <div className="compose-type-pills" role="radiogroup" aria-label="帖子类型">
            {isSpecialEdit ? (
              <button
                type="button"
                role="radio"
                aria-checked
                className="compose-type-pill active"
                disabled
              >
                {SPECIAL_TYPE_LABELS[postType]}
              </button>
            ) : (
              <>
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
                  disabled={isEdit}
                >
                  问答
                </button>
                {!isEdit && (
                  <>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={postType === 'poll'}
                      className={`compose-type-pill${postType === 'poll' ? ' active' : ''}`}
                      onClick={() => onPostTypeChange('poll')}
                    >
                      投票
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={postType === 'bounty'}
                      className={`compose-type-pill${postType === 'bounty' ? ' active' : ''}`}
                      onClick={() => onPostTypeChange('bounty')}
                    >
                      悬赏
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={postType === 'lottery'}
                      className={`compose-type-pill${postType === 'lottery' ? ' active' : ''}`}
                      onClick={() => onPostTypeChange('lottery')}
                    >
                      抽奖
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          {postType === 'question' && (
            <span className="compose-type-hint">问答可标记解决状态</span>
          )}
          {postType === 'poll' && (
            <span className="compose-type-hint">
              {isEdit ? '投票选项发布后不可修改' : '发布后选项不可修改'}
            </span>
          )}
          {postType === 'bounty' && (
            <span className="compose-type-hint">发布成功即扣除积分；有人回复后不可自行取消，需采纳或联系管理员</span>
          )}
          {postType === 'lottery' && (
            <span className="compose-type-hint">回帖参与，手动开奖</span>
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
