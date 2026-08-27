import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '../../api/client';
import { useMediaQuery } from '../../hooks/useTheme';
import { useForumLimits } from '../../hooks/useForumLimits';
import {
  getRecentSearches,
  type PostSearchSubmitInput,
  type RecentSearch,
} from '../../hooks/usePostSearch';
import { cn } from '@/lib/utils';

export interface PostSearchDraft {
  keyword: string;
  author: string;
  titleOnly: boolean;
  scopeBoardId: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: PostSearchDraft;
  contextBoardId: number;
  contextBoardName?: string;
  onSubmit: (input: PostSearchSubmitInput) => boolean;
  onClear: () => void;
}

type UserSuggest = { id: number; username: string; nickname: string; avatar?: string };

export default function PostSearchPanel({
  open,
  onOpenChange,
  draft,
  contextBoardId,
  contextBoardName = '',
  onSubmit,
  onClear,
}: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { limits } = useForumLimits();
  const keywordRef = useRef<HTMLInputElement>(null);

  const [keyword, setKeyword] = useState(draft.keyword);
  const [author, setAuthor] = useState(draft.author);
  const [titleOnly, setTitleOnly] = useState(draft.titleOnly);
  const [scopeBoardId, setScopeBoardId] = useState(draft.scopeBoardId);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [suggestions, setSuggestions] = useState<UserSuggest[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const authorWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setKeyword(draft.keyword);
    setAuthor(draft.author);
    setTitleOnly(draft.titleOnly);
    setScopeBoardId(draft.scopeBoardId);
    setRecent(getRecentSearches());
    setSuggestions([]);
    setSuggestOpen(false);
    const t = window.setTimeout(() => keywordRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open, draft]);

  useEffect(() => {
    if (!open) return;
    const q = author.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.searchUsers(q, 8).then((r) => {
        if (cancelled) return;
        const users = Array.isArray(r.users) ? r.users : [];
        setSuggestions(users);
        setSuggestOpen(users.length > 0);
      }).catch(() => {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestOpen(false);
        }
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [author, open]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (authorWrapRef.current?.contains(e.target as Node)) return;
      setSuggestOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [suggestOpen]);

  const handleSubmit = useCallback(() => {
    const ok = onSubmit({
      keyword,
      author,
      titleOnly: !!keyword.trim() && titleOnly,
      scopeBoardId: scopeBoardId > 0 ? scopeBoardId : 0,
    });
    if (ok) onOpenChange(false);
  }, [keyword, author, titleOnly, scopeBoardId, onSubmit, onOpenChange]);

  const applyRecent = (item: RecentSearch) => {
    setKeyword(item.keyword);
    setAuthor(item.author);
    setTitleOnly(item.titleOnly);
    setScopeBoardId(item.scopeBoardId);
  };

  const pickAuthor = (u: UserSuggest) => {
    setAuthor(u.nickname || u.username);
    setSuggestOpen(false);
  };

  const showBoardScope = contextBoardId > 0;
  const kwHint = limits.search_keyword_min > 1
    ? `关键词 ${limits.search_keyword_min}–${limits.search_keyword_max} 字`
    : `关键词最多 ${limits.search_keyword_max} 字`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'post-search-panel',
          isMobile && 'post-search-panel--mobile',
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isMobile && <div className="post-search-panel__handle" aria-hidden />}
        <DialogHeader className="post-search-panel__header">
          <DialogTitle>搜索帖子</DialogTitle>
          {!isMobile && (
            <DialogDescription className="post-search-panel__desc">
              按关键词、作者或板块范围查找帖子
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="post-search-panel__body">
          <label className="post-search-field">
            <span className="post-search-field__label">关键词</span>
            <div className="post-search-field__input-wrap">
              <Search size={16} aria-hidden className="post-search-field__icon" />
              <input
                ref={keywordRef}
                type="search"
                className="post-search-field__input"
                placeholder="输入标题或正文关键词…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                maxLength={limits.search_keyword_max > 0 ? limits.search_keyword_max : undefined}
                enterKeyHint="search"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
            </div>
            <span className="post-search-field__hint">{kwHint}</span>
          </label>

          <label className="post-search-field">
            <span className="post-search-field__label">作者</span>
            <div className="post-search-field__input-wrap" ref={authorWrapRef}>
              <User size={16} aria-hidden className="post-search-field__icon" />
              <input
                type="text"
                className="post-search-field__input"
                placeholder="用户名或昵称"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                onFocus={() => suggestions.length > 0 && setSuggestOpen(true)}
                autoComplete="off"
              />
              {suggestOpen && suggestions.length > 0 && (
                <ul className="search-author-suggest" role="listbox">
                  {suggestions.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="search-author-suggest__item"
                        role="option"
                        onClick={() => pickAuthor(u)}
                      >
                        {u.avatar
                          ? <img src={u.avatar} alt="" className="search-author-suggest__avatar" loading="lazy" />
                          : <span className="search-author-suggest__avatar search-author-suggest__avatar--ph">{(u.nickname || u.username).charAt(0)}</span>}
                        <span className="search-author-suggest__name">{u.nickname || u.username}</span>
                        {u.nickname && u.username !== u.nickname && (
                          <span className="search-author-suggest__user">@{u.username}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </label>

          {showBoardScope && (
            <div className="post-search-field">
              <span className="post-search-field__label">范围</span>
              <div className="search-scope-pills" role="group" aria-label="搜索范围">
                <button
                  type="button"
                  className={cn('search-scope-pill', scopeBoardId === 0 && 'active')}
                  aria-pressed={scopeBoardId === 0}
                  onClick={() => setScopeBoardId(0)}
                >
                  全站
                </button>
                <button
                  type="button"
                  className={cn('search-scope-pill', scopeBoardId === contextBoardId && 'active')}
                  aria-pressed={scopeBoardId === contextBoardId}
                  onClick={() => setScopeBoardId(contextBoardId)}
                >
                  {contextBoardName || '当前板块'}
                </button>
              </div>
            </div>
          )}

          <div className="post-search-field post-search-field--row">
            <div>
              <span className="post-search-field__label">仅搜标题</span>
              <span className="post-search-field__hint">需填写关键词时生效</span>
            </div>
            <Switch
              checked={titleOnly}
              onCheckedChange={setTitleOnly}
              disabled={!keyword.trim()}
              aria-label="仅搜索标题"
            />
          </div>

          {recent.length > 0 && (
            <div className="post-search-recent">
              <span className="post-search-field__label">最近搜索</span>
              <ul className="post-search-recent__list">
                {recent.map((item) => {
                  const label = [
                    item.keyword && `「${item.keyword}」`,
                    item.author && `@${item.author}`,
                    item.titleOnly && '仅标题',
                    item.scopeBoardId > 0 && '本板块',
                  ].filter(Boolean).join(' · ') || '搜索';
                  return (
                    <li key={`${item.keyword}-${item.author}-${item.at}`}>
                      <button
                        type="button"
                        className="post-search-recent__item"
                        onClick={() => applyRecent(item)}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className={cn('post-search-panel__footer', isMobile && 'post-search-panel__footer--mobile')}>
          <Button
            type="button"
            variant="outline"
            className={isMobile ? 'post-search-panel__btn' : undefined}
            onClick={() => {
              setKeyword('');
              setAuthor('');
              setTitleOnly(false);
              setScopeBoardId(0);
              onClear();
            }}
          >
            清除
          </Button>
          <Button type="button" className={isMobile ? 'post-search-panel__btn' : undefined} onClick={handleSubmit}>
            搜索
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
