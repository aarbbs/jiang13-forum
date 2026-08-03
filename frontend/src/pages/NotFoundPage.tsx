import { useNavigate } from 'react-router-dom';
import { FileQuestion, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageSEO } from '../hooks/usePageSEO';
import { InFlowSiteFooter } from '../components/SiteFooter';

interface Props {
  /** 独立全屏（无 MainLayout 时） */
  standalone?: boolean;
  title?: string;
  description?: string;
}

/** 统一 404 页面 */
export default function NotFoundPage({
  standalone = false,
  title = '页面不存在',
  description = '您访问的页面不存在，或内容已被删除。',
}: Props) {
  const nav = useNavigate();
  usePageSEO({
    title,
    description,
    robots: 'noindex,follow',
  });

  const body = (
    <div className="error-page">
      <div className="error-page__code" aria-hidden>404</div>
      <FileQuestion className="error-page__icon" aria-hidden size={40} strokeWidth={1.5} />
      <h1 className="error-page__title">{title}</h1>
      <p className="error-page__desc">{description}</p>
      <div className="error-page__actions">
        <Button onClick={() => nav('/')}>
          <Home />
          返回首页
        </Button>
        <Button variant="outline" onClick={() => nav('/projects')}>
          浏览项目
        </Button>
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="error-page-shell">
        {body}
      </div>
    );
  }

  return (
    <div className="page-wrap">
      {body}
      <InFlowSiteFooter />
    </div>
  );
}
