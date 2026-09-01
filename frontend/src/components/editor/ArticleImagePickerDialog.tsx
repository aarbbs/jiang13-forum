import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { api } from '@/api/client';
import type { MediaItem } from '@/api/types';
import { toPostImageThumbSrc } from '@/utils/postContent';
import { Upload, Link2, Images, Loader2 } from 'lucide-react';

export type ImagePickerTarget = 'rich' | 'markdown';
type PickerTab = 'upload' | 'link' | 'gallery';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 上传或选中后插入一张或多张图片 URL */
  onInsert: (urls: string[]) => void;
}

/** 校验可插入的图片地址：外链或站内绝对路径 */
export function isValidImageSrc(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
const PAGE_SIZE = 24;

/** 文章编辑器：统一图片插入（上传 / 链接 / 我的图片） */
export function ArticleImagePickerDialog({
  open,
  onOpenChange,
  onInsert,
}: Props) {
  const [tab, setTab] = useState<PickerTab>('upload');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gallery, setGallery] = useState<MediaItem[]>([]);
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryTotalPages, setGalleryTotalPages] = useState(1);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryLoaded, setGalleryLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const resetState = useCallback(() => {
    setTab('upload');
    setUrl('');
    setUploading(false);
    setDragOver(false);
    setGallery([]);
    setGalleryPage(1);
    setGalleryTotalPages(1);
    setGalleryLoading(false);
    setGalleryLoaded(false);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    if (open) resetState();
  }, [open, resetState]);

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const finishInsert = (urls: string[]) => {
    if (!urls.length) return;
    onInsert(urls);
    handleOpenChange(false);
  };

  const uploadFiles = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (!images.length) {
      notify.warning('请选择图片文件（jpeg / png / gif / webp）');
      return;
    }
    setUploading(true);
    const urls: string[] = [];
    try {
      for (const file of images) {
        try {
          const { url: uploaded } = await api.uploadPostImage(file);
          urls.push(uploaded);
        } catch (e: unknown) {
          notify.error(e instanceof Error ? e.message : '图片上传失败');
        }
      }
      if (urls.length) finishInsert(urls);
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (list: FileList | null) => {
    if (!list?.length) return;
    void uploadFiles([...list]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    void uploadFiles([...e.dataTransfer.files]);
  };

  const handleLinkInsert = () => {
    const next = url.trim();
    if (!next) {
      notify.warning('请输入图片地址');
      return;
    }
    if (!isValidImageSrc(next)) {
      notify.warning('请使用 http(s) 外链或本站以 / 开头的路径');
      return;
    }
    finishInsert([next]);
  };

  const loadGallery = useCallback(async (page: number, append: boolean) => {
    setGalleryLoading(true);
    try {
      const res = await api.myPostImages({ page, size: PAGE_SIZE });
      setGallery(prev => (append ? [...prev, ...res.files] : res.files));
      setGalleryPage(res.page);
      setGalleryTotalPages(res.total_pages);
      setGalleryLoaded(true);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载图片失败');
      setGalleryLoaded(true);
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && tab === 'gallery' && !galleryLoaded && !galleryLoading) {
      void loadGallery(1, false);
    }
  }, [open, tab, galleryLoaded, galleryLoading, loadGallery]);

  const toggleSelect = (itemUrl: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(itemUrl)) next.delete(itemUrl);
      else next.add(itemUrl);
      return next;
    });
  };

  const handleGalleryInsert = () => {
    if (!selected.size) {
      notify.warning('请先选择图片');
      return;
    }
    // 保持网格出现顺序
    const urls = gallery.filter(f => selected.has(f.url)).map(f => f.url);
    finishInsert(urls);
  };

  const tabs: { id: PickerTab; label: string; icon: typeof Upload }[] = [
    { id: 'upload', label: '上传', icon: Upload },
    { id: 'link', label: '链接', icon: Link2 },
    { id: 'gallery', label: '我的图片', icon: Images },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="article-image-picker">
        <DialogHeader>
          <DialogTitle>插入图片</DialogTitle>
          <DialogDescription>
            上传本地文件、粘贴链接，或从已上传图库中选择。
          </DialogDescription>
        </DialogHeader>

        <div className="article-image-picker__tabs" role="tablist">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`article-image-picker__tab${tab === t.id ? ' is-active' : ''}`}
                onClick={() => setTab(t.id)}
                disabled={uploading}
              >
                <Icon size={14} aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'upload' && (
          <div className="article-image-picker__panel">
            <div
              className={`article-image-picker__drop${dragOver ? ' is-dragover' : ''}${uploading ? ' is-busy' : ''}`}
              onDragOver={e => {
                e.preventDefault();
                if (!uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              {uploading ? (
                <>
                  <Loader2 size={28} className="article-image-picker__spin" />
                  <p>正在上传…</p>
                </>
              ) : (
                <>
                  <Upload size={28} />
                  <p>拖拽图片到此处，或点击选择文件</p>
                  <span>支持 jpeg / png / gif / webp；多选将并排成图组</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={e => {
                onFileChange(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {tab === 'link' && (
          <div className="article-image-picker__panel">
            <Input
              type="url"
              value={url}
              placeholder="https://… 或 /uploads/posts/…"
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLinkInsert();
                }
              }}
              autoFocus
            />
            <p className="article-image-picker__hint">
              粘贴外链或本站已上传地址，无需重复上传。
            </p>
            <DialogFooter className="article-image-picker__footer">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button type="button" onClick={handleLinkInsert}>
                插入
              </Button>
            </DialogFooter>
          </div>
        )}

        {tab === 'gallery' && (
          <div className="article-image-picker__panel">
            {galleryLoading && !gallery.length ? (
              <div className="article-image-picker__empty">
                <Loader2 size={22} className="article-image-picker__spin" />
                <span>加载中…</span>
              </div>
            ) : !gallery.length ? (
              <div className="article-image-picker__empty">暂无上传记录</div>
            ) : (
              <>
                <div className="article-image-picker__grid">
                  {gallery.map(item => {
                    const thumb = toPostImageThumbSrc(item.url) || item.url;
                    const isSel = selected.has(item.url);
                    return (
                      <button
                        key={item.url}
                        type="button"
                        className={`article-image-picker__thumb${isSel ? ' is-selected' : ''}`}
                        title={item.name}
                        onClick={() => toggleSelect(item.url)}
                      >
                        <img src={thumb} alt={item.name} loading="lazy" />
                      </button>
                    );
                  })}
                </div>
                {galleryPage < galleryTotalPages && (
                  <div className="article-image-picker__more">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={galleryLoading}
                      onClick={() => void loadGallery(galleryPage + 1, true)}
                    >
                      {galleryLoading ? '加载中…' : '加载更多'}
                    </Button>
                  </div>
                )}
              </>
            )}
            <DialogFooter className="article-image-picker__footer">
              <span className="article-image-picker__selected-count">
                已选 {selected.size}
              </span>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                取消
              </Button>
              <Button type="button" disabled={!selected.size} onClick={handleGalleryInsert}>
                插入选中
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
