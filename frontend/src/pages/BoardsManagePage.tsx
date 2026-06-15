import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
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
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import type { Board } from '../api/types';

const boardSchema = z.object({
  name: z.string().min(1, '请输入名称').max(64),
  description: z.string().max(500).optional(),
  sort_order: z.coerce.number().min(0),
});

type BoardFormValues = z.infer<typeof boardSchema>;

export default function BoardsManagePage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Board | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<BoardFormValues>({
    resolver: zodResolver(boardSchema),
    defaultValues: { name: '', description: '', sort_order: 1 },
  });

  const load = () => {
    setLoading(true);
    api.boards()
      .then(d => setBoards(d.boards ?? []))
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }
    if (user.role !== 'admin') { nav('/'); notify.warning('需要管理员权限'); return; }
    load();
  }, [user, authLoading, nav]);

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: '', description: '', sort_order: boards.length + 1 });
    setModalOpen(true);
  };

  const openEdit = (board: Board) => {
    setEditing(board);
    form.reset({
      name: board.name,
      description: board.description ?? '',
      sort_order: board.sort_order,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: BoardFormValues) => {
    setSubmitting(true);
    try {
      if (editing) {
        await api.updateBoard(editing.id, values);
        notify.success('板块已更新');
      } else {
        await api.createBoard(values);
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

  if (authLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="page-wrap">
      <div className="page-inner-wide">
        <Button variant="ghost" className="mb-3" onClick={() => nav('/')}>
          <ArrowLeft />
          返回
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 className="page-title">板块管理</h1>
            <p className="page-desc">创建、编辑或删除论坛板块，用户发帖前需先有板块</p>
          </div>
          <Button onClick={openCreate}>
            <Plus />
            新建板块
          </Button>
        </div>

        <div className="section-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">ID</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>简介</TableHead>
                    <TableHead className="w-[70px]">排序</TableHead>
                    <TableHead className="w-[80px]">帖子数</TableHead>
                    <TableHead className="w-[160px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boards.map(board => (
                    <TableRow key={board.id}>
                      <TableCell>{board.id}</TableCell>
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
                  ))}
                </TableBody>
              </Table>
              {boards.length === 0 && (
                <div className="empty-state">
                  <p>还没有板块，点击右上角创建第一个</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '编辑板块' : '新建板块'}</DialogTitle>
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
