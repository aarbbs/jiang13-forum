import { useEffect, useState } from 'react';
import { Database, Shield, Server, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import { invalidateForumLimitsCache } from '../../hooks/useForumLimits';
import type { AdminSettings, ForumLimits } from '../../api/types';

type TabId = 'limits' | 'filter' | 'system';

type SettingRow = {
  key: keyof ForumLimits;
  label: string;
  unit?: string;
  hint?: string;
  min?: number;
};

type SettingSection = {
  id: string;
  title: string;
  summary: string;
  rows: SettingRow[];
};

const SETTING_SECTIONS: SettingSection[] = [
  {
    id: 'rule',
    title: '编辑规则',
    summary: '控制普通用户修改自己帖子的时限',
    rows: [
      { key: 'post_edit_window_hours', label: '可编辑时限', unit: '小时', hint: '0 = 不限', min: 0 },
    ],
  },
  {
    id: 'rate',
    title: '操作限流',
    summary: '同一用户或 IP 在窗口期内的最大请求次数',
    rows: [
      { key: 'rate_limit_window_sec', label: '限流窗口', unit: '秒', min: 10 },
      { key: 'rate_limit_post', label: '发帖', unit: '次', min: 1 },
      { key: 'rate_limit_comment', label: '评论', unit: '次', min: 1 },
      { key: 'rate_limit_register', label: '注册', unit: '次', min: 1 },
      { key: 'rate_limit_login', label: '登录', unit: '次', min: 1 },
    ],
  },
  {
    id: 'content',
    title: '内容长度',
    summary: '发帖与评论的字数上限，服务端强制校验',
    rows: [
      { key: 'post_title_max', label: '帖子标题', unit: '字', min: 1 },
      { key: 'post_tags_max', label: '帖子标签', unit: '字', hint: '0 = 不限', min: 0 },
      { key: 'post_content_max', label: '帖子正文', unit: '字', hint: '0 = 不限', min: 0 },
      { key: 'comment_max', label: '评论内容', unit: '字', min: 1 },
    ],
  },
  {
    id: 'search',
    title: '搜索与列表',
    summary: '关键词长度与帖子列表分页',
    rows: [
      { key: 'search_keyword_min', label: '关键词最短', unit: '字', min: 0 },
      { key: 'search_keyword_max', label: '关键词最长', unit: '字', min: 1 },
      { key: 'page_size_default', label: '默认每页', unit: '条', min: 1 },
      { key: 'page_size_max', label: '最大每页', unit: '条', min: 1 },
    ],
  },
  {
    id: 'user',
    title: '用户账号',
    summary: '注册、改密与头像上传限制',
    rows: [
      { key: 'password_min_len', label: '密码最短', unit: '位', min: 4 },
      { key: 'avatar_max_mb', label: '头像上限', unit: 'MB', min: 1 },
    ],
  },
];

const TABS: { id: TabId; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'limits', label: '论坛限制', icon: SlidersHorizontal },
  { id: 'filter', label: '敏感词', icon: Shield },
  { id: 'system', label: '系统维护', icon: Server },
];

