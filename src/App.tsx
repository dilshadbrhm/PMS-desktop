import { useState, useEffect } from 'react';
import { getMe, getToken, type User } from './api/client';
import { connectSocket, disconnectSocket } from './api/socket';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import ProjectsPage from './components/ProjectsPage';
import ProjectDetailPage from './components/ProjectDetailPage';
import Sidebar from './components/Sidebar';
import './App.css';

type View = 'dashboard' | 'projects' | 'projectDetail';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checking, setChecking]       = useState<boolean>(true);
  const [view, setView]               = useState<View>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // App ilk açılanda token/sessiyasını yoxlayır
  useEffect(() => {
    console.log('[App] getMe() ilə sessiya yoxlanılır...');
    getMe().then(user => {
      if (user) {
        console.log('[App] Mövcud sessiyadan user tapıldı:', JSON.stringify(user));
        setCurrentUser(user);
      } else {
        console.log('[App] Aktiv sessiya yoxdur — login səhifəsi göstərilir');
      }
      setChecking(false);
    });
  }, []);

  // TODO (müvəqqəti test): currentUser dəyişəndə socket bağla/ayır
  useEffect(() => {
    if (!currentUser) return;
    const token = getToken();
    if (!token) {
      console.warn('[App] Socket: token yoxdur, bağlantı başladılmır');
      return;
    }
    connectSocket(token);
    // Cleanup: bu effect yenidən işləməzdən əvvəl ayırma lazım deyil —
    // disconnectSocket yalnız logout-da çağırılır ki, bağlantı davamlı olsun
  }, [currentUser]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLoginSuccess = (user: User) => {
    console.log('[App] Login uğurlu, user:', JSON.stringify(user));
    setCurrentUser(user);
    setView('dashboard');
  };

  const handleLogout = () => {
    console.log('[App] Logout');
    disconnectSocket(); // TODO (müvəqqəti test): socket bağlantısını ayır
    setCurrentUser(null);
    setSelectedProjectId(null);
    setView('dashboard');
  };

  const handleNavigate = (target: View) => {
    if (target !== 'projects') setSelectedProjectId(null);
    setView(target);
  };

  const handleSelectProject = (projectId: number) => {
    console.log('[App] Layihəyə keçilir, id:', projectId);
    setSelectedProjectId(projectId);
    setView('projectDetail');
  };

  const handleBackToProjects = () => {
    setSelectedProjectId(null);
    setView('projects');
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (checking) return <AppLoader />;

  // ── Login (Sidebar yoxdur) ─────────────────────────────────────────────────

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Əsas layout: Sidebar + kontent ────────────────────────────────────────

  const renderContent = () => {
    if (view === 'projectDetail' && selectedProjectId !== null) {
      return (
        <ProjectDetailPage
          projectId={selectedProjectId}
          currentUserId={currentUser.id}
          onBack={handleBackToProjects}
        />
      );
    }
    if (view === 'projects') {
      return (
        <ProjectsPage
          onBack={() => handleNavigate('dashboard')}
          onSelectProject={handleSelectProject}
        />
      );
    }
    return (
      <Dashboard
        user={currentUser}
        onLogout={handleLogout}
        onOpenProjects={() => handleNavigate('projects')}
      />
    );
  };

  return (
    <div className="app-shell">
      <Sidebar
        user={currentUser}
        activeView={view}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />
      <main className="app-content">
        {renderContent()}
      </main>
    </div>
  );
}

// ── Sadə yükləmə ekranı ───────────────────────────────────────────────────────
function AppLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0d0e14',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(99,102,241,0.25)',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: '#4b5280', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '14px', margin: 0 }}>
        Sessiya yoxlanılır...
      </p>
    </div>
  );
}
