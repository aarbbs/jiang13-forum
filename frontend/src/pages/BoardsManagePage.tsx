import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../api/client';
import { useAdminGuard } from '../layouts/AdminLayout';
import type { Board } from '../api/types';
import { BoardColorPicker, BoardIconPicker } from '../components/BoardAppearancePicker';
import BoardIconDisplay from '../components/BoardIconDisplay';
import { getBoardThemeIndex } from '../utils/boardTheme';

const boardSchema = z.object({
  name: z.string().min(1, '请输入名称').max(64),
  description: z.string().max(500).optional(),
  sort_order: z.coerce.number().min(0),
  icon: z.string().max(64).optional(),
  color_index: z.coerce.number().min(-1).max(7),
});

type BoardFormValues = z.infer<typeof boardSchema>;

export default function BoardsManagePage() {
  const { ready } = useAdminGuard();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Board | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<BoardFormValues>({
    resolver: zodResolver(boardSchema),
    defaultValues: { name: '', description: '', sort_order: 1, icon: '', color_index: -1 },
  });

  const watchColorIndex = form.watch('color_index');
  const editingPreviewId = editing?.id ?? boards.length + 1;

  const load = () => {
    setLoading(true);
    api.boards()
      .then(d => setBoards(d.boards ?? []))
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (ready) load();
  }, [ready]);

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: '', description: '', sort_order: boards.length + 1, icon: '', color_index: -1 });
    setModalOpen(true);
  };

  const openEdit = (board: Board) => {
    setEditing(board);
    form.reset({
      name: board.name,
      description: board.description ?? '',
      sort_order: board.sort_order,
      icon: board.icon ?? '',
      color_index: board.color_index ?? -1,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: BoardFormValues) => {
    setSubmitting(true);
    try {
      const body = {
        name: values.name,
        description: values.description ?? '',
        sort_order: values.sort_order,
        icon: values.icon ?? '',
        color_index: values.color_index ?? -1,
      };
      if (editing) {
        await api.updateBoard(editing.id, body);
        notify.success('板块已更新');
      } else {
        await api.createBoard(body);
        notify.success('板块已创建');
      }
      setModalOpen(false);
      load();
      window.dispatchEvent(new Event('boards-refresh'));
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteBoard(id);
      notify.success('板块已删除');
      load();
      window.dispatchEvent(new Event('boards-refresh'));
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  if (!ready) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div className="admin-page-head-row">
          <div>
            <h1>板块管理</h1>
            <p>创建、编辑或删除论坛板块；可为每个板块自定义图标与色标</p>
          </div>
          <Button onClick={openCreate}>
            <Plus />
            新建板块
          </Button>
        </div>
      </div>

      <div className="admin-card">
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">ID</TableHead>
                    <TableHead className="w-[52px]">图标</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>简介</TableHead>
                    <TableHead className="w-[70px]">排序</TableHead>
                    <TableHead className="w-[80px]">帖子数</TableHead>
                    <TableHead className="w-[160px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boards.map(board => {
                    const themeIdx = getBoardThemeIndex(board);
                    return (
                    <TableRow key={board.id}>
                      <TableCell>{board.id}</TableCell>
                      <TableCell>
                        <span className={cn('board-table-icon', `sidebar-board-icon--${themeIdx}`)}>
                          <BoardIconDisplay board={board} />
                        </span>
                      </TableCell>
                      <TableCell><strong>{board.name}</strong></TableCell>
                      <TableCell className="max-w-[200px] truncate">{board.description}</TableCell>
                      <TableCell>{board.sort_order}</TableCell>
                      <TableCell><Badge variant="secondary">{board.post_count ?? 0}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(board)}>编辑</Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                删除
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>确定删除该板块？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  删除后该板块下的帖子将无法通过板块筛选，此操作不可撤销。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(board.id)}>
                                  删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {boards.length === 0 && (
                <div className="empty-state">
                  <FolderKanban className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
                  <p>还没有板块，点击右上角创建第一个</p>
                </div>
              )}
            </>
          )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="board-manage-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑板块' : '新建板块'}</DialogTitle>
            <DialogDescription>
              {editing ? '修改名称、简介、图标与色标后保存。' : '填写板块信息，创建后即可在发帖时选择。'}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>板块名称</FormLabel>
                    <FormControl>
                      <Input maxLength={64} placeholder="如：技术交流" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>简介</FormLabel>
                    <FormControl>
                      <Textarea rows={3} maxLength={500} placeholder="板块说明（可选）" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>板块图标</FormLabel>
                    <FormControl>
                      <BoardIconPicker
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        board={{ id: editingPreviewId, color_index: watchColorIndex }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color_index"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>色标颜色</FormLabel>
                    <FormControl>
                      <BoardColorPicker
                        value={field.value ?? -1}
                        onChange={field.onChange}
                        boardId={editingPreviewId}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>排序</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>取消</Button>
                <Button type="submit" loading={submitting}>{editing ? '保存' : '创建'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
