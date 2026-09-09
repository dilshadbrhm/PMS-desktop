import { useState } from 'react';
import { logout, type User } from '../api/client';
import NotificationBell from './NotificationBell';
import './Sidebar.css';

type ActiveView = 'dashboard' | 'projects' | 'projectDetail';

interface NavItem {
  id: string;
  label: string;
  view?: ActiveView;           // undefined = gələcəkdə olacaq (deaktiv)
  icon: React.ReactNode;
  soon?: boolean;
}

interface Props {
  user: User;
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  onLogout: () => void;
}

// ── İkon komponentləri ───────────────────────────────────────────────────────

const IconDashboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

const IconProjects = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const IconTasks = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const IconChat = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// ── Köməkçi ──────────────────────────────────────────────────────────────────

function displayName(user: User): string {
  return user?.adSoyad ?? user?.name ?? 'İstifadəçi';
}

function avatarLetter(user: User): string {
  const src = user?.adSoyad ?? user?.name;
  return src?.charAt(0)?.toUpperCase() ?? '?';
}

// ── Menyu elementləri ─────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',      label: 'Dashboard',      view: 'dashboard', icon: <IconDashboard /> },
  { id: 'projects',       label: 'Layihələr',       view: 'projects',  icon: <IconProjects /> },
  { id: 'my-tasks',       label: 'Tapşırıqlarım',  icon: <IconTasks />, soon: true },
  { id: 'chat',           label: 'Chat',            icon: <IconChat />,  soon: true },
];

// ── Komponent ─────────────────────────────────────────────────────────────────

export default function Sidebar({ user, activeView, onNavigate, onLogout }: Props) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch (err) {
      console.error('[Sidebar] Logout xətası:', err);
    } finally {
      onLogout();
    }
  };

  // projectDetail view-u "projects" kimi vurğulanmalıdır
  const resolvedActive = activeView === 'projectDetail' ? 'projects' : activeView;

  return (
    <aside className="sb-root">
      {/* Üst glow effekti */}
      <div className="sb-glow" />

      {/* ── Logo və Bildiriş Zəngi ──────────────────────── */}
      <div className="sb-logo-row">
        <div className="sb-logo">
          <div className="sb-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div className="sb-logo-text">
            <span className="sb-logo-name">PMS</span>
            <span className="sb-logo-sub">İdarəetmə sistemi</span>
          </div>
        </div>

        <div className="sb-logo-actions">
          <NotificationBell />
        </div>
      </div>

      {/* ── Ayırıcı xətt ─────────────────────────────────── */}
      <div className="sb-divider" />

      {/* ── Naviqasiya ───────────────────────────────────── */}
      <nav className="sb-nav" aria-label="Əsas naviqasiya">
        <p className="sb-nav-section-label">Menyu</p>
        {NAV_ITEMS.map(item => {
          const isActive = !item.soon && item.view === resolvedActive;
          const isDisabled = item.soon;

          return (
            <button
              key={item.id}
              className={`sb-nav-item ${isActive ? 'sb-nav-item--active' : ''} ${isDisabled ? 'sb-nav-item--disabled' : ''}`}
              onClick={() => !isDisabled && item.view && onNavigate(item.view)}
              disabled={isDisabled}
              title={isDisabled ? 'Tezliklə...' : item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="sb-nav-icon">{item.icon}</span>
              <span className="sb-nav-label">{item.label}</span>
              {item.soon && (
                <span className="sb-soon-badge">tezliklə</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="sb-spacer" />

      {/* ── İstifadəçi ───────────────────────────────────── */}
      <div className="sb-user-section">
        <div className="sb-divider sb-divider--mb" />
        <div className="sb-user">
          <div className="sb-user-avatar" aria-hidden="true">
            {avatarLetter(user)}
          </div>
          <div className="sb-user-info">
            <span className="sb-user-name">{displayName(user)}</span>
            {user.name && user.adSoyad && (
              <span className="sb-user-login">@{user.name}</span>
            )}
          </div>
          <button
            className="sb-logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Çıxış"
            aria-label="Çıxış"
          >
            {loggingOut
              ? <span className="sb-logout-spinner" />
              : <IconLogout />
            }
          </button>
        </div>
      </div>
    </aside>
  );
}
