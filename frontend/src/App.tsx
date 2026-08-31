import { Suspense } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Navigate,
} from 'react-router-dom';
import './styles/global.css';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import MainLayout from './layouts/MainLayout';
import AdminLayout from './layouts/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';
import AppRouteError from './components/AppRouteError';
import PageLoader from './components/PageLoader';
import AuthPageFallback from './components/AuthPageFallback';
import { Toaster } from './components/ui/sonner';
import PullToRefresh from './components/PullToRefresh';
import TopProgressBar from './components/TopProgressBar';
import { lazyWithRetry } from './utils/lazyWithRetry';

const HomePage = lazyWithRetry(() => import('./pages/HomePage'));
const PostDetailPage = lazyWithRetry(() => import('./pages/PostDetailPage'));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const RegisterPage = lazyWithRetry(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/ForgotPasswordPage'));
const ComposePage = lazyWithRetry(() => import('./pages/ComposePage'));
const BoardsManagePage = lazyWithRetry(() => import('./pages/BoardsManagePage'));
const ProfilePage = lazyWithRetry(() => import('./pages/ProfilePage'));
const UserProfilePage = lazyWithRetry(() => import('./pages/UserProfilePage'));
const FavoritesPage = lazyWithRetry(() => import('./pages/FavoritesPage'));
const MessagesPage = lazyWithRetry(() => import('./pages/MessagesPage'));
const ProjectsPage = lazyWithRetry(() => import('./pages/ProjectsPage'));
const LinksPage = lazyWithRetry(() => import('./pages/LinksPage'));
const ShowcasePage = lazyWithRetry(() => import('./pages/ShowcasePage'));
const AdminDashboardPage = lazyWithRetry(() => import('./pages/admin/AdminDashboardPage'));
const AdminPostsPage = lazyWithRetry(() => import('./pages/admin/AdminPostsPage'));
const AdminCommentsPage = lazyWithRetry(() => import('./pages/admin/AdminCommentsPage'));
const AdminReportsPage = lazyWithRetry(() => import('./pages/admin/AdminReportsPage'));
const AdminUsersPage = lazyWithRetry(() => import('./pages/admin/AdminUsersPage'));
const AdminBadgesPage = lazyWithRetry(() => import('./pages/admin/AdminBadgesPage'));
const AdminMediaPage = lazyWithRetry(() => import('./pages/admin/AdminMediaPage'));
const AdminMonitorPage = lazyWithRetry(() => import('./pages/admin/AdminMonitorPage'));
const AdminPagesPage = lazyWithRetry(() => import('./pages/admin/AdminPagesPage'));
const AdminSitePageEditPage = lazyWithRetry(() => import('./pages/admin/AdminSitePageEditPage'));
const AdminLinksPage = lazyWithRetry(() => import('./pages/admin/AdminLinksPage'));
const SitePageView = lazyWithRetry(() => import('./pages/SitePageView'));
const AdminSettingsPage = lazyWithRetry(() => import('./pages/admin/AdminSettingsPage'));
const AdminCommunityPage = lazyWithRetry(() => import('./pages/admin/AdminCommunityPage'));
const NotFoundPage = lazyWithRetry(() => import('./pages/NotFoundPage'));

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route errorElement={<AppRouteError />}>
      <Route path="/login" element={<Suspense fallback={<AuthPageFallback />}><LoginPage /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={<AuthPageFallback />}><RegisterPage /></Suspense>} />
      <Route path="/forgot-password" element={<Suspense fallback={<AuthPageFallback />}><ForgotPasswordPage /></Suspense>} />
      <Route path="/boards" element={<Navigate to="/admin/boards" replace />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><AdminDashboardPage /></Suspense>} />
        <Route path="boards" element={<Suspense fallback={<PageLoader />}><BoardsManagePage /></Suspense>} />
        <Route path="pages/new" element={<Suspense fallback={<PageLoader />}><AdminSitePageEditPage /></Suspense>} />
        <Route path="pages/:id/edit" element={<Suspense fallback={<PageLoader />}><AdminSitePageEditPage /></Suspense>} />
        <Route path="pages" element={<Suspense fallback={<PageLoader />}><AdminPagesPage /></Suspense>} />
        <Route path="links" element={<Suspense fallback={<PageLoader />}><AdminLinksPage /></Suspense>} />
        <Route path="community" element={<Suspense fallback={<PageLoader />}><AdminCommunityPage /></Suspense>} />
        <Route path="posts" element={<Suspense fallback={<PageLoader />}><AdminPostsPage /></Suspense>} />
        <Route path="comments" element={<Suspense fallback={<PageLoader />}><AdminCommentsPage /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageLoader />}><AdminReportsPage /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<PageLoader />}><AdminUsersPage /></Suspense>} />
        <Route path="badges" element={<Suspense fallback={<PageLoader />}><AdminBadgesPage /></Suspense>} />
        <Route path="media" element={<Suspense fallback={<PageLoader />}><AdminMediaPage /></Suspense>} />
        <Route path="monitor" element={<Suspense fallback={<PageLoader />}><AdminMonitorPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><AdminSettingsPage /></Suspense>} />
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage title="后台页面不存在" /></Suspense>} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/board/:id" element={<HomePage />} />
        {/* :id 可为 123 或 123.html（伪静态后缀由后台配置） */}
        <Route path="/post/:id" element={<PostDetailPage />} />
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/post/:id/edit" element={<ComposePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/user/:id" element={<UserProfilePage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/links" element={<LinksPage />} />
        <Route path="/showcase" element={<Suspense fallback={null}><ShowcasePage /></Suspense>} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/page/:slug" element={<Suspense fallback={null}><SitePageView /></Suspense>} />
        <Route path="*" element={<Suspense fallback={null}><NotFoundPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Suspense fallback={<PageLoader fullScreen />}><NotFoundPage standalone /></Suspense>} />
    </Route>,
  ),
);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <RouterProvider router={router} />
          <TopProgressBar />
          <PullToRefresh />
          <Toaster />
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}
