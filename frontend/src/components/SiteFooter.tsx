import { useSiteBranding } from '../hooks/useSiteBranding';
import { useMediaQuery } from '../hooks/useTheme';
import { Link } from 'react-router-dom';
import { useSitePages } from '../hooks/useSitePages';
import { pagePath } from '../utils/permalink';
import { useForumLimits } from '../hooks/useForumLimits';

function FooterSep() {
  return <span className="site-footer__sep" aria-hidden>·</span>;
}

/** 站点页脚：版权、友链/展柜入口、单页、备案号（结构与 Go writeSSRFooter 对齐） */
export default function SiteFooter() {
  const { branding } = useSiteBranding();
  const { footerPages } = useSitePages();
  const { limits } = useForumLimits();
  const year = new Date().getFullYear();
  const icp = branding.icp_beian?.trim() || '';
  const icpURL = branding.icp_beian_url?.trim() || 'https://beian.miit.gov.cn/';
  const showFriendLinks = limits.footer_show_friend_links !== false;
  const showShowcase = !!limits.footer_show_showcase;

  const navItems: React.ReactNode[] = [];
  if (showFriendLinks) {
    navItems.push(
      <span key="links" className="site-footer__friend">
        <Link to="/links">友情链接</Link>
      </span>,
    );
  }
  if (showShowcase) {
    navItems.push(
      <span key="showcase" className="site-footer__friend">
        <Link to="/showcase">开源展柜</Link>
      </span>,
    );
  }
  for (const p of footerPages) {
    navItems.push(
      <span key={p.slug} className="site-footer__friend">
        <Link to={pagePath(p.slug, limits)}>{p.title}</Link>
      </span>,
    );
  }
  if (icp) {
    navItems.push(
      <a
        key="icp"
        href={icpURL}
        target="_blank"
        rel="noopener noreferrer"
        className="site-footer__icp"
      >
        {icp}
      </a>,
    );
  }

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__meta">
          <span className="site-footer__copy">
            © {year} {branding.name}
          </span>
          {branding.slogan?.trim() && (
            <>
              <FooterSep />
              <span className="site-footer__slogan">{branding.slogan.trim()}</span>
            </>
          )}
        </div>

        <nav className="site-footer__nav" aria-label="站点链接">
          {navItems.flatMap((node, i) =>
            i === 0 ? [node] : [<FooterSep key={`sep-${i}`} />, node],
          )}
        </nav>
      </div>
    </footer>
  );
}

/**
 * 手机端随内容滚动的页脚（放在 .page-wrap / .post-list-scroll 末尾）。
 * 桌面端返回 null，由 MainLayout 壳层贴底页脚负责。
 */
export function InFlowSiteFooter() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  if (!isMobile) return null;
  return <SiteFooter />;
}
