import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  page: number;
  totalPages: number;
  postTotal: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

/** 生成页码窗口：两端 + 当前邻页，中间用省略号 */
function buildPageItems(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= total) set.add(i);
  }
  // 靠近端点时多露出几页，避免 1 … 2 3 这种浪费
  if (current <= 3) {
    set.add(2);
    set.add(3);
    set.add(4);
  }
  if (current >= total - 2) {
    set.add(total - 1);
    set.add(total - 2);
    set.add(total - 3);
  }

  const sorted = [...set].sort((a, b) => a - b);
  const items: Array<number | 'gap'> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) items.push('gap');
    items.push(sorted[i]);
  }
  return items;
}

export default function FeedPagination({
  page,
  totalPages,
  postTotal,
  loading = false,
  onPageChange,
}: Props) {
  const [jumpInput, setJumpInput] = useState(String(page));
  const pageItems = buildPageItems(page, totalPages);
  const showJump = totalPages > 5;

  useEffect(() => {
    setJumpInput(String(page));
  }, [page]);

  const commitJump = () => {
    if (loading) return;
    const n = Number.parseInt(jumpInput, 10);
    if (!Number.isFinite(n)) {
      setJumpInput(String(page));
      return;
    }
    const target = Math.min(totalPages, Math.max(1, n));
    setJumpInput(String(target));
    if (target !== page) onPageChange(target);
  };

  return (
    <nav className="feed-pagination" aria-label="帖子分页">
      <p className="feed-pagination__meta" aria-live="polite">
        共 <strong>{postTotal}</strong> 条
      </p>

      <div className="feed-pagination__pages">
        <button
          type="button"
          className="feed-pagination__nav"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="上一页"
        >
          <ChevronLeft aria-hidden size={16} strokeWidth={2} />
        </button>

        {pageItems.map((item, idx) =>
          item === 'gap' ? (
            <span key={`gap-${idx}`} className="feed-pagination__gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={cn('feed-pagination__page', item === page && 'is-active')}
              disabled={loading || item === page}
              aria-label={`第 ${item} 页`}
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          className="feed-pagination__nav"
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="下一页"
        >
          <ChevronRight aria-hidden size={16} strokeWidth={2} />
        </button>
      </div>

      {showJump && (
        <form
          className="feed-pagination__jump"
          onSubmit={(e) => {
            e.preventDefault();
            commitJump();
          }}
        >
          <label htmlFor="feed-page-jump" className="feed-pagination__jump-label">
            跳至
          </label>
          <input
            id="feed-page-jump"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={jumpInput}
            disabled={loading}
            onChange={(e) => setJumpInput(e.target.value.replace(/\D/g, ''))}
            onBlur={commitJump}
            className="feed-pagination__jump-input"
            aria-label={`跳转到指定页，共 ${totalPages} 页`}
          />
          <span className="feed-pagination__jump-suffix">/ {totalPages}</span>
        </form>
      )}
    </nav>
  );
}
