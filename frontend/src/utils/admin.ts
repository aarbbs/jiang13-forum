/** 服务端管理后台地址（非 SPA 路由） */
export const ADMIN_DASHBOARD_URL = '/admin/dashboard';

/** 跳转到系统管理后台 */
export function openAdminDashboard() {
  window.location.href = ADMIN_DASHBOARD_URL;
}
