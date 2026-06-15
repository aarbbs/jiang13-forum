/** 路由懒加载时的轻量占位，避免引入 Arco Spin 增大首屏 */
export default function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="page-loader__dot" />
      加载中…
    </div>
  );
}
