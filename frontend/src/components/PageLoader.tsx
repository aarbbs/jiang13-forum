import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type PageLoaderProps = {
  /** 独立全屏路由（登录/注册）占满视口居中 */
  fullScreen?: boolean;
};

/** 通用路由懒加载占位；首页请用 FeedPageSkeleton，避免非 Feed 页闪出鱼骨骨架 */
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
