import { ArrowLeft, Send } from 'lucide-react';

interface Props {
  isEdit: boolean;
  publishing: boolean;
  /** 编辑场景下展示的可编辑剩余时间提示；新建时为空 */
  editWindowHint: string;
  /** 新建场景下展示的本地草稿提示；编辑时为空 */
  draftHint: string;
  onBack: () => void;
  onPublish: () => void;
}

/**
 * 发帖页顶部栏模块：返回按钮、页面标题、草稿/编辑时限提示与发布动作。
 * 仅承担展示与事件回传，不持有业务状态。
 */
export default function ComposeHeader({
  isEdit,
  publishing,
  editWindowHint,
  draftHint,
  onBack,
  onPublish,
}: Props) {
  return (
    <header className="compose-header">
      <div className="compose-header-left">
        <button type="button" className="compose-back" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>返回</span>
        </button>
        <h1 className="compose-header-title">{isEdit ? '编辑帖子' : '写新帖'}</h1>
        {editWindowHint && (
          <span className="compose-draft-hint" title={editWindowHint}>
            {editWindowHint}
          </span>
        )}
        {!isEdit && draftHint && (
          <span className="compose-draft-hint" title={draftHint}>
            {draftHint}
          </span>
        )}
      </div>
      <div className="compose-header-actions">
        <button
          type="button"
          className="compose-publish-btn"
          disabled={publishing}
          onClick={onPublish}
        >
          <Send size={16} />
          <span>{publishing ? (isEdit ? '保存中…' : '发布中…') : (isEdit ? '保存修改' : '发布')}</span>
        </button>
      </div>
    </header>
  );
}
