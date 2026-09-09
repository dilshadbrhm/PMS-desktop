import { useState } from 'react';
import { logout, type User } from '../api/client';
import './Dashboard.css';

interface Props {
  user: User;
  onLogout: () => void;
  onOpenProjects: () => void;
}

// ── Köməkçi funksiyalar ──────────────────────────────────────────────────────

/** Ekranda göstəriləcək tam ad: adSoyad → name → "İstifadəçi" */
function displayName(user: User): string {
  return user?.adSoyad ?? user?.name ?? 'İstifadəçi';
}

/** Avatar üçün baş hərf: adSoyad → name → '?' */
function avatarLetter(user: User): string {
  const src = user?.adSoyad ?? user?.name;
  return src?.charAt(0)?.toUpperCase() ?? '?';
}

// ── Komponent ────────────────────────────────────────────────────────────────

export default function Dashboard({ user, onLogout, onOpenProjects }: Props) {
  // Debug məqsədilə qəbul edilən user obyektini konsola yazırıq
  console.log('[Dashboard] Qəbul edilən user prop-u:', JSON.stringify(user));

  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      console.log('[Dashboard] Logout uğurlu');
    } catch (err) {
      // Cookie-ləri serverda silə bilməsə də, lokalda sessiyadan çıxırıq
      console.error('[Dashboard] Logout xətası (lokalda çıxılır):', err);
    } finally {
      onLogout();
    }
  };

  return (
    <div className="db-root">
      <div className="db-card">

        {/* Avatar */}
        <div className="db-avatar" aria-hidden="true">
          {avatarLetter(user)}
        </div>

        {/* Başlıq */}
        <h1 className="db-title">
          Xoş gəlmisiniz,{' '}
          <span className="db-username">{displayName(user)}</span>!
        </h1>

        <p className="db-subtitle">PMS sisteminə uğurla daxil oldunuz.</p>

        {/* İstifadəçi məlumatları */}
        <div className="db-info">
          <div className="db-info-row">
            <span className="db-info-label">İstifadəçi ID</span>
            <span className="db-info-value">{user?.id != null ? `#${user.id}` : '—'}</span>
          </div>

          {user?.name && (
            <div className="db-info-row">
              <span className="db-info-label">Login adı</span>
              <span className="db-info-value">{user.name}</span>
            </div>
          )}

          {user?.adSoyad && (
            <div className="db-info-row">
              <span className="db-info-label">Ad Soyad</span>
              <span className="db-info-value">{user.adSoyad}</span>
            </div>
          )}

          {user?.role !== undefined && (
            <div className="db-info-row">
              <span className="db-info-label">Rol</span>
              <span className="db-info-value db-role">{String(user.role)}</span>
            </div>
          )}

          {user?.status !== undefined && (
            <div className="db-info-row">
              <span className="db-info-label">Status</span>
              <span className={`db-info-value db-status ${user.status === 1 ? 'db-status--active' : 'db-status--inactive'}`}>
                {user.status === 1 ? 'Aktiv' : 'Deaktiv'}
              </span>
            </div>
          )}
        </div>

        {/* Layihələrimə keçid düyməsi */}
        <button
          id="db-projects-btn"
          className="db-projects-btn"
          onClick={onOpenProjects}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Layihələrimi göstər
        </button>

        {/* Çıxış düyməsi */}
        <button
          id="db-logout-btn"
          className="db-logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <><span className="db-spinner" />Çıxılır...</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Çıxış
            </>
          )}
        </button>

      </div>

      {/* Dekorativ arxa fon blob-ları */}
      <div className="db-blob db-blob--1" />
      <div className="db-blob db-blob--2" />
      <div className="db-blob db-blob--3" />
    </div>
  );
}
