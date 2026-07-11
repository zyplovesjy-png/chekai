import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import AdminPage from './pages/AdminPage';
import RecordDetailPage from './pages/RecordDetailPage';
import LayoutLabPage from './pages/LayoutLabPage';
import CardsBetsLayoutLabPage from './pages/CardsBetsLayoutLabPage';
import AppChrome from './components/AppChrome';
import { useAuthStore } from './stores/authStore';
import { unlockAudio } from './pages/room/sounds';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/lobby" replace />;
  return <>{children}</>;
}

export default function App() {
  // iOS: unlock must run in the same gesture stack; keep listening (not once)
  useEffect(() => {
    const onGesture = () => unlockAudio();
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener('touchstart', onGesture, opts);
    window.addEventListener('pointerdown', onGesture, opts);
    window.addEventListener('keydown', onGesture, opts);
    return () => {
      window.removeEventListener('touchstart', onGesture, opts);
      window.removeEventListener('pointerdown', onGesture, opts);
      window.removeEventListener('keydown', onGesture, opts);
    };
  }, []);

  return (
    <>
      <AppChrome />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/admin/records/:id" element={<AdminRoute><RecordDetailPage admin /></AdminRoute>} />
        <Route path="/records/:id" element={<ProtectedRoute><RecordDetailPage /></ProtectedRoute>} />
        <Route path="/room/:code" element={<ProtectedRoute><RoomPage /></ProtectedRoute>} />
        <Route path="/layout-lab" element={<LayoutLabPage />} />
        <Route path="/layout-lab-cards" element={<CardsBetsLayoutLabPage />} />
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </>
  );
}
