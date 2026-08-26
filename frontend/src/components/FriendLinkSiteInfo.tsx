import { useSiteBranding } from '../hooks/useSiteBranding';

function resolveSiteURL(siteURL?: string): string {
  const fromApi = siteURL?.trim();
  if (fromApi) return fromApi;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function resolveSiteLogoURL(logo?: string, favicon?: string, siteURL?: string): string {
  const raw = logo?.trim() || favicon?.trim() || '';
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = resolveSiteURL(siteURL);
  if (!base) return raw;
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

/** 申请弹窗内：本站友链信息（名称 / 地址 / LOGO 链接） */
export default function FriendLinkSiteInfo() {
  const { branding } = useSiteBranding();
  const siteURL = resolveSiteURL(branding.site_url);
  const siteLogoURL = resolveSiteLogoURL(branding.logo, branding.favicon, branding.site_url);

  return (
    <section className="friend-link-site-info" aria-label="本站友链信息">
      <h3 className="friend-link-site-info__title">本站信息（请添加本站链接后再申请）</h3>
      <dl className="friend-link-site-info__list">
        <div className="friend-link-site-info__item">
          <dt>名称</dt>
          <dd>{branding.name}</dd>
        </div>
        <div className="friend-link-site-info__item">
          <dt>地址</dt>
          <dd>
            {siteURL ? (
              <a href={siteURL} target="_blank" rel="noopener noreferrer">{siteURL}</a>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="friend-link-site-info__item">
          <dt>LOGO</dt>
          <dd>
            {siteLogoURL ? (
              <a href={siteLogoURL} target="_blank" rel="noopener noreferrer">{siteLogoURL}</a>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
