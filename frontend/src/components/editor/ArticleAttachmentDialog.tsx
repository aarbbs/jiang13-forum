import { useRef, useState, type DragEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { api } from '@/api/client';
import { useForumLimits } from '@/hooks/useForumLimits';
import { Paperclip, X, FileText, Upload, Loader2 } from 'lucide-react';
import type { PostAttachmentInput } from '@/api/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachments: PostAttachmentInput[];
  onChange: (list: PostAttachmentInput[]) => void;
}

/** 从文件名提取小写、不含点的扩展名 */
function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(n >= 100 || u === 0 ? 0 : 1)} ${units[u]}`;
}

/**
 * 文章编辑器内的附件对话框：上传文件到对象存储/本地，提交时随帖子保存。
 * 类型、个数、大小限制来自后台配置（limits.post_file_*）。
 */
export function ArticleAttachmentDialog({ open, onOpenChange, attachments, onChange }: Props) {
  const { limits } = useForumLimits();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const allowed = limits.post_file_allowed_exts ?? [];
  const maxCount = limits.post_file_max_count;
  const maxMB = limits.post_file_max_mb;

  const disabled = allowed.length === 0;
  const remaining = maxCount > 0 ? Math.max(0, maxCount - attachments.length) : Infinity;

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    const valid: File[] = [];
    for (const f of files) {
      const ext = extOf(f.name);
      if (!allowed.includes(ext)) {
        notify.warning(`不支持的文件类型：${ext || '无扩展名'}`);
        continue;
      }
      if (maxMB > 0 && f.size > maxMB * 1024 * 1024) {
        notify.warning(`「${f.name}」超过 ${maxMB}MB 大小限制`);
        continue;
      }
      valid.push(f);
    }
    if (!valid.length) return;
    if (maxCount > 0 && attachments.length + valid.length > maxCount) {
      notify.warning(`每个帖子最多上传 ${maxCount} 个文件`);
      return;
    }

    setUploading(true);
    const added: PostAttachmentInput[] = [];
    try {
      for (const f of valid) {
        try {
          const r = await api.uploadPostFile(f);
          added.push({ name: r.name, url: r.url, size: r.size, content_type: r.content_type });
        } catch (e: unknown) {
          notify.error(e instanceof Error ? e.message : '上传失败');
        }
      }
    } finally {
      setUploading(false);
    }
    if (added.length) {
      const seen = new Set(attachments.map(a => a.url));
      onChange([...attachments, ...added.filter(a => !seen.has(a.url))]);
    }
  };

  const remove = (url: string) => {
    onChange(attachments.filter(a => a.url !== url));
  };

  const onFileChange = (list: FileList | null) => {
    if (!list?.length) return;
    void handleFiles([...list]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    void handleFiles([...e.dataTransfer.files]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="article-attachment-dialog">
        <DialogHeader>
          <DialogTitle>附件</DialogTitle>
          <DialogDescription>
            {disabled
              ? '管理员未启用附件上传'
              : `支持类型：${allowed.map(e => `.${e}`).join(' / ')}${maxMB > 0 ? `；单个不超过 ${maxMB}MB` : ''}${maxCount > 0 ? `；最多 ${maxCount} 个` : ''}`}
          </DialogDescription>
        </DialogHeader>

        <div
          className={`article-attachment-dialog__drop${dragOver ? ' is-dragover' : ''}${uploading ? ' is-busy' : ''}${disabled ? ' is-disabled' : ''}`}
          onDragOver={e => {
            e.preventDefault();
            if (!uploading && !disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && !disabled && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          {uploading ? (
            <>
              <Loader2 size={24} className="article-attachment-dialog__spin" />
              <p>正在上传…</p>
            </>
          ) : (
            <>
              <Upload size={24} />
              <p>拖拽文件到此处，或点击选择文件</p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          accept={allowed.map(e => `.${e}`).join(',')}
          onChange={e => {
            onFileChange(e.target.files);
            e.target.value = '';
          }}
        />

        {attachments.length > 0 && (
          <ul className="article-attachment-dialog__list">
            {attachments.map(a => (
              <li key={a.url} className="article-attachment-dialog__item">
                <span className="article-attachment-dialog__file-icon" aria-hidden>
                  <FileText size={16} />
                </span>
                <span className="article-attachment-dialog__name" title={a.name}>{a.name}</span>
                <span className="article-attachment-dialog__size">{formatSize(a.size)}</span>
                <button
                  type="button"
                  className="article-attachment-dialog__remove"
                  aria-label={`移除 ${a.name}`}
                  onClick={() => remove(a.url)}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="article-attachment-dialog__footer">
          <span className="article-attachment-dialog__count">
            <Paperclip size={13} aria-hidden />
            {attachments.length}{maxCount > 0 ? ` / ${maxCount}` : ''}
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
