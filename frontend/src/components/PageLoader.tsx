import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type PageLoaderProps = {
  /** 独立全屏路由（登录/注册）占满视口居中 */
  fullScreen?: boolean;
};

/** 通用路由懒加载占位（后台 / 全屏独立页）；前台 MainLayout 用顶栏进度条 + 空白 */
export default function PageLoader({ fullScreen = false }: PageLoaderProps) {
  return (
    <div
      className={cn('page-loader', fullScreen && 'page-loader--viewport')}
      aria-busy="true"
      aria-label="加载中"
    >
      <Spinner size="lg" />
    </div>
  );
}
