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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface TableInsertOptions {
  rows: number;
  cols: number;
  withHeaderRow: boolean;
}

const DEFAULT_OPTS: TableInsertOptions = {
  rows: 3,
  cols: 3,
  withHeaderRow: true,
};

const MIN_SIZE = 1;
const MAX_ROWS = 20;
const MAX_COLS = 10;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 光标已在表格内时显示「删除表格」 */
  editing?: boolean;
  onConfirm: (opts: TableInsertOptions) => void;
  onRemove?: () => void;
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** 文章编辑器：插入表格（行列与表头） */
export function ArticleTableDialog({
  open,
  onOpenChange,
  editing = false,
  onConfirm,
  onRemove,
}: Props) {
  const [rows, setRows] = useState(String(DEFAULT_OPTS.rows));
  const [cols, setCols] = useState(String(DEFAULT_OPTS.cols));
  const [withHeaderRow, setWithHeaderRow] = useState(DEFAULT_OPTS.withHeaderRow);

  useEffect(() => {
    if (!open) return;
    setRows(String(DEFAULT_OPTS.rows));
    setCols(String(DEFAULT_OPTS.cols));
    setWithHeaderRow(DEFAULT_OPTS.withHeaderRow);
  }, [open]);

  const handleConfirm = () => {
    onConfirm({
      rows: clampInt(rows, MIN_SIZE, MAX_ROWS, DEFAULT_OPTS.rows),
      cols: clampInt(cols, MIN_SIZE, MAX_COLS, DEFAULT_OPTS.cols),
      withHeaderRow,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="article-table-dialog sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{editing ? '表格' : '插入表格'}</DialogTitle>
          <DialogDescription>
            {editing
              ? '可再插入一张新表，或删除当前表格。也可用工具栏增删行列。'
              : '选择行数与列数。源码模式会写入 GFM（GitHub 风格 Markdown）管道表。'}
          </DialogDescription>
        </DialogHeader>

        <div className="article-table-dialog__body">
          <div className="article-table-dialog__grid">
            <div className="article-table-dialog__field">
              <Label htmlFor="article-table-rows">行数</Label>
              <Input
                id="article-table-rows"
                type="number"
                min={MIN_SIZE}
                max={MAX_ROWS}
                value={rows}
                onChange={e => setRows(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="article-table-dialog__field">
              <Label htmlFor="article-table-cols">列数</Label>
              <Input
                id="article-table-cols"
                type="number"
                min={MIN_SIZE}
                max={MAX_COLS}
                value={cols}
                onChange={e => setCols(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
              />
            </div>
          </div>

          <div className="article-table-dialog__toggle">
            <div className="article-table-dialog__toggle-text">
              <Label htmlFor="article-table-header">首行为表头</Label>
              <p>表头单元格使用加粗样式</p>
            </div>
            <Switch
              id="article-table-header"
              checked={withHeaderRow}
              onCheckedChange={setWithHeaderRow}
            />
          </div>
        </div>

        <DialogFooter className="article-table-dialog__footer">
          {editing && onRemove ? (
            <Button
              type="button"
              variant="outline"
              className="article-table-dialog__remove"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              删除表格
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm}>
            插入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
