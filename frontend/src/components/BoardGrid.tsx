import { Button } from '@/components/ui/button';
import { LayoutGrid, Folder, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Board } from '../api/types';
import { useAuth } from '../hooks/useAuth';

interface Props {
  boards: Board[];
  loading?: boolean;
  selectedId?: number;
  onSelect: (id: number) => void;
}

export default function BoardGrid({ boards, loading = false, selectedId = 0, onSelect }: Props) {
  const nav = useNavigate();
  const { user } = useAuth();

  if (loading) {
    return (
      <div className="board-grid board-grid--skeleton" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="board-tab board-tab--skeleton" />
        ))}
      </div>
    );
  }

  if (boards.length === 0) {
    return (
      <div className="board-grid-empty">
        <p className="text-sm text-muted-foreground py-4 text-center">
          {user?.role === 'admin' ? '还没有板块，请先创建' : '管理员尚未创建板块'}
        </p>
        {user?.role === 'admin' && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <Button onClick={() => nav('/boards')}>
              <Plus />
              创建板块
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="board-grid">
      <button
        type="button"
        className={`board-tab ${selectedId === 0 ? 'active' : ''}`}
        onClick={() => onSelect(0)}
      >
        <span className="board-tab-icon"><LayoutGrid size={16} /></span>
        <span className="board-tab-name">全部帖子</span>
      </button>
      {boards.map(b => (
        <button
          key={b.id}
          type="button"
          className={`board-tab ${selectedId === b.id ? 'active' : ''}`}
          title={b.description ? `${b.name} — ${b.description}` : b.name}
          onClick={() => onSelect(b.id)}
        >
          <span className="board-tab-icon"><Folder size={16} /></span>
          <span className="board-tab-name">{b.name}</span>
        </button>
      ))}
    </div>
  );
}
