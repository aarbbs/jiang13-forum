import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
  /** 编辑已有帖子时为 true */
  isEdit?: boolean;
}

export default function UnsavedChangesDialog({ open, onStay, onLeave, isEdit = false }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent onEscapeKeyDown={onStay}>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
          <AlertDialogDescription>
            {isEdit
              ? '你对这篇文章的修改尚未保存，离开后将无法恢复。'
              : '你正在撰写的内容尚未发布，离开后将无法恢复。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>继续编辑</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={onLeave}
          >
            放弃并离开
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
