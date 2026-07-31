import type { SiteBranding } from '../api/types';
import { cn } from '@/lib/utils';

interface Props {
  branding: SiteBranding;
  /** CSS 类：header-logo-mark / logo-mark / admin-topbar-mark */
  className?: string;
  /** 有 Logo 图时用的额外类名 */
  imgClassName?: string;
}

/** 站点字标或 Logo 图 */
export default function SiteBrandMark({ branding, className, imgClassName }: Props) {
  if (branding.logo) {
    return (
      <img
        src={branding.logo}
        alt={branding.name}
        className={cn(className, 'site-brand-logo-img', imgClassName)}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <span className={className}>{branding.logo_mark || branding.name.charAt(0) || '?'}</span>;
}
