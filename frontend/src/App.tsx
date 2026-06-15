import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles/global.css';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import MainLayout from './layouts/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import PageLoader from './components/PageLoader';
import { Toaster } from './components/ui/sonner';

const HomePage = lazy(() => import('./pages/HomePage'));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ComposePage = lazy(() => import('./pages/ComposePage'));
const BoardsManagePage = lazy(() => import('./pages/BoardsManagePage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Suspense fallback={<PageLoader />}><LoginPage /></Suspense>} />
              <Route path="/register" element={<Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>} />
              <Route element={<MainLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/post/:id" element={<PostDetailPage />} />
                <Route path="/post/:id/edit" element={<ComposePage />} />
                <Route path="/compose" element={<ComposePage />} />
                <Route path="/boards" element={<BoardsManagePage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <Toaster />
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}