function SettingTable({
  sections,
  limits,
  onChange,
}: {
  sections: SettingSection[];
  limits: ForumLimits;
  onChange: (key: keyof ForumLimits, value: string) => void;
}) {
  return (
    <div className="admin-settings-sections">
      {sections.map(section => (
        <section key={section.id} className="admin-settings-section" id={`settings-${section.id}`}>
          <div className="admin-settings-section-head">
            <h3>{section.title}</h3>
            <p>{section.summary}</p>
          </div>
          <div className="admin-settings-table" role="group" aria-label={section.title}>
            {section.rows.map(row => (
              <div key={row.key} className="admin-settings-row">
                <label htmlFor={`limit-${row.key}`} className="admin-settings-row-label">
                  {row.label}
                </label>
                <div className="admin-settings-row-input">
                  <Input
                    id={`limit-${row.key}`}
                    type="number"
                    min={row.min ?? 0}
                    value={limits[row.key]}
                    onChange={e => onChange(row.key, e.target.value)}
                    className="admin-settings-input"
                  />
                  {row.unit && <span className="admin-settings-unit">{row.unit}</span>}
                </div>
                <span className="admin-settings-row-hint">{row.hint ?? ''}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function AdminSettingsPage() {
  const { ready } = useAdminGuard();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [limits, setLimits] = useState<ForumLimits | null>(null);
  const [filterWords, setFilterWords] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('limits');
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [savingForum, setSavingForum] = useState(false);
  const [savingFilter, setSavingFilter] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api.adminSettings()
      .then(s => {
        setSettings(s);
        setLimits(s.limits);
        setFilterWords(s.filter_words);
      })
      .finally(() => setLoading(false));
  }, [ready]);

  const handleLimitChange = (key: keyof ForumLimits, value: string) => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    setLimits(prev => prev ? { ...prev, [key]: n } : prev);
  };

  const handleSaveForumSettings = async () => {
    if (!limits) return;
    setSavingForum(true);
    try {
      const r = await api.adminUpdateForumSettings(limits);
      notify.success(r.message);
      invalidateForumLimitsCache();
      setLimits(r.limits);
      setSettings(s => s ? { ...s, limits: r.limits } : s);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingForum(false);
    }
  };

  const handleSaveFilterWords = async () => {
    setSavingFilter(true);
    try {
      const r = await api.adminUpdateFilterWords(filterWords);
      notify.success(r.message);
      setSettings(s => s ? { ...s, filter_words: filterWords, filter_word_count: r.word_count } : s);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingFilter(false);
    }
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      const r = await api.adminBackup();
      notify.success(r.message);
      window.location.href = r.download;
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '备份失败');
    } finally {
      setBacking(false);
    }
  };

  if (!ready || loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }
  if (!settings || !limits) return null;

  return (
    <div className="admin-settings-page">
      <header className="admin-page-head">
        <h1>系统设置</h1>
        <p>管理论坛运行规则、敏感词过滤与数据维护</p>
      </header>

      <nav className="admin-settings-tabs" aria-label="设置分类">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`admin-settings-tab${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
            aria-selected={activeTab === id}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'limits' && (
        <div className="admin-settings-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">
              <span>论坛限制</span>
              <span className="admin-settings-card-badge">共 {SETTING_SECTIONS.length} 组</span>
            </div>
            <div className="admin-card-body">
              <SettingTable sections={SETTING_SECTIONS} limits={limits} onChange={handleLimitChange} />
            </div>
          </div>
          <div className="admin-settings-bar">
            <p>修改后请点击保存，新规则立即对全部用户生效</p>
            <Button onClick={handleSaveForumSettings} loading={savingForum}>
              保存论坛限制
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'filter' && (
        <div className="admin-settings-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">
              <span>敏感词过滤</span>
              <span className="admin-settings-card-badge">{settings.filter_word_count} 个词条</span>
            </div>
            <div className="admin-card-body admin-settings-filter-body">
              <p className="admin-settings-filter-tip">
                每行一个词，<code>#</code> 开头为注释。保存后写入 <code>filter_words.txt</code> 并立即生效。
              </p>
              <Textarea
                rows={16}
                value={filterWords}
                onChange={e => setFilterWords(e.target.value)}
                className="admin-settings-filter-textarea"
                spellCheck={false}
                placeholder={'# 示例\n违禁词\n广告刷单'}
              />
            </div>
          </div>
          <div className="admin-settings-bar">
            <p>敏感词会在发帖、评论、昵称等文本中自动替换为 *</p>
            <Button onClick={handleSaveFilterWords} loading={savingFilter}>
              保存敏感词
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="admin-settings-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">运行信息</div>
            <div className="admin-card-body">
              <dl className="admin-settings-info">
                <div className="admin-settings-info-row">
                  <dt>数据目录</dt>
                  <dd><code>{settings.data_dir}</code></dd>
                </div>
                <div className="admin-settings-info-row">
                  <dt>数据库</dt>
                  <dd><code>{settings.db_path}</code></dd>
                </div>
                <div className="admin-settings-info-row">
                  <dt>敏感词文件</dt>
                  <dd><code>{settings.filter_path}</code></dd>
                </div>
                <div className="admin-settings-info-row">
                  <dt>监听端口</dt>
                  <dd>{settings.port}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">数据备份</div>
            <div className="admin-card-body admin-settings-backup-body">
              <p>导出当前 SQLite 数据库副本，便于迁移或灾难恢复。</p>
              <p className="admin-settings-backup-name">
                文件名：<code>jiang13_backup_YYYYMMDD_HHMMSS.db</code>
              </p>
              <Button onClick={handleBackup} loading={backing}>
                <Database size={16} />
                立即备份并下载
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
