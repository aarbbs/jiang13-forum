import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { AdminSettings } from '../../api/types';

export default function AdminSettingsPage() {
  const { ready } = useAdminGuard();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api.adminSettings()
      .then(setSettings)
      .finally(() => setLoading(false));
  }, [ready]);

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
  if (!settings) return null;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>系统设置</h1>
        <p>数据目录、敏感词配置与数据库备份</p>
      </div>

      <div className="admin-card">
        <div className="admin-card-head">运行信息</div>
        <dl className="admin-dl">
          <dt>数据目录</dt><dd><code>{settings.data_dir}</code></dd>
          <dt>数据库路径</dt><dd><code>{settings.db_path}</code></dd>
          <dt>敏感词配置</dt><dd><code>{settings.filter_path}</code></dd>
          <dt>监听端口</dt><dd>{settings.port}</dd>
        </dl>
      </div>

      <div className="admin-card">
        <div className="admin-card-head">数据备份</div>
        <p className="admin-card-desc">
          导出当前 SQLite 数据库副本，文件名格式为 <code>jiang13_backup_YYYYMMDD_HHMMSS.db</code>
        </p>
        <Button onClick={handleBackup} loading={backing}>
          <Database size={16} />
          立即备份并下载
        </Button>
      </div>
    </div>
  );
}
