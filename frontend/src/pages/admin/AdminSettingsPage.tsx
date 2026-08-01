import { useEffect, useState } from 'react';
import { Database, Mail, Shield, Server, SlidersHorizontal, KeyRound, FolderGit2, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import { invalidateForumLimitsCache } from '../../hooks/useForumLimits';
import { DEFAULT_BRANDING, seedSiteBrandingCache } from '../../hooks/useSiteBranding';
import { clearAllFeedCache } from '../../utils/feedCache';
import type { AdminSettings, ForumLimits, MailConfig, OIDCConfig, OAuthClient, GiteaSyncConfig, SiteBranding } from '../../api/types';

type TabId = 'branding' | 'limits' | 'mail' | 'oidc' | 'gitea' | 'filter' | 'system';

type NumberLimitKey = {
  [K in keyof ForumLimits]: ForumLimits[K] extends number ? K : never;
}[keyof ForumLimits];

type SettingRow = {
  key: NumberLimitKey;
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
    summary: '关键词长度与首页每页条数',
    rows: [
      { key: 'search_keyword_min', label: '关键词最短', unit: '字', min: 0 },
      { key: 'search_keyword_max', label: '关键词最长', unit: '字', min: 1 },
      { key: 'page_size_default', label: '每页显示条数', unit: '条', hint: '首页列表分页大小', min: 1 },
    ],
  },
  {
    id: 'user',
    title: '用户账号',
    summary: '注册、改密、头像与签名限制',
    rows: [
      { key: 'password_min_len', label: '密码最短', unit: '位', min: 4 },
      { key: 'avatar_max_mb', label: '头像上限', unit: 'MB', min: 1 },
      { key: 'signature_max', label: '签名上限', unit: '字', min: 0 },
    ],
  },
];

type BoolLimitKey = 'open_posts_in_new_tab' | 'open_content_links_in_new_tab';

const NAV_TOGGLES: { key: BoolLimitKey; label: string; hint: string }[] = [
  {
    key: 'open_posts_in_new_tab',
    label: '打开帖子时新开标签页',
    hint: '首页、热门、收藏等入口打开帖子详情',
  },
  {
    key: 'open_content_links_in_new_tab',
    label: '帖子正文链接新开标签页',
    hint: '正文内的外链与站内链接均在新标签打开',
  },
];

const TABS: { id: TabId; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'branding', label: '站点品牌', icon: Palette },
  { id: 'limits', label: '论坛限制', icon: SlidersHorizontal },
  { id: 'mail', label: '邮件服务', icon: Mail },
  { id: 'oidc', label: 'OIDC / SSO', icon: KeyRound },
  { id: 'gitea', label: 'Gitea 同步', icon: FolderGit2 },
  { id: 'filter', label: '敏感词', icon: Shield },
  { id: 'system', label: '系统维护', icon: Server },
];

const EMPTY_MAIL: MailConfig = {
  enabled: false,
  host: '',
  port: 465,
  username: '',
  from: '',
  from_name: '姜十三论坛',
  encryption: 'ssl',
  has_password: false,
};

const EMPTY_OIDC: OIDCConfig = {
  enabled: false,
  root_url: '',
  ready: false,
  group_claim: 'groups',
  admin_group: 'gitea-admin',
  user_group: 'gitea-users',
  client_count: 0,
};

/** 就绪需：已启用 + 已持久化 ROOT_URL + 至少一个启用中的应用 */
function oidcStatusLabel(oidc: OIDCConfig, appCount: number): string {
  if (oidc.ready) return '已就绪';
  if (!oidc.enabled) return '未启用';
  const reasons: string[] = [];
  // discovery_url 仅在服务端已保存 ROOT_URL 时返回；表单里填写但未点保存时仍为空
  if (!oidc.discovery_url) reasons.push('保存 ROOT_URL');
  if (appCount < 1 && (oidc.client_count ?? 0) < 1) reasons.push('至少一个应用');
  if (reasons.length === 0) reasons.push('点击「保存全局设置」刷新状态');
  return `未就绪（需${reasons.join('、')}）`;
}

