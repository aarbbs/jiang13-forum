import { useEffect, useMemo, useState } from 'react';
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
import {
  CODE_BLOCK_LANGUAGES,
  DEFAULT_CODE_BLOCK_OPTIONS,
  loadCodeBlockPrefs,
  saveCodeBlockPrefs,
  type CodeBlockInsertOptions,
} from '../../utils/codeBlockOptions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑已有代码块时的初始值；新建时用偏好 */
  initial?: Partial<CodeBlockInsertOptions> | null;
  /** 是否处于已有代码块（显示「移除」） */
  editing?: boolean;
  onConfirm: (opts: CodeBlockInsertOptions) => void;
  onRemove?: () => void;
}

/** 文章编辑器：插入 / 配置代码块 */
export function ArticleCodeBlockDialog({
  open,
  onOpenChange,
  initial,
  editing = false,
  onConfirm,
  onRemove,
}: Props) {
  const [language, setLanguage] = useState(DEFAULT_CODE_BLOCK_OPTIONS.language);
  const [lineNumbers, setLineNumbers] = useState(DEFAULT_CODE_BLOCK_OPTIONS.lineNumbers);
  const [collapsed, setCollapsed] = useState(DEFAULT_CODE_BLOCK_OPTIONS.collapsed);
  const [langQuery, setLangQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const prefs = loadCodeBlockPrefs();
    setLanguage(initial?.language ?? '');
    setLineNumbers(initial?.lineNumbers ?? prefs.lineNumbers);
    setCollapsed(initial?.collapsed ?? prefs.collapsed);
    setLangQuery('');
  }, [open, initial]);

  const filteredLangs = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return CODE_BLOCK_LANGUAGES;
    return CODE_BLOCK_LANGUAGES.filter(
      l => l.id.includes(q) || l.label.toLowerCase().includes(q),
    );
  }, [langQuery]);

  const handleConfirm = () => {
    const opts: CodeBlockInsertOptions = {
      language: language.trim().toLowerCase(),
      lineNumbers,
      collapsed,
    };
    saveCodeBlockPrefs(opts);
    onConfirm(opts);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="article-codeblock-dialog sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? '代码块设置' : '插入代码块'}</DialogTitle>
          <DialogDescription>
            选择语言与阅读展示。外观随站点亮/暗主题自动切换。源码模式会写成{' '}
            <code className="article-codeblock-dialog__codehint">{'```js lines collapsed'}</code>
            {' '}这类围栏，可直接手改。
          </DialogDescription>
        </DialogHeader>

        <div className="article-codeblock-dialog__body">
          <section className="article-codeblock-dialog__section">
            <Label htmlFor="codeblock-lang-search">语言</Label>
            <Input
              id="codeblock-lang-search"
              value={langQuery}
              placeholder="搜索语言…"
              onChange={e => setLangQuery(e.target.value)}
              autoFocus
            />
            <div className="article-codeblock-dialog__langs" role="listbox" aria-label="编程语言">
              {filteredLangs.map(lang => {
                const active = language === lang.id;
                return (
                  <button
                    key={lang.id || 'plain'}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`article-codeblock-dialog__lang${active ? ' is-active' : ''}`}
                    onClick={() => setLanguage(lang.id)}
                  >
                    {lang.label}
                    {lang.id ? <span className="article-codeblock-dialog__lang-id">{lang.id}</span> : null}
                  </button>
                );
              })}
              {filteredLangs.length === 0 ? (
                <p className="article-codeblock-dialog__empty">
                  无匹配项。可直接使用下方自定义标识。
                </p>
              ) : null}
            </div>
            <Input
              value={language}
              placeholder="自定义语言标识（如 aardio）"
              onChange={e => setLanguage(e.target.value.trim().toLowerCase())}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
            />
          </section>

          <section className="article-codeblock-dialog__toggles">
            <div className="article-codeblock-dialog__toggle">
              <div className="article-codeblock-dialog__toggle-text">
                <Label htmlFor="codeblock-lines">显示行号</Label>
                <p>阅读态在左侧标注行号</p>
              </div>
              <Switch
                id="codeblock-lines"
                checked={lineNumbers}
                onCheckedChange={setLineNumbers}
              />
            </div>
            <div className="article-codeblock-dialog__toggle">
              <div className="article-codeblock-dialog__toggle-text">
                <Label htmlFor="codeblock-fold">默认折叠</Label>
                <p>阅读时先收起；不足 5 行不显示折叠按钮</p>
              </div>
              <Switch
                id="codeblock-fold"
                checked={collapsed}
                onCheckedChange={setCollapsed}
              />
            </div>
          </section>
        </div>

        <DialogFooter className="article-codeblock-dialog__footer">
          {editing && onRemove ? (
            <Button
              type="button"
              variant="outline"
              className="article-codeblock-dialog__remove"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              移除代码块
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {editing ? '应用' : '插入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
