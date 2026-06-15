import { highlightMentions } from '../utils/content';

interface Props {
  content: string;
  onMentionClick?: (name: string) => void;
}

/** 渲染评论正文（支持正文内 @ 高亮） */
export default function CommentContent({ content, onMentionClick }: Props) {
  return (
    <div
      className="floor-body"
      dangerouslySetInnerHTML={{
        __html: highlightMentions(content, onMentionClick),
      }}
    />
  );
}
