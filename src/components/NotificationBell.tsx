import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getNotifications,
  getNotificationDetail,
  markNotificationRead,
  type Bildiris,
} from '../api/client';
import { onNewNotification } from '../api/socket';
import './NotificationBell.css';

// ── Vaxt formatı köməkçisi ──────────────────────────────────────────────────
const MONTH_NAMES_AZ = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn',
  'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek',
];

function formatTime(isoStr?: string | null): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'İndicə';
    if (diffMins < 60) return `${diffMins} dəq əvvəl`;
    if (diffHours < 24) return `${diffHours} saat əvvəl`;
    if (diffDays === 1) return 'Dünən';

    const day = d.getDate();
    const month = MONTH_NAMES_AZ[d.getMonth()] || '';
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month}, ${hours}:${mins}`;
  } catch {
    return isoStr ?? '';
  }
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount]         = useState<number>(0);
  const [notifications, setNotifications]     = useState<Bildiris[]>([]);
  const [isOpen, setIsOpen]                   = useState<boolean>(false);
  const [loading, setLoading]                 = useState<boolean>(false);
  const [error, setError]                     = useState<string>('');
  const [selectedNotif, setSelectedNotif]     = useState<Bildiris | null>(null);
  const [detailLoading, setDetailLoading]     = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Siyahını yüklə ──────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async (silence = false) => {
    if (!silence) setLoading(true);
    setError('');
    try {
      const data = await getNotifications();
      console.log('[NotificationBell] Bildirişlər gəldi:', data);
      setNotifications(data.siyahi);
      setUnreadCount(data.say);
    } catch (err: unknown) {
      console.error('[NotificationBell] Yükləmə xətası:', err);
      if (!silence) {
        setError(err instanceof Error ? err.message : 'Bildirişlər yüklənmədi');
      }
    } finally {
      if (!silence) setLoading(false);
    }
  }, []);

  // İlkin mount və real-time dinləyici
  useEffect(() => {
    fetchNotifications();

    // Real-time: yeniNotification gələndə siyahını yenilə
    const unsubscribe = onNewNotification((data) => {
      console.log('[NotificationBell] Real-time bildiriş gəldi:', data);
      fetchNotifications(true);
    });

    return () => {
      unsubscribe();
    };
  }, [fetchNotifications]);

  // Dropdown kənarına klik edəndə bağla
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // ── Bildirişə klik: Detalını al və oxunmuş kimi qeyd et ────────────────────
  const handleItemClick = async (notif: Bildiris) => {
    console.log('[NotificationBell] Bildiriş klikləndi, id:', notif.id);
    setSelectedNotif(notif);
    setDetailLoading(true);

    try {
      // 1. getNotificationDetail(id) çağır
      const detail = await getNotificationDetail(notif.id);
      setSelectedNotif(detail);

      // 2. Əgər oxunmayıbsa markNotificationRead(id) çağır və sayı azalt
      const isAlreadyRead = Boolean(notif.oxundu || notif.read || notif.isRead);
      if (!isAlreadyRead) {
        await markNotificationRead(notif.id);

        // State-də oxunmuş qeyd et
        setNotifications(prev =>
          prev.map(item =>
            item.id === notif.id ? { ...item, oxundu: true, read: true, isRead: true } : item
          )
        );
        setUnreadCount(c => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error('[NotificationBell] Detal / oxundu xətası:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedNotif(null);
  };

  return (
    <div className="nb-root" ref={containerRef}>
      {/* ── Zəng düyməsi ──────────────────────────────────────────────── */}
      <button
        className={`nb-bell-btn ${isOpen ? 'nb-bell-btn--active' : ''}`}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications(true);
        }}
        title="Bildirişlər"
        aria-label="Bildirişlər"
        aria-expanded={isOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="nb-badge" title={`${unreadCount} oxunmamış bildiriş`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ────────────────────────────────────────────── */}
      {isOpen && (
        <div className="nb-dropdown">
          <div className="nb-header">
            <div className="nb-header-left">
              <span className="nb-title">Bildirişlər</span>
              {unreadCount > 0 && (
                <span className="nb-unread-pill">{unreadCount} yeni</span>
              )}
            </div>
            <button
              className="nb-refresh-btn"
              onClick={() => fetchNotifications()}
              disabled={loading}
              title="Yenilə"
            >
              <svg className={loading ? 'nb-spin' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>

          <div className="nb-body">
            {loading && notifications.length === 0 && (
              <div className="nb-state">
                <div className="nb-spinner" />
                <span>Yüklənir...</span>
              </div>
            )}

            {!loading && error && (
              <div className="nb-state nb-state--error">
                <span>{error}</span>
                <button className="nb-retry-btn" onClick={() => fetchNotifications()}>Yenidən cəhd et</button>
              </div>
            )}

            {!loading && !error && notifications.length === 0 && (
              <div className="nb-state nb-state--empty">
                <div className="nb-empty-icon">🔕</div>
                <span>Yeni bildiriş yoxdur</span>
              </div>
            )}

            {notifications.length > 0 && (
              <div className="nb-list">
                {notifications.map(item => {
                  const isRead = Boolean(item.oxundu || item.read || item.isRead);
                  const itemTime = formatTime(item.createdAt || item.created_at);

                  return (
                    <div
                      key={item.id}
                      className={`nb-item ${!isRead ? 'nb-item--unread' : ''}`}
                      onClick={() => handleItemClick(item)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="nb-item-indicator-col">
                        <span className={`nb-item-dot ${!isRead ? 'nb-item-dot--active' : ''}`} />
                      </div>

                      <div className="nb-item-content">
                        <div className="nb-item-title-row">
                          <span className="nb-item-title">{item.title || 'Bildiriş'}</span>
                          {itemTime && <span className="nb-item-time">{itemTime}</span>}
                        </div>

                        {item.senderName && (
                          <div className="nb-item-sender">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                            </svg>
                            <span>{item.senderName}</span>
                          </div>
                        )}

                        {item.message && (
                          <p className="nb-item-preview">{item.message}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bildiriş Detal Modalı ─────────────────────────────────────── */}
      {selectedNotif && (
        <div className="nb-modal-overlay" onClick={handleCloseDetail}>
          <div className="nb-modal-card" onClick={e => e.stopPropagation()}>
            <div className="nb-modal-header">
              <div className="nb-modal-title-wrap">
                <div className="nb-modal-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <h3 className="nb-modal-title">{selectedNotif.title || 'Bildiriş detalları'}</h3>
              </div>
              <button className="nb-modal-close" onClick={handleCloseDetail} title="Bağla">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="nb-modal-body">
              <div className="nb-modal-meta">
                {selectedNotif.senderName && (
                  <div className="nb-modal-meta-item">
                    <span className="nb-meta-label">Göndərən:</span>
                    <span className="nb-meta-val">{selectedNotif.senderName}</span>
                  </div>
                )}
                {(selectedNotif.createdAt || selectedNotif.created_at) && (
                  <div className="nb-modal-meta-item">
                    <span className="nb-meta-label">Tarix:</span>
                    <span className="nb-meta-val">{formatTime(selectedNotif.createdAt || selectedNotif.created_at)}</span>
                  </div>
                )}
              </div>

              {detailLoading ? (
                <div className="nb-detail-loader">
                  <div className="nb-spinner" />
                  <span>Məzmun yüklənir...</span>
                </div>
              ) : (
                <div className="nb-modal-message">
                  {selectedNotif.message || 'Əlavə məlumat qeyd edilməyib.'}
                </div>
              )}
            </div>

            <div className="nb-modal-footer">
              <button className="nb-modal-btn" onClick={handleCloseDetail}>
                Bağla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