const EMPTY_GITEA: GiteaSyncConfig = {
  enabled: false,
  base_url: '',
  has_token: false,
  sync_interval_min: 60,
  ready: false,
  repo_count: 0,
};

function giteaStatusLabel(gitea: GiteaSyncConfig): string {
  if (gitea.ready) return `已就绪 · ${gitea.repo_count} 个仓库`;
  if (!gitea.enabled) return '未启用';
  const reasons: string[] = [];
  if (!gitea.base_url.trim()) reasons.push('BASE_URL');
  if (!gitea.has_token) reasons.push('Token');
  if (reasons.length === 0) reasons.push('保存后生效');
  return `未就绪（需${reasons.join('、')}）`;
}

function SettingTable({
  sections,
  limits,
  onChange,
}: {
  sections: SettingSection[];
  limits: ForumLimits;
  onChange: (key: NumberLimitKey, value: string) => void;
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
  const [branding, setBranding] = useState<SiteBranding>(DEFAULT_BRANDING);
  const [mail, setMail] = useState<MailConfig>(EMPTY_MAIL);
  const [oidc, setOidc] = useState<OIDCConfig>(EMPTY_OIDC);
  const [gitea, setGitea] = useState<GiteaSyncConfig>(EMPTY_GITEA);
  const [oauthClients, setOauthClients] = useState<OAuthClient[]>([]);
  const [clientForm, setClientForm] = useState({
    client_id: 'gitea',
    name: 'Gitea',
    redirect_uris: 'https://git.iioio.com/user/oauth2/jiang13/callback',
    enabled: true,
  });
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [filterWords, setFilterWords] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('branding');
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploadingBrand, setUploadingBrand] = useState<'logo' | 'favicon' | null>(null);
  const [savingForum, setSavingForum] = useState(false);
  const [savingMail, setSavingMail] = useState(false);
  const [savingOidc, setSavingOidc] = useState(false);
  const [savingGitea, setSavingGitea] = useState(false);
  const [syncingGitea, setSyncingGitea] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [savingFilter, setSavingFilter] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api.adminSettings()
      .then(s => {
        setSettings(s);
        setLimits({
          open_posts_in_new_tab: true,
          open_content_links_in_new_tab: true,
          ...s.limits,
        });
        setBranding({ ...DEFAULT_BRANDING, ...(s.branding ?? {}) });
        setMail({ ...EMPTY_MAIL, ...s.mail, password: '' });
        setOidc({ ...EMPTY_OIDC, ...(s.oidc ?? {}) });
        setGitea({ ...EMPTY_GITEA, ...(s.gitea ?? {}), token: '' });
        setOauthClients(s.oauth_clients ?? []);
        setFilterWords(s.filter_words);
        if (s.mail?.from) setTestTo(s.mail.from);
      })
      .finally(() => setLoading(false));
  }, [ready]);

  const handleLimitChange = (key: NumberLimitKey, value: string) => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    setLimits(prev => prev ? { ...prev, [key]: n } : prev);
  };

  const handleBoolLimitChange = (key: BoolLimitKey, checked: boolean) => {
    setLimits(prev => prev ? { ...prev, [key]: checked } : prev);
  };

  const applyBranding = (next: SiteBranding) => {
    setBranding({ ...DEFAULT_BRANDING, ...next });
    setSettings(s => s ? { ...s, branding: next } : s);
    seedSiteBrandingCache(next);
  };

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    try {
      const r = await api.adminUpdateBranding(branding);
      notify.success(r.message);
      applyBranding(r.branding);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleUploadBrandAsset = async (kind: 'logo' | 'favicon', file: File | undefined) => {
    if (!file) return;
    setUploadingBrand(kind);
    try {
      const r = await api.adminUploadBrandingAsset(kind, file);
      notify.success(r.message);
      applyBranding(r.branding);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploadingBrand(null);
    }
  };

  const handleClearBrandAsset = async (kind: 'logo' | 'favicon') => {
    setUploadingBrand(kind);
    try {
      const r = await api.adminClearBrandingAsset(kind);
      notify.success(r.message);
      applyBranding(r.branding);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '清除失败');
    } finally {
      setUploadingBrand(null);
    }
  };

  const handleSaveForumSettings = async () => {
    if (!limits) return;
    setSavingForum(true);
    try {
      const r = await api.adminUpdateForumSettings(limits);
      notify.success(r.message);
      invalidateForumLimitsCache();
      clearAllFeedCache();
      setLimits(r.limits);
      setSettings(s => s ? { ...s, limits: r.limits } : s);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingForum(false);
    }
  };

  const handleSaveMailSettings = async () => {
    setSavingMail(true);
    try {
      const payload: MailConfig = {
        ...mail,
        password: mail.password?.trim() ? mail.password : undefined,
      };
      const r = await api.adminUpdateMailSettings(payload);
      notify.success(r.message);
      setMail({ ...r.mail, password: '' });
      setSettings(s => s ? { ...s, mail: r.mail } : s);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingMail(false);
    }
  };

  const handleSaveOidcSettings = async () => {
    setSavingOidc(true);
    try {
      const r = await api.adminUpdateOIDCSettings(oidc);
      notify.success(r.message);
      setOidc({ ...EMPTY_OIDC, ...r.oidc });
      setSettings(s => s ? { ...s, oidc: r.oidc } : s);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingOidc(false);
    }
  };

  const handleSaveGiteaSettings = async () => {
    setSavingGitea(true);
    try {
      const payload: GiteaSyncConfig = {
        ...gitea,
        token: gitea.token?.trim() ? gitea.token : undefined,
      };
      const r = await api.adminUpdateGiteaSettings(payload);
      notify.success(r.message);
      setGitea({ ...EMPTY_GITEA, ...r.gitea, token: '' });
      setSettings(s => s ? { ...s, gitea: r.gitea } : s);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingGitea(false);
    }
  };

  const handleSyncGitea = async () => {
    setSyncingGitea(true);
    try {
      const r = await api.adminSyncGitea();
      notify.success(r.message);
      setGitea({ ...EMPTY_GITEA, ...r.gitea, token: '' });
      setSettings(s => s ? { ...s, gitea: r.gitea } : s);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncingGitea(false);
    }
  };

  const refreshClients = (clients: OAuthClient[], nextOidc?: OIDCConfig) => {
    setOauthClients(clients);
    if (nextOidc) {
      setOidc({ ...EMPTY_OIDC, ...nextOidc });
      setSettings(s => s ? { ...s, oidc: nextOidc, oauth_clients: clients } : s);
    } else {
      setSettings(s => s ? { ...s, oauth_clients: clients } : s);
    }
  };

  const resetClientForm = () => {
    setEditingClientId(null);
    setClientForm({
      client_id: 'gitea',
      name: 'Gitea',
      redirect_uris: 'https://git.iioio.com/user/oauth2/jiang13/callback',
      enabled: true,
    });
  };

  const handleSaveOAuthClient = async () => {
    setSavingClient(true);
    try {
      if (editingClientId) {
        const r = await api.adminUpdateOAuthClient(editingClientId, {
          name: clientForm.name,
          redirect_uris: clientForm.redirect_uris,
          enabled: clientForm.enabled,
        });
        notify.success(r.message);
        if (r.client.client_secret) setRevealedSecret(r.client.client_secret);
        const list = await api.adminListOAuthClients();
        refreshClients(list.clients, r.oidc);
        resetClientForm();
      } else {
        const r = await api.adminCreateOAuthClient({
          client_id: clientForm.client_id,
          name: clientForm.name,
          redirect_uris: clientForm.redirect_uris,
          enabled: clientForm.enabled,
        });
        notify.success(r.message);
        if (r.client.client_secret) setRevealedSecret(r.client.client_secret);
        const list = await api.adminListOAuthClients();
        refreshClients(list.clients, r.oidc);
        resetClientForm();
      }
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingClient(false);
    }
  };

  const handleRotateSecret = async (id: number) => {
    if (!window.confirm('确定轮换密钥？旧密钥将立即失效。')) return;
    setSavingClient(true);
    try {
      const row = oauthClients.find(c => c.id === id);
      if (!row) return;
      const r = await api.adminUpdateOAuthClient(id, {
        name: row.name,
        redirect_uris: row.redirect_uris,
        enabled: row.enabled,
        rotate_secret: true,
      });
      notify.success(r.message);
      if (r.client.client_secret) setRevealedSecret(r.client.client_secret);
      const list = await api.adminListOAuthClients();
      refreshClients(list.clients, r.oidc);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '轮换失败');
    } finally {
      setSavingClient(false);
    }
  };

  const handleDeleteOAuthClient = async (id: number) => {
    if (!window.confirm('确定删除该 OAuth 应用？')) return;
    try {
      const r = await api.adminDeleteOAuthClient(id);
      notify.success(r.message);
      const list = await api.adminListOAuthClients();
      refreshClients(list.clients, r.oidc);
      if (editingClientId === id) resetClientForm();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleTestMail = async () => {
    if (!testTo.trim()) {
      notify.error('请填写测试收件邮箱');
      return;
    }
    setTestingMail(true);
    try {
      const r = await api.adminTestMail(testTo.trim());
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setTestingMail(false);
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
        <p>管理论坛运行规则、邮件、OIDC/SSO、敏感词与数据维护</p>
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

      {activeTab === 'branding' && (
        <div className="admin-settings-panel admin-mail-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">
              <span>站点品牌</span>
              <span className="admin-settings-card-badge">{branding.name}</span>
            </div>
            <div className="admin-card-body admin-mail-body">
              <div className="admin-brand-preview">
                {branding.logo ? (
                  <img src={branding.logo} alt="" className="admin-brand-preview-logo" />
                ) : (
                  <span className="admin-brand-preview-mark">{branding.logo_mark}</span>
                )}
                <div>
                  <strong>{branding.name}</strong>
                  {branding.name_en && <div className="admin-mail-field-hint">{branding.name_en}</div>}
                  {branding.slogan && <p className="admin-mail-field-hint" style={{ marginTop: 4 }}>{branding.slogan}</p>}
                </div>
              </div>

              <div className="admin-mail-grid">
                <div className="admin-mail-field">
                  <label htmlFor="brand-name">论坛名称</label>
                  <Input
                    id="brand-name"
                    value={branding.name}
                    onChange={e => setBranding(b => ({ ...b, name: e.target.value }))}
                    placeholder="姜十三论坛"
                    maxLength={64}
                  />
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="brand-name-en">英文名称</label>
                  <Input
                    id="brand-name-en"
                    value={branding.name_en}
                    onChange={e => setBranding(b => ({ ...b, name_en: e.target.value }))}
                    placeholder="Jiang13 Forum"
                    maxLength={64}
                  />
                </div>
                <div className="admin-mail-field admin-mail-field--span2">
                  <label htmlFor="brand-slogan">标语 / Slogan</label>
                  <Input
                    id="brand-slogan"
                    value={branding.slogan}
                    onChange={e => setBranding(b => ({ ...b, slogan: e.target.value }))}
                    placeholder="拾三一隅，自在交流"
                    maxLength={200}
                  />
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="brand-mark">字标（无 Logo 时显示）</label>
                  <Input
                    id="brand-mark"
                    value={branding.logo_mark}
                    onChange={e => setBranding(b => ({ ...b, logo_mark: e.target.value.slice(0, 2) }))}
                    placeholder="姜"
                    maxLength={2}
                  />
                  <span className="admin-mail-field-hint">建议 1 个汉字或字母</span>
                </div>
              </div>

              <div className="admin-mail-grid" style={{ marginTop: 8 }}>
                <div className="admin-mail-field">
                  <label htmlFor="brand-logo-file">站点 Logo</label>
                  <div className="admin-brand-upload-row">
                    <Input
                      id="brand-logo-file"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        void handleUploadBrandAsset('logo', f);
                        e.target.value = '';
                      }}
                    />
                    {branding.logo && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={uploadingBrand === 'logo'}
                        onClick={() => void handleClearBrandAsset('logo')}
                      >
                        清除
                      </Button>
                    )}
                  </div>
                  <span className="admin-mail-field-hint">
                    {uploadingBrand === 'logo' ? '上传中…' : 'jpg/png/gif/webp，最大 2MB'}
                  </span>
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="brand-favicon-file">Favicon</label>
                  <div className="admin-brand-upload-row">
                    <Input
                      id="brand-favicon-file"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        void handleUploadBrandAsset('favicon', f);
                        e.target.value = '';
                      }}
                    />
                    {branding.favicon && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={uploadingBrand === 'favicon'}
                        onClick={() => void handleClearBrandAsset('favicon')}
                      >
                        清除
                      </Button>
                    )}
                  </div>
                  <span className="admin-mail-field-hint">
                    {branding.favicon ? `当前：${branding.favicon}` : '浏览器标签图标'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="admin-settings-bar">
            <p>保存后立即影响顶栏、登录页、浏览器标题与右栏介绍</p>
            <Button onClick={handleSaveBranding} loading={savingBranding}>
              保存品牌设置
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'limits' && (
        <div className="admin-settings-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">
              <span>论坛限制</span>
              <span className="admin-settings-card-badge">共 {SETTING_SECTIONS.length + 1} 组</span>
            </div>
            <div className="admin-card-body">
              <SettingTable sections={SETTING_SECTIONS} limits={limits} onChange={handleLimitChange} />
              <section className="admin-settings-section" id="settings-nav">
                <div className="admin-settings-section-head">
                  <h3>浏览与链接</h3>
                  <p>控制打开帖子与正文链接时是否新开浏览器标签页</p>
                </div>
                <div className="admin-settings-table" role="group" aria-label="浏览与链接">
                  {NAV_TOGGLES.map(row => (
                    <div key={row.key} className="admin-settings-row">
                      <span className="admin-settings-row-label" id={`limit-label-${row.key}`}>
                        {row.label}
                      </span>
                      <div className="admin-settings-row-input">
                        <button
                          type="button"
                          id={`limit-${row.key}`}
                          role="switch"
                          aria-checked={!!limits[row.key]}
                          aria-labelledby={`limit-label-${row.key}`}
                          className={`admin-settings-switch${limits[row.key] ? ' is-on' : ''}`}
                          onClick={() => handleBoolLimitChange(row.key, !limits[row.key])}
                        >
                          <span className="admin-settings-switch-ui" aria-hidden />
                        </button>
                      </div>
                      <span className="admin-settings-row-hint">{row.hint}</span>
                    </div>
                  ))}
                </div>
              </section>
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

      {activeTab === 'mail' && (
        <div className="admin-settings-panel admin-mail-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">
              <span>SMTP 邮件配置</span>
              <span className={`admin-mail-status${mail.enabled ? ' is-on' : ''}`}>
                <span className="admin-mail-status-dot" aria-hidden />
                {mail.enabled ? '已启用' : '未启用'}
              </span>
            </div>
            <div className="admin-card-body admin-mail-body">
              <label className="admin-mail-switch" htmlFor="mail-enabled">
                <input
                  id="mail-enabled"
                  type="checkbox"
                  checked={mail.enabled}
                  onChange={e => setMail(m => ({ ...m, enabled: e.target.checked }))}
                />
                <span className="admin-mail-switch-ui" aria-hidden />
                <span className="admin-mail-switch-copy">
                  <strong>启用邮件服务</strong>
                  <small>开启并填写完整后，新用户注册需邮箱验证码；首个管理员可在未配置时直接注册</small>
                </span>
              </label>

              <div className="admin-mail-grid">
                <div className="admin-mail-field admin-mail-field--span2">
                  <label htmlFor="mail-host">SMTP 主机</label>
                  <Input
                    id="mail-host"
                    value={mail.host}
                    onChange={e => setMail(m => ({ ...m, host: e.target.value }))}
                    placeholder="smtp.example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="mail-port">端口</label>
                  <Input
                    id="mail-port"
                    type="number"
                    min={1}
                    value={mail.port}
                    onChange={e => setMail(m => ({ ...m, port: parseInt(e.target.value, 10) || 0 }))}
                  />
                  <span className="admin-mail-field-hint">常用 465 / 587</span>
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="mail-encryption">加密方式</label>
                  <select
                    id="mail-encryption"
                    className="admin-mail-select"
                    value={mail.encryption}
                    onChange={e => setMail(m => ({
                      ...m,
                      encryption: e.target.value as MailConfig['encryption'],
                    }))}
                  >
                    <option value="ssl">SSL / TLS（465）</option>
                    <option value="starttls">STARTTLS（587）</option>
                    <option value="none">无加密</option>
                  </select>
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="mail-username">用户名</label>
                  <Input
                    id="mail-username"
                    value={mail.username}
                    onChange={e => setMail(m => ({ ...m, username: e.target.value }))}
                    placeholder="SMTP 登录账号"
                    autoComplete="off"
                  />
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="mail-password">密码</label>
                  <Input
                    id="mail-password"
                    type="password"
                    value={mail.password || ''}
                    onChange={e => setMail(m => ({ ...m, password: e.target.value }))}
                    placeholder={mail.has_password ? '已设置，留空不改' : '密码或授权码'}
                    autoComplete="new-password"
                  />
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="mail-from">发件地址</label>
                  <Input
                    id="mail-from"
                    type="email"
                    value={mail.from}
                    onChange={e => setMail(m => ({ ...m, from: e.target.value }))}
                    placeholder="noreply@example.com"
                  />
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="mail-from-name">发件人名称</label>
                  <Input
                    id="mail-from-name"
                    value={mail.from_name}
                    onChange={e => setMail(m => ({ ...m, from_name: e.target.value }))}
                    placeholder="姜十三论坛"
                  />
                </div>
              </div>

              <div className="admin-mail-test">
                <div className="admin-mail-test-head">
                  <strong>发送测试</strong>
                  <span>请先保存配置，再向指定邮箱发一封测试信</span>
                </div>
                <div className="admin-mail-test-row">
                  <Input
                    id="mail-test-to"
                    type="email"
                    value={testTo}
                    onChange={e => setTestTo(e.target.value)}
                    placeholder="your@email.com"
                    aria-label="测试收件邮箱"
                  />
                  <Button variant="outline" onClick={handleTestMail} loading={testingMail}>
                    发送测试
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-settings-bar">
            <p>保存后立即生效，注册页将按配置要求邮箱验证码</p>
            <Button onClick={handleSaveMailSettings} loading={savingMail}>
              保存邮件设置
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'oidc' && (
        <div className="admin-settings-panel admin-mail-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">
              <span>OIDC Provider（全局）</span>
              <span className={`admin-mail-status${oidc.ready ? ' is-on' : ''}`}>
                <span className="admin-mail-status-dot" aria-hidden />
                {oidcStatusLabel(oidc, oauthClients.length)}
              </span>
            </div>
            <div className="admin-card-body admin-mail-body">
              <label className="admin-mail-switch" htmlFor="oidc-enabled">
                <input
                  id="oidc-enabled"
                  type="checkbox"
                  checked={oidc.enabled}
                  onChange={e => setOidc(o => ({ ...o, enabled: e.target.checked }))}
                />
                <span className="admin-mail-switch-ui" aria-hidden />
                <span className="admin-mail-switch-copy">
                  <strong>启用 OIDC</strong>
                  <small>开启后，Gitea 等可将本论坛作为身份源；已登录用户跳转静默授权</small>
                </span>
              </label>

              <div className="admin-mail-grid">
                <div className="admin-mail-field admin-mail-field--span2">
                  <label htmlFor="oidc-root-url">对外公网地址（ROOT_URL）</label>
                  <Input
                    id="oidc-root-url"
                    value={oidc.root_url}
                    onChange={e => setOidc(o => ({ ...o, root_url: e.target.value }))}
                    placeholder="https://bbs.iioio.com"
                    autoComplete="off"
                  />
                  <span className="admin-mail-field-hint">无尾斜杠；作为 OIDC Issuer</span>
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="oidc-group-claim">用户组 Claim 名</label>
                  <Input
                    id="oidc-group-claim"
                    value={oidc.group_claim}
                    onChange={e => setOidc(o => ({ ...o, group_claim: e.target.value }))}
                    placeholder="groups"
                  />
                  <span className="admin-mail-field-hint">Gitea「用户组 Claim 名称」填此项</span>
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="oidc-user-group">普通用户组值</label>
                  <Input
                    id="oidc-user-group"
                    value={oidc.user_group}
                    onChange={e => setOidc(o => ({ ...o, user_group: e.target.value }))}
                    placeholder="gitea-users"
                  />
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="oidc-admin-group">管理员组值</label>
                  <Input
                    id="oidc-admin-group"
                    value={oidc.admin_group}
                    onChange={e => setOidc(o => ({ ...o, admin_group: e.target.value }))}
                    placeholder="gitea-admin"
                  />
                  <span className="admin-mail-field-hint">Gitea「管理员用户组」填此项</span>
                </div>
              </div>

              {oidc.discovery_url && (
                <div className="admin-mail-test">
                  <div className="admin-mail-test-head">
                    <strong>给 Gitea 填写</strong>
                    <span>Provider 选 OpenID Connect；可选填 groups 映射管理员</span>
                  </div>
                  <code className="admin-oidc-url">{oidc.discovery_url}</code>
                  {oidc.logout_url && <code className="admin-oidc-url">登出：{oidc.logout_url}</code>}
                </div>
              )}
            </div>
          </div>

          <div className="admin-settings-bar">
            <p>全局配置保存后立即生效；应用凭证在下方管理（密钥 bcrypt 存储）</p>
            <Button onClick={handleSaveOidcSettings} loading={savingOidc}>
              保存全局设置
            </Button>
          </div>

          <div className="admin-card admin-settings-card" style={{ marginTop: 16 }}>
            <div className="admin-card-head">
              <span>OAuth 应用</span>
              <span className="admin-settings-card-badge">{oauthClients.length} 个</span>
            </div>
            <div className="admin-card-body admin-mail-body">
              {revealedSecret && (
                <div className="admin-mail-test">
                  <div className="admin-mail-test-head">
                    <strong>客户端密钥（仅显示一次）</strong>
                    <span>请立即复制到 Gitea，离开后无法再查看明文</span>
                  </div>
                  <code className="admin-oidc-url">{revealedSecret}</code>
                  <Button variant="outline" className="mt-2" onClick={() => setRevealedSecret(null)}>已保存，关闭提示</Button>
                </div>
              )}

              {oauthClients.length > 0 && (
                <div className="admin-oauth-list">
                  {oauthClients.map(c => (
                    <div key={c.id} className="admin-oauth-row">
                      <div>
                        <strong>{c.name}</strong>
                        <div className="admin-mail-field-hint">
                          {c.client_id} · {c.enabled ? '启用' : '停用'} · {c.redirect_uris}
                        </div>
                      </div>
                      <div className="admin-oauth-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingClientId(c.id);
                            setClientForm({
                              client_id: c.client_id,
                              name: c.name,
                              redirect_uris: c.redirect_uris,
                              enabled: c.enabled,
                            });
                          }}
                        >
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleRotateSecret(c.id)} loading={savingClient}>
                          轮换密钥
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDeleteOAuthClient(c.id)}>
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="admin-mail-grid" style={{ marginTop: 12 }}>
                {!editingClientId && (
                  <div className="admin-mail-field">
                    <label htmlFor="oauth-client-id">客户端 ID</label>
                    <Input
                      id="oauth-client-id"
                      value={clientForm.client_id}
                      onChange={e => setClientForm(f => ({ ...f, client_id: e.target.value }))}
                      placeholder="gitea"
                    />
                  </div>
                )}
                <div className="admin-mail-field">
                  <label htmlFor="oauth-client-name">显示名称</label>
                  <Input
                    id="oauth-client-name"
                    value={clientForm.name}
                    onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Gitea"
                  />
                </div>
                <div className="admin-mail-field admin-mail-field--span2">
                  <label htmlFor="oauth-redirect">回调地址</label>
                  <Textarea
                    id="oauth-redirect"
                    value={clientForm.redirect_uris}
                    onChange={e => setClientForm(f => ({ ...f, redirect_uris: e.target.value }))}
                    rows={2}
                    placeholder="https://git.iioio.com/user/oauth2/jiang13/callback"
                  />
                </div>
                <label className="admin-mail-switch" htmlFor="oauth-enabled">
                  <input
                    id="oauth-enabled"
                    type="checkbox"
                    checked={clientForm.enabled}
                    onChange={e => setClientForm(f => ({ ...f, enabled: e.target.checked }))}
                  />
                  <span className="admin-mail-switch-ui" aria-hidden />
                  <span className="admin-mail-switch-copy">
                    <strong>启用此应用</strong>
                  </span>
                </label>
              </div>

              <div className="admin-settings-bar" style={{ marginTop: 8 }}>
                <p>{editingClientId ? `正在编辑 #${editingClientId}` : '新建时自动生成密钥（仅显示一次）'}</p>
                <div className="admin-settings-bar-actions">
                  {editingClientId && (
                    <Button variant="outline" onClick={resetClientForm}>取消编辑</Button>
                  )}
                  <Button onClick={handleSaveOAuthClient} loading={savingClient}>
                    {editingClientId ? '保存应用' : '创建应用'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'gitea' && (
        <div className="admin-settings-panel admin-mail-panel">
          <div className="admin-card admin-settings-card">
            <div className="admin-card-head">
              <span>Gitea 仓库同步</span>
              <span className={`admin-mail-status${gitea.ready ? ' is-on' : ''}`}>
                <span className="admin-mail-status-dot" aria-hidden />
                {giteaStatusLabel(gitea)}
              </span>
            </div>
            <div className="admin-card-body admin-mail-body">
              <label className="admin-mail-switch" htmlFor="gitea-enabled">
                <input
                  id="gitea-enabled"
                  type="checkbox"
                  checked={gitea.enabled}
                  onChange={e => setGitea(g => ({ ...g, enabled: e.target.checked }))}
                />
                <span className="admin-mail-switch-ui" aria-hidden />
                <span className="admin-mail-switch-copy">
                  <strong>启用同步</strong>
                  <small>按论坛用户名匹配 Gitea login，拉取公开仓库供「开源码桶」页展示</small>
                </span>
              </label>

              <div className="admin-mail-grid">
                <div className="admin-mail-field admin-mail-field--span2">
                  <label htmlFor="gitea-base-url">Gitea 地址（BASE_URL）</label>
                  <Input
                    id="gitea-base-url"
                    value={gitea.base_url}
                    onChange={e => setGitea(g => ({ ...g, base_url: e.target.value }))}
                    placeholder="https://git.iioio.com"
                    autoComplete="off"
                  />
                  <span className="admin-mail-field-hint">无尾斜杠</span>
                </div>
                <div className="admin-mail-field admin-mail-field--span2">
                  <label htmlFor="gitea-token">Access Token</label>
                  <Input
                    id="gitea-token"
                    type="password"
                    value={gitea.token ?? ''}
                    onChange={e => setGitea(g => ({ ...g, token: e.target.value }))}
                    placeholder={gitea.has_token ? '已配置，留空则保持不变' : '只读 Token'}
                    autoComplete="new-password"
                  />
                  <span className="admin-mail-field-hint">需能列出用户公开仓库</span>
                </div>
                <div className="admin-mail-field">
                  <label htmlFor="gitea-interval">同步间隔</label>
                  <Input
                    id="gitea-interval"
                    type="number"
                    min={5}
                    max={1440}
                    value={gitea.sync_interval_min}
                    onChange={e => setGitea(g => ({
                      ...g,
                      sync_interval_min: Number.parseInt(e.target.value, 10) || 60,
                    }))}
                  />
                  <span className="admin-mail-field-hint">分钟，最小 5</span>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-settings-bar">
            <p>保存后按间隔自动同步；也可立即手动拉取</p>
            <div className="admin-settings-bar-actions">
              <Button variant="outline" onClick={handleSyncGitea} loading={syncingGitea} disabled={!gitea.ready}>
                立即同步
              </Button>
              <Button onClick={handleSaveGiteaSettings} loading={savingGitea}>
                保存同步设置
              </Button>
            </div>
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
