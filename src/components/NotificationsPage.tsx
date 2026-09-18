import { useState, useEffect, useCallback } from 'react';
import { getToken } from '../api/client';
import {
  getBildirisTarixce,
  getGonderilenler,
  getNotifyMe,
  getSobeler,
  type BildirisItem,
  type BildirisSeviyye,
  type GonderilenItem,
  type SobeItem,
} from '../api/notifyClient';
import {
  connectNotifySocket,
  sendBildiris,
  deleteBildiris,
  onYeniBildiris,
  onBildirisSilindi,
  getSocket,
  getCihazId,
} from '../api/notifySocket';
import AdminPanel from './AdminPanel';
import './NotificationsPage.css';

interface Props {
  onBack?: () => void;
}

function formatNotifyDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('az-AZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getSenderName(gonderen?: BildirisItem['gonderen']): string {
  if (!gonderen) return 'Sistem';
  if (typeof gonderen === 'string') return gonderen;
  return gonderen.adSoyad || gonderen.name || 'Sistem';
}

function getItemSenderId(item: BildirisItem): string | null {
  if (item.gonderenId != null) return String(item.gonderenId);
  if (typeof item.gonderen === 'object' && item.gonderen && (item.gonderen as any).id != null) {
    return String((item.gonderen as any).id);
  }
  return null;
}

function getSeviyyeLabel(seviyye: BildirisSeviyye | string): string {
  const norm = String(seviyye || 'adi').toLowerCase();
  switch (norm) {
    case 'vacib':
      return 'Vacib';
    case 'cox_vacib':
      return 'Çox Vacib';
    case 'adi':
    default:
      return 'Adi';
  }
}

