import { useNavigate } from 'react-router-dom';
import { navigateFeed } from '../utils/feedCache';

interface Props {
  keyword: string;
  tag?: string;
  author?: string;
  postTotal: number;
  /** 搜索页用 h1；首页/板块页中间栏不再展示标题 */
  titleAs?: 'h1' | 'h2';
}

export default function FeedHeader({
  keyword,
  tag = '',
  author = '',
  postTotal,
  titleAs = 'h1',
}: Props) {
  const nav = useNavigate();

  const isSearch = !!(keyword || author);
  const isTag = !!tag;
  const filtered = isSearch || isTag;
  const TitleTag = titleAs;

  let title = '';
  if (isTag) title = `标签：${tag}`;
  else if (isSearch) title = '搜索结果';

  // 无标题且无操作时不占位
  if (!filtered) return null;

  return (
    <div className="feed-head feed-head--solo">
      <div className="feed-head__title">
        {title ? <TitleTag>{title}</TitleTag> : null}
        <span className="feed-head__meta feed-head__meta--count">共 {postTotal} 条</span>
      </div>
      {isTag && (
        <button
          type="button"
          className="feed-head__clear"
          onClick={() => navigateFeed(nav, '/')}
        >
          清除标签
        </button>
      )}
    </div>
  );
}
