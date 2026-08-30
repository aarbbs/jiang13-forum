import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import type { CommunityConfig } from '../../api/types';

const EMPTY_COMMUNITY: CommunityConfig = {
  report_enabled: false,
  hub_enabled: false,
  hub_url: 'https://bbs.iioio.com',
  site_url: '',
  instance_id: '',
};

/** 仪表盘页脚：自愿社区上报开关（默认关，即时保存） */
export default function CommunitySupportStrip() {
  const [community, setCommunity] = useState<CommunityConfig>(EMPTY_COMMUNITY);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.adminSettings()
      .then((s) => {
        if (!cancelled) {
          setCommunity({ ...EMPTY_COMMUNITY, ...(s.community ?? {}) });
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async () => {
    if (saving || !ready) return;
    const next = !community.report_enabled;
    const prev = community;
    setCommunity((c) => ({ ...c, report_enabled: next }));
    setSaving(true);
    try {
      const r = await api.adminUpdateCommunitySettings({
        ...EMPTY_COMMUNITY,
        report_enabled: next,
      });
      setCommunity({ ...EMPTY_COMMUNITY, ...r.community });
      if (r.heartbeat_error) {
        notify.warning(`${r.message}：${r.heartbeat_error}`);
      } else {
        notify.success(next ? '已开启社区上报' : '已关闭社区上报');
      }
    } catch (e: unknown) {
      setCommunity(prev);
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-community-support-strip" role="group" aria-label="支持姜十三开源">
      <div className="admin-community-support-strip-main">
        <Heart size={16} className="admin-community-support-strip-icon" aria-hidden />
        <div className="admin-community-support-strip-copy">
          <strong>支持姜十三开源</strong>
          <span>
            匿名向 bbs.iioio.com 上报站点地址、版本与规模；开启后有机会获官方演示站展示与推荐，可随时关闭
          </span>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={community.report_enabled}
        aria-busy={saving}
        disabled={saving || !ready}
        className={`admin-settings-switch${community.report_enabled ? ' is-on' : ''}`}
        onClick={() => void handleToggle()}
      >
        <span className="admin-settings-switch-ui" aria-hidden />
      </button>
    </div>
  );
}
