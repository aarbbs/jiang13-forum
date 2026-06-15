import { useEffect, useState } from 'react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  onConfirm: (url: string) => void;
  onRemove?: () => void;
}

/** 文章编辑器链接输入弹窗 */
export function ArticleLinkDialog({
  open,
  onOpenChange,
  initialUrl = '',
  onConfirm,
  onRemove,
}: Props) {
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    if (open) setUrl(initialUrl || 'https://');
  }, [open, initialUrl]);

  const handleConfirm = () => {
    onConfirm(url.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="article-link-dialog">
        <DialogHeader>
          <DialogTitle>插入链接</DialogTitle>
          <DialogDescription>输入完整 URL，留空并确认可移除已有链接。</DialogDescription>
        </DialogHeader>
        <Input
          type="url"
          value={url}
          placeholder="https://"
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConfirm();
            }
          }}
          autoFocus
        />
        <DialogFooter className="article-link-dialog__footer">
          {onRemove && initialUrl ? (
            <Button type="button" variant="outline" onClick={() => { onRemove(); onOpenChange(false); }}>
              移除链接
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