export default function NotificationsPage({ }: Props) {
  const [items, setItems] = useState<BildirisItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState<boolean>(true);

  // Rolun normallaşdırılması və admin səlahiyyəti — bütün hook və funksiyalardan əvvəl təyin olunur
  const normalizedRole = String(userRole || '').trim().toUpperCase();
  const isAdmin = !roleLoading && (normalizedRole === 'ADMIN' || normalizedRole === 'SUPERADMIN');

  // Admin üst tabları: 'gonder' | 'gonderilenler' | 'admin'
  const [adminTab, setAdminTab] = useState<'gonder' | 'gonderilenler' | 'admin'>('gonder');

  // Göndərilənlər tabı üçün state-lər
  const [gonderilenler, setGonderilenler] = useState<GonderilenItem[]>([]);
  const [gonderilenlerLoading, setGonderilenlerLoading] = useState<boolean>(false);
  const [gonderilenlerError, setGonderilenlerError] = useState<string>('');

  // Mesaj göndərmə paneli state-ləri
  const [testMesaj, setTestMesaj] = useState<string>('');
  const [testSeviyye, setTestSeviyye] = useState<BildirisSeviyye>('adi');
  const [hedefTipi, setHedefTipi] = useState<'HAMISI' | 'SOBE'>('HAMISI');
  const [selectedSobeId, setSelectedSobeId] = useState<string>('');
  const [sobelerList, setSobelerList] = useState<SobeItem[]>([]);
  const [testGonderiyor, setTestGonderiyor] = useState<boolean>(false);
  const [testNetice, setTestNetice] = useState<{ ok: boolean; mesaj: string } | null>(null);

  // Tarixçəni yüklə
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getBildirisTarixce();
      console.log('[NotificationsPage] Tarixçə alındı:', data);
      setItems(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('[NotificationsPage] Yükləmə xətası:', err);
      setError(err instanceof Error ? err.message : 'Bildirişləri yükləmək mümkün olmadı');
    } finally {
      setLoading(false);
    }
  }, []);

  // Socket və dinləyicilərin qurulması + cari istifadəçi rolunun öyrənilməsi + şöbələr
  useEffect(() => {
    const token = getToken();
    if (token) {
      connectNotifySocket(token);
    }

    loadHistory();

    // Cari istifadəçinin notify sistemindəki rolunu öyrənirik
    setRoleLoading(true);
    getNotifyMe()
      .then(info => {
        const rol = info?.rol;
        console.log('[NotificationsPage] Yüklənən rol:', JSON.stringify(rol));
        console.log('[NotificationsPage] Cari notify istifadəçi tam məlumatı:', info);

        if (info?.id != null) {
          setCurrentUserId(String(info.id));
        }

        if (rol) {
          const normalized = String(rol).trim().toUpperCase();
          setUserRole(normalized);

          if (normalized === 'ADMIN' || normalized === 'SUPERADMIN') {
            // Şöbələri yükləyirik
            getSobeler().then(list => {
              setSobelerList(list || []);
              if (list && list.length > 0) {
                setSelectedSobeId(String(list[0].id));
              }
            }).catch(err => {
              console.warn('[NotificationsPage] Şöbələr yüklənmədi:', err);
            });
          }
        } else {
          setUserRole('USER');
        }
      })
      .catch(err => {
        console.error('[NotificationsPage] Rol yüklənərkən xəta:', err);
        setUserRole('USER');
      })
      .finally(() => {
        setRoleLoading(false);
      });

    // Yeni bildiriş hadisəsi — yalnız siyahının başına əlavə edir (vizual overlay artıq BildirisOverlay tərəfindən göstərilir)
    const unsubYeni = onYeniBildiris((yeni: BildirisItem) => {
      console.log('[NotificationsPage] YENİ BİLDİRİŞ GƏLDİ (siyahıya əlavə edilir):', yeni);
      setItems(prev => [yeni, ...prev]);
    });

    // Bildiriş silindi hadisəsi — həm tarixçədən, həm də göndərilənlərdən çıxarılır / yenilənir
    const unsubSil = onBildirisSilindi((data: any) => {
      const targetId = data?.id ?? data?.bildirisId;
      console.log('[NotificationsPage] onBildirisSilindi hadisəsi alındı, ID:', targetId);
      if (targetId != null) {
        setItems(prev => prev.filter(item => String(item.id) !== String(targetId)));
        setGonderilenler(prev =>
          prev.map(g => (String(g.id) === String(targetId) ? { ...g, silinib: true } : g))
        );
      }
    });

    return () => {
      unsubYeni();
      unsubSil();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Göndərilən bildirişləri yüklə
  const loadGonderilenler = useCallback(async () => {
    setGonderilenlerLoading(true);
    setGonderilenlerError('');
    try {
      const data = await getGonderilenler();
      console.log('[NotificationsPage] Göndərilənlər alındı:', data);
      setGonderilenler(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('[NotificationsPage] Göndərilənləri yükləmə xətası:', err);
      setGonderilenlerError(
        err instanceof Error ? err.message : 'Göndərilən bildirişləri yükləmək mümkün olmadı'
      );
    } finally {
      setGonderilenlerLoading(false);
    }
  }, []);

  // adminTab dəyişəndə əgər 'gonderilenler' seçilibsə yükləyirik
  useEffect(() => {
    if (adminTab === 'gonderilenler' && isAdmin) {
      loadGonderilenler();
    }
  }, [adminTab, isAdmin, loadGonderilenler]);

  const handleDeleteBildiris = async (item: BildirisItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const tesdiq = window.confirm('Bu bildirişi silmək istədiyinizə əminsiniz?');
    if (!tesdiq) return;

    try {
      console.log('[NotificationsPage] Bildiriş silinir:', item.id);
      await deleteBildiris(item.id);
      // Yerli state-dən dərhal çıxarırıq (optimistic UI)
      setItems(prev => prev.filter(i => String(i.id) !== String(item.id)));
      setGonderilenler(prev =>
        prev.map(g => (String(g.id) === String(item.id) ? { ...g, silinib: true } : g))
      );
    } catch (err: unknown) {
      console.error('[NotificationsPage] Bildiriş silinərkən xəta:', err);
      alert(err instanceof Error ? err.message : 'Bildirişi silmək mümkün olmadı');
    }
  };

  const handleDeleteGonderilen = async (item: GonderilenItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const tesdiq = window.confirm('Bu bildirişi silmək istədiyinizə əminsiniz?');
    if (!tesdiq) return;

    try {
      console.log('[NotificationsPage] Göndərilən bildiriş silinir:', item.id);
      await deleteBildiris(item.id);
      // Yerli state-də silinib: true kimi qeyd edirik
      setGonderilenler(prev =>
        prev.map(g => (String(g.id) === String(item.id) ? { ...g, silinib: true } : g))
      );
      setItems(prev => prev.filter(i => String(i.id) !== String(item.id)));
    } catch (err: unknown) {
      console.error('[NotificationsPage] Göndərilən bildiriş silinərkən xəta:', err);
      alert(err instanceof Error ? err.message : 'Bildirişi silmək mümkün olmadı');
    }
  };

  const handleTestGonder = async () => {
    if (!testMesaj.trim()) return;

    if (hedefTipi === 'SOBE' && !selectedSobeId) {
      setTestNetice({ ok: false, mesaj: 'Zəhmət olmasa hədəf şöbəni seçin' });
      return;
    }

    setTestGonderiyor(true);
    setTestNetice(null);
    try {
      const socket = getSocket();
      console.log('[NotificationsPage] Göndər basıldı, socket bağlıdırmı:', socket?.connected);

      if (!socket || !socket.connected) {
        console.log('[NotificationsPage] Socket bağlı deyil, avtomatik yenidən qoşulmağa cəhd edilir...');
        const token = getToken();
        if (token) {
          connectNotifySocket(token, getCihazId());
        }
        // Race condition aradan qaldırmaq üçün 1 saniyə gözləyirik
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('[NotificationsPage] Gözləmədən sonra socket bağlıdırmı:', getSocket()?.connected);
      }

      const hedefIdParam = hedefTipi === 'SOBE' ? selectedSobeId : null;
      await sendBildiris(hedefTipi, hedefIdParam, testMesaj.trim(), testSeviyye);
      setTestNetice({ ok: true, mesaj: 'Bildiriş uğurla göndərildi!' });
      setTestMesaj('');
      // Əgər göndərilənlər tabı açıqdırsa yeniləyirik
      if (adminTab === 'gonderilenler') {
        loadGonderilenler();
      }
    } catch (err) {
      setTestNetice({ ok: false, mesaj: err instanceof Error ? err.message : 'Göndərmə xətası' });
    } finally {
      setTestGonderiyor(false);
      setTimeout(() => setTestNetice(null), 4000);
    }
  };

  console.log('[NotificationsPage] Render zamanı rol:', JSON.stringify(userRole), '| normalizedRole:', normalizedRole, '| isAdmin:', isAdmin, '| roleLoading:', roleLoading);

  // Rol məlumatı tam yüklənənə qədər heç bir panel və ya tab göstərilmir
  if (roleLoading) {
    return (
      <div className="np-root">
        <div className="np-blob np-blob--1" />
        <div className="np-blob np-blob--2" />
        <div className="np-state-center" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="np-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
          <p className="np-state-title" style={{ marginTop: '16px', color: '#94a3b8', fontSize: '14px' }}>
            İstifadəçi səlahiyyətləri yoxlanılır...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="np-root">
      <div className="np-blob np-blob--1" />
      <div className="np-blob np-blob--2" />

      {/* ── YUXARI TABLAR: YALNIZ ADMIN / SUPERADMIN ÜÇÜN ── */}
      {isAdmin && (
        <div className="np-top-tabs">
          <button
            type="button"
            className={`np-tab-btn ${adminTab === 'gonder' ? 'np-tab-btn--active' : ''}`}
            onClick={() => setAdminTab('gonder')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span>Bildirişlər və Göndər</span>
          </button>
          <button
            type="button"
            className={`np-tab-btn ${adminTab === 'gonderilenler' ? 'np-tab-btn--active' : ''}`}
            onClick={() => setAdminTab('gonderilenler')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span>Göndərilənlər</span>
          </button>
          <button
            type="button"
            className={`np-tab-btn ${adminTab === 'admin' ? 'np-tab-btn--active' : ''}`}
            onClick={() => setAdminTab('admin')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>İstifadəçilər və Şöbələr</span>
          </button>
        </div>
      )}

      {/* ── TAB 2: İSTİFADƏÇİLƏR VƏ ŞÖBƏLƏR (ADMIN PANEL) ── */}
      {isAdmin && adminTab === 'admin' ? (
        <AdminPanel />
      ) : isAdmin && adminTab === 'gonderilenler' ? (
        /* ── TAB 3: GÖNDƏRİLƏNLƏR ── */
        <div className="np-gonderilenler-wrap">
          <header className="np-header">
            <div className="np-header-left">
              <div className="np-title-group">
                <h1 className="np-title">Göndərilən Bildirişlər</h1>
                <p className="np-subtitle">
                  Göndərilmiş bildirişlərin tarixçəsi və oxunma statistikası
                </p>
              </div>
            </div>

            <div className="np-header-right">
              <button
                type="button"
                className="np-refresh-btn"
                onClick={loadGonderilenler}
                disabled={gonderilenlerLoading}
                title="Yenilə"
              >
                <svg
                  className={gonderilenlerLoading ? 'np-spin' : ''}
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Yenilə
              </button>
            </div>
          </header>

          {/* Yüklənir */}
          {gonderilenlerLoading && (
            <div className="np-state-center">
              <div className="np-spinner" />
              <p className="np-state-text">Göndərilən bildirişlər yüklənir...</p>
            </div>
          )}

          {/* Xəta */}
          {!gonderilenlerLoading && gonderilenlerError && (
            <div className="np-state-center np-error-box">
              <h3 className="np-error-title">Xəta baş verdi</h3>
              <p className="np-error-msg">{gonderilenlerError}</p>
              <button type="button" className="np-retry-btn" onClick={loadGonderilenler}>
                Yenidən cəhd et
              </button>
            </div>
          )}

          {/* Boş */}
          {!gonderilenlerLoading && !gonderilenlerError && gonderilenler.length === 0 && (
            <div className="np-state-center">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <p className="np-state-text">Hələ heç bir bildiriş göndərilməyib</p>
            </div>
          )}

          {/* Siyahı */}
          {!gonderilenlerLoading && !gonderilenlerError && gonderilenler.length > 0 && (
            <div className="np-list-container">
              {gonderilenler.map(item => {
                const isSilinib = Boolean(item.silinib);
                const seviyyeKey = String(item.seviyye || 'adi').toLowerCase();
                const seviyyeLabel = getSeviyyeLabel(seviyyeKey);
                const dateDisplay = formatNotifyDate(item.yaradildi || item.tarix || item.created_at);

                // Oxunma statistikası: "X nəfərdən Y nəfər oxudu"
                const cemi = item.cemiAlici ?? (item.oxunmalar ? item.oxunmalar.length : 0);
                const oxuyan = item.oxuyanSay ?? (item.oxunmalar ? item.oxunmalar.filter(o => o.oxunduTarixi != null).length : 0);
                const faiz = cemi > 0 ? Math.round((oxuyan / cemi) * 100) : 0;

                // Hədəf adı
                let hedefGosterim = item.hedefAd;
                if (!hedefGosterim) {
                  if (item.hedefTipi === 'HAMISI') hedefGosterim = 'Bütün İstifadəçilər (HAMISI)';
                  else if (item.hedefTipi === 'SOBE') hedefGosterim = `Şöbə #${item.hedefId || ''}`;
                  else if (item.hedefTipi === 'USER') hedefGosterim = `İstifadəçi #${item.hedefId || ''}`;
                  else hedefGosterim = item.hedefTipi || 'Ümumi';
                }

                return (
                  <div
                    key={item.id}
                    className={`np-item np-item--${seviyyeKey} ${isSilinib ? 'np-item--silinib' : ''}`}
                  >
                    <div className="np-item-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </div>

                    <div className="np-item-body">
                      <div className="np-item-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className="np-item-sender">
                            Hədəf: <strong style={{ color: '#818cf8' }}>{hedefGosterim}</strong>
                          </span>
                          <span className={`np-item-badge np-badge--${seviyyeKey}`}>
                            {seviyyeLabel}
                          </span>
                          {isSilinib && (
                            <span className="np-badge-silinib">Silinib</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {dateDisplay && <span className="np-item-time" style={{ marginTop: 0 }}>{dateDisplay}</span>}
                          {!isSilinib && (
                            <button
                              type="button"
                              className="np-delete-btn"
                              title="Bu bildirişi sil"
                              onClick={(e) => handleDeleteGonderilen(item, e)}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      <p className={`np-item-msg ${isSilinib ? 'np-item-msg--silinib' : ''}`}>
                        {item.mesaj}
                      </p>

                      {/* Oxunma Statistikası */}
                      <div className="np-stats-row">
                        <div className="np-stats-text">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>
                            Oxunma: <strong>{cemi} nəfərdən {oxuyan} nəfər oxudu</strong> {cemi > 0 && `(${faiz}%)`}
                          </span>
                        </div>
                        {cemi > 0 && (
                          <div className="np-progress-bar-bg" title={`${faiz}% oxunub`}>
                            <div
                              className="np-progress-bar-fill"
                              style={{ width: `${Math.min(100, faiz)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── TAB 1: BİLDİRİŞLƏR VƏ TEST PANELİ ── */
        <>
          {/* BİLDİRİŞ GÖNDƏRMƏ PANELİ - yalnız ADMIN və ya SUPERADMIN üçün */}
          {isAdmin && (
            <div className="np-test-panel">
              <div className="np-test-panel-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span>Bildiriş Göndər</span>
                <span className="np-test-badge">{userRole}</span>
              </div>
              <div className="np-test-panel-body" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <input
                  id="test-mesaj-input"
                  type="text"
                  className="np-test-input"
                  placeholder="Bildiriş mesajını yazın..."
                  value={testMesaj}
                  onChange={e => setTestMesaj(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !testGonderiyor) handleTestGonder(); }}
                  disabled={testGonderiyor}
                  style={{ minWidth: '220px' }}
                />

                {/* Hədəf Tipi: HAMISI və ya ŞÖBƏ */}
                <select
                  id="test-hedef-select"
                  className="np-test-select"
                  value={hedefTipi}
                  onChange={e => {
                    const val = e.target.value as 'HAMISI' | 'SOBE';
                    setHedefTipi(val);
                    if (val === 'SOBE' && !selectedSobeId && sobelerList.length > 0) {
                      setSelectedSobeId(String(sobelerList[0].id));
                    }
                  }}
                  disabled={testGonderiyor}
                >
                  <option value="HAMISI">Bütün İstifadəçilər (HAMISI)</option>
                  <option value="SOBE">Şöbə üzrə (ŞÖBƏ)</option>
                </select>

                {/* Əgər ŞÖBƏ seçilibsə, şöbələr dropdown-u */}
                {hedefTipi === 'SOBE' && (
                  <select
                    id="test-sobe-select"
                    className="np-test-select"
                    value={selectedSobeId}
                    onChange={e => setSelectedSobeId(e.target.value)}
                    disabled={testGonderiyor}
                    style={{ borderColor: '#6366f1' }}
                  >
                    {sobelerList.length === 0 ? (
                      <option value="">Şöbə tapılmadı</option>
                    ) : (
                      sobelerList.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.ad} ({s.uzvSayi ?? s.memberCount ?? 0} üzv)
                        </option>
                      ))
                    )}
                  </select>
                )}

                {/* Səviyyə: Adi, Vacib, Çox Vacib */}
                <select
                  id="test-seviyye-select"
                  className="np-test-select"
                  value={testSeviyye}
                  onChange={e => setTestSeviyye(e.target.value as BildirisSeviyye)}
                  disabled={testGonderiyor}
                >
                  <option value="adi">Adi</option>
                  <option value="vacib">Vacib</option>
                  <option value="cox_vacib">Çox Vacib</option>
                </select>

                <button
                  id="test-gonder-btn"
                  type="button"
                  className={'np-test-btn' + (testGonderiyor ? ' np-test-btn--loading' : '')}
                  onClick={handleTestGonder}
                  disabled={testGonderiyor || !testMesaj.trim()}
                >
                  {testGonderiyor
                    ? <svg className="np-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  }
                  {testGonderiyor ? 'Göndərilir...' : 'Göndər'}
                </button>
              </div>

              {testNetice && (
                <div className={'np-test-netice' + (testNetice.ok ? ' np-test-netice--ok' : ' np-test-netice--err')}>
                  {testNetice.ok ? '✓' : '✕'} {testNetice.mesaj}
                </div>
              )}
            </div>
          )}


      {/* Header */}
      <header className="np-header">
        <div className="np-header-left">
          <div className="np-title-group">
            <h1 className="np-title">Bildirişlər</h1>
            <p className="np-subtitle">
              Sistem və idarəetmə bildirişlərinin tarixçəsi
            </p>
          </div>
        </div>

        <div className="np-header-right">
          <button
            type="button"
            className="np-refresh-btn"
            onClick={loadHistory}
            disabled={loading}
            title="Yenilə"
          >
            <svg
              className={loading ? 'np-spin' : ''}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Yenilə
          </button>
        </div>
      </header>

      {/* Yüklənir */}
      {loading && (
        <div className="np-state-center">
          <div className="np-spinner" />
          <p className="np-state-text">Bildirişlər yüklənir...</p>
        </div>
      )}

      {/* Xəta */}
      {!loading && error && (
        <div className="np-state-center np-error-box">
          <h3 className="np-error-title">Xəta baş verdi</h3>
          <p className="np-error-msg">{error}</p>
          <button type="button" className="np-retry-btn" onClick={loadHistory}>
            Yenidən cəhd et
          </button>
        </div>
      )}

      {/* Boş */}
      {!loading && !error && items.length === 0 && (
        <div className="np-state-center">
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#475569"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <p className="np-state-text">Hələ heç bir bildiriş yoxdur</p>
        </div>
      )}

      {/* Siyahı */}
      {!loading && !error && items.length > 0 && (
        <div className="np-list-container">
          {items.map(item => {
            const seviyye: BildirisSeviyye = item.seviyye || 'adi';
            const dateDisplay = formatNotifyDate(item.tarix || item.created_at);
            const itemSenderId = getItemSenderId(item);
            const canDelete = isAdmin && Boolean(currentUserId && itemSenderId && String(itemSenderId) === String(currentUserId));

            return (
              <div key={item.id} className={`np-item np-item--${seviyye}`}>
                <div className="np-item-icon">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>

                <div className="np-item-body">
                  <div className="np-item-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="np-item-sender">{getSenderName(item.gonderen)}</span>
                      <span className={`np-item-badge np-badge--${seviyye}`}>
                        {getSeviyyeLabel(seviyye)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {dateDisplay && <span className="np-item-time" style={{ marginTop: 0 }}>{dateDisplay}</span>}
                      {canDelete && (
                        <button
                          type="button"
                          className="np-delete-btn"
                          title="Bu bildirişi sil"
                          onClick={(e) => handleDeleteBildiris(item, e)}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="np-item-msg">{item.mesaj}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}

