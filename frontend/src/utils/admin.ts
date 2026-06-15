/** 管理后台入口（React SPA 内路由） */
export const ADMIN_DASHBOARD_URL = '/admin/dashboard';

export function openAdminDashboard() {
  window.location.href = ADMIN_DASHBOARD_URL;
}
