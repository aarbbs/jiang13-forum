import { X } from 'lucide-react';
import type { Board } from '../../api/types';
import type { PostSearchState, SearchFilterKey } from '../../hooks/usePostSearch';
import { dispatchOpenPostSearch } from '../../hooks/usePostSearch';

interface Props {
  filters: PostSearchState;
  boards: Board[];
  onRemove: (key: SearchFilterKey) => void;
  onClear: () => void;
}

export default function FeedSearchFilters({ filters, boards, onRemove, onClear }: Props) {
  const { keyword, author, titleOnly, scopeBoardId } = filters;
  if (!keyword && !author) return null;

  const boardName = scopeBoardId > 0
    ? boards.find((b) => b.id === scopeBoardId)?.name || '当前板块'
    : '';

  return (
    <div className="search-filter-bar">
      <div className="search-filter-bar__chips" role="list">
        {keyword && (
          <span className="search-filter-chip" role="listitem">
            <span className="search-filter-chip__text">关键词「{keyword}」</span>
            <button
              type="button"
              className="search-filter-chip__remove"
              aria-label={`移除关键词 ${keyword}`}
              onClick={() => onRemove('keyword')}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
        {author && (
          <span className="search-filter-chip" role="listitem">
            <span className="search-filter-chip__text">作者 {author}</span>
            <button
              type="button"
              className="search-filter-chip__remove"
              aria-label={`移除作者 ${author}`}
              onClick={() => onRemove('author')}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
        {titleOnly && keyword && (
          <span className="search-filter-chip" role="listitem">
            <span className="search-filter-chip__text">仅标题</span>
            <button
              type="button"
              className="search-filter-chip__remove"
              aria-label="取消仅标题"
              onClick={() => onRemove('titleOnly')}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
        {scopeBoardId > 0 && boardName && (
          <span className="search-filter-chip" role="listitem">
            <span className="search-filter-chip__text">板块：{boardName}</span>
            <button
              type="button"
              className="search-filter-chip__remove"
              aria-label={`移除板块 ${boardName}`}
              onClick={() => onRemove('board')}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        )}
      </div>
      <div className="search-filter-bar__actions">
        <button type="button" className="search-filter-bar__link" onClick={dispatchOpenPostSearch}>
          修改搜索
        </button>
        <button type="button" className="search-filter-bar__link search-filter-bar__link--muted" onClick={onClear}>
          清除全部
        </button>
      </div>
    </div>
  );
}
