import { lazy, Suspense } from 'react';
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
import PageLoader from './components/PageLoader';
import AuthPageFallback from './components/AuthPageFallback';
import { Toaster } from './components/ui/sonner';

const HomePage = lazy(() => import('./pages/HomePage'));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ComposePage = lazy(() => import('./pages/ComposePage'));
const BoardsManagePage = lazy(() => import('./pages/BoardsManagePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminPostsPage = lazy(() => import('./pages/admin/AdminPostsPage'));
const AdminCommentsPage = lazy(() => import('./pages/admin/AdminCommentsPage'));
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminMediaPage = lazy(() => import('./pages/admin/AdminMediaPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Suspense fallback={<AuthPageFallback />}><LoginPage /></Suspense>} />
      <Route path="/register" element={<Suspense fallback={<AuthPageFallback />}><RegisterPage /></Suspense>} />
      <Route path="/boards" element={<Navigate to="/admin/boards" replace />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><AdminDashboardPage /></Suspense>} />
        <Route path="boards" element={<Suspense fallback={<PageLoader />}><BoardsManagePage /></Suspense>} />
        <Route path="posts" element={<Suspense fallback={<PageLoader />}><AdminPostsPage /></Suspense>} />
        <Route path="comments" element={<Suspense fallback={<PageLoader />}><AdminCommentsPage /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageLoader />}><AdminReportsPage /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<PageLoader />}><AdminUsersPage /></Suspense>} />
        <Route path="media" element={<Suspense fallback={<PageLoader />}><AdminMediaPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><AdminSettingsPage /></Suspense>} />
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage title="后台页面不存在" /></Suspense>} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        {/* :id 可为 123 或 123.html（伪静态后缀由后台配置） */}
        <Route path="/post/:id" element={<PostDetailPage />} />
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/post/:id/edit" element={<ComposePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/user/:id" element={<UserProfilePage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>} />
      </Route>
      <Route path="*" element={<Suspense fallback={<PageLoader fullScreen />}><NotFoundPage standalone /></Suspense>} />
    </>,
  ),
);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <RouterProvider router={router} />
          <Toaster />
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}
