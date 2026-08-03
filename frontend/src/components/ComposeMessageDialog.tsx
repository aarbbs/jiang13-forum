import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { notify } from '@/lib/notify';
import { api } from '../api/client';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toUserId: number;
  toNickname: string;
  onSent?: () => void;
}

/** 发送私信对话框（对话式，无需标题） */
export default function ComposeMessageDialog({
  open,
  onOpenChange,
  toUserId,
  toNickname,
  onSent,
}: Props) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) setContent('');
    onOpenChange(next);
  };

  const submit = async () => {
    if (!content.trim()) {
      notify.warning('请填写内容');
      return;
    }
    setSending(true);
    try {
      await api.sendMessage({
        to_user_id: toUserId,
        content: content.trim(),
      });
      notify.success('私信已发送');
      handleOpenChange(false);
      onSent?.();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>发送私信</DialogTitle>
          <DialogDescription>发给 {toNickname}</DialogDescription>
        </DialogHeader>
        <div className="pm-compose-fields">
          <label className="pm-field">
            <span className="sr-only">内容</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="写点什么…"
              autoFocus
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>取消</Button>
          <Button loading={sending} onClick={submit}>发送</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
