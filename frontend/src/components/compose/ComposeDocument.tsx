import type { ReactNode } from 'react';
import ArticleEditor from '../ArticleEditor';
import type { ForumLimitsPublic } from '../../api/types';
import type { PostType } from './ComposeContextBar';

interface Props {
  postType: PostType;
  title: string;
  onTitleChange: (title: string) => void;
  content: string;
  onContentChange: (content: string) => void;
  limits: ForumLimitsPublic;
  /** 渲染于标题与编辑器之间的元信息条（如发布设置） */
  children?: ReactNode;
}

/**
 * 发帖页正文写作模块：标题输入框 + 富文本编辑器。
 * 受控组件，标题与正文状态由父级持有。
 */
export default function ComposeDocument({
  postType,
  title,
  onTitleChange,
  content,
  onContentChange,
  limits,
  children,
}: Props) {
  return (
    <div className="compose-document">
      <input
        className="compose-title"
        type="text"
        placeholder={postType === 'question' ? '用一句话描述你的问题…' : '输入文章标题…'}
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        maxLength={limits.post_title_max > 0 ? limits.post_title_max : undefined}
      />
      {children}
      <ArticleEditor
        value={content}
        onChange={onContentChange}
        placeholder="开始写作。按回车分段，选中文字后用工具栏设置格式。"
      />
    </div>
  );
}
