import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getIstifadeciler,
  getSobeler,
  createSobe,
  updateUserSobe,
  type NotifyUser,
  type SobeItem,
} from '../api/notifyClient';
import { onPresenceUpdated } from '../api/notifySocket';
import './AdminPanel.css';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Giriş olmayıb';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('az-AZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function AdminPanel(): React.ReactElement {
  const [users, setUsers] = useState<NotifyUser[]>([]);
  const [sobeler, setSobeler] = useState<SobeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Şöbə yaratma
  const [newSobeAd, setNewSobeAd] = useState<string>('');
  const [creatingSobe, setCreatingSobe] = useState<boolean>(false);

  // Süzgəclər
  const [selectedSobeFilter, setSelectedSobeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Şöbə təyin etmə modalı
  const [editingUser, setEditingUser] = useState<NotifyUser | null>(null);
  const [selectedSobeIds, setSelectedSobeIds] = useState<string[]>([]);
  const [savingSobe, setSavingSobe] = useState<boolean>(false);

  // Məlumatları yüklə
  const loadData = useCallback(async (silence = false) => {
    if (!silence) setLoading(true);
    setError('');
    try {
      const [usersData, sobelerData] = await Promise.all([
        getIstifadeciler(),
        getSobeler(),
      ]);
      setUsers(usersData || []);
      setSobeler(sobelerData || []);
    } catch (err: unknown) {
      console.error('[AdminPanel] Məlumat yüklənmə xətası:', err);
      if (!silence) {
        setError(err instanceof Error ? err.message : 'Məlumatları yükləmək mümkün olmadı');
      }
    } finally {
      if (!silence) setLoading(false);
    }
  }, []);

  // İlkin yükləmə və dinləyicilər
  useEffect(() => {
    loadData();

    // Real-time onlayn status yenilənməsi
    const unsubPresence = onPresenceUpdated((onlineUsers) => {
      console.log('[AdminPanel] Real-time presence yeniləndi:', onlineUsers);
      const onlineIdSet = new Set(onlineUsers.map(u => String(u.id)));

      setUsers(prevUsers =>
        prevUsers.map(u => ({
          ...u,
          isOnline: onlineIdSet.has(String(u.id)),
        }))
      );
    });

    // Hər 10 saniyədən bir fon yenilənməsi
    const intervalId = setInterval(() => {
      loadData(true);
    }, 10000);

    return () => {
      unsubPresence();
      clearInterval(intervalId);
    };
  }, [loadData]);

  // Yeni şöbə yarat
  const handleCreateSobe = async (e: React.FormEvent) => {
    e.preventDefault();
    const ad = newSobeAd.trim();
    if (!ad || creatingSobe) return;

    setCreatingSobe(true);
    try {
      const created = await createSobe(ad);
      console.log('[AdminPanel] Şöbə yaradıldı:', created);
      setNewSobeAd('');
      // Şöbələri yenilə
      const updatedSobeler = await getSobeler();
      setSobeler(updatedSobeler);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Şöbə yaradılarkən xəta baş verdi');
    } finally {
      setCreatingSobe(false);
    }
  };

  // Şöbə təyin etmə modalını aç
  const handleOpenAssignModal = (user: NotifyUser) => {
    setEditingUser(user);
    const userSobeIds = (user.sobeler || []).map(s => String(s.id));
    setSelectedSobeIds(userSobeIds);
  };

  // Checkbox dəyişməsi
  const handleToggleSobeCheckbox = (sobeId: string) => {
    setSelectedSobeIds(prev =>
      prev.includes(sobeId)
        ? prev.filter(id => id !== sobeId)
        : [...prev, sobeId]
    );
  };

  // Şöbə təyinini yadda saxla
  const handleSaveUserSobe = async () => {
    if (!editingUser || savingSobe) return;
    setSavingSobe(true);
    try {
      await updateUserSobe(editingUser.id, selectedSobeIds);
      console.log('[AdminPanel] İstifadəçi şöbələri yeniləndi:', editingUser.id);
      setEditingUser(null);
      // Məlumatları dərhal təzələ
      loadData(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Şöbə təyin edilərkən xəta baş verdi');
    } finally {
      setSavingSobe(false);
    }
  };

  // Süzgəcdən keçmiş istifadəçilər
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Şöbə süzgəci
      if (selectedSobeFilter) {
        const belongs = (user.sobeler || []).some(s => String(s.id) === selectedSobeFilter);
        if (!belongs) return false;
      }
      // Axtarış süzgəci
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const adMatch = (user.adSoyad || user.name || '').toLowerCase().includes(q);
        const idMatch = String(user.id).includes(q);
        if (!adMatch && !idMatch) return false;
      }
      return true;
    });
  }, [users, selectedSobeFilter, searchQuery]);

  const onlineCount = useMemo(() => users.filter(u => u.isOnline).length, [users]);

  return (
    <div className="ap-root">
      {/* ── 1. ÜST BLOK: YENİ ŞÖBƏ & STATİSTİKA ── */}
      <div className="ap-top-card">
        <form className="ap-sobe-creator" onSubmit={handleCreateSobe}>
          <input
            type="text"
            className="ap-input"
            placeholder="Yeni şöbə adı yazın..."
            value={newSobeAd}
            onChange={e => setNewSobeAd(e.target.value)}
            disabled={creatingSobe}
          />
          <button
            type="submit"
            className="ap-btn-primary"
            disabled={!newSobeAd.trim() || creatingSobe}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {creatingSobe ? 'Yaradılır...' : 'Şöbə Yarat'}
          </button>
        </form>

        <div className="ap-stats-badge">
          <div className="ap-stat-pill">
            <span>Cəmi İstifadəçi:</span>
            <span className="ap-stat-val">{users.length}</span>
          </div>
          <div className="ap-stat-pill">
            <span style={{ color: '#10b981', fontWeight: 600 }}>● Onlayn:</span>
            <span className="ap-stat-val">{onlineCount}</span>
          </div>
          <div className="ap-stat-pill">
            <span>Şöbələr:</span>
            <span className="ap-stat-val">{sobeler.length}</span>
          </div>
        </div>
      </div>

      {/* ── 2. ŞÖBƏLƏR TABS / FILTER ── */}
      <div className="ap-sobe-tabs">
        <button
          type="button"
          className={`ap-sobe-tab ${selectedSobeFilter === null ? 'ap-sobe-tab--active' : ''}`}
          onClick={() => setSelectedSobeFilter(null)}
        >
          <span>Bütün İstifadəçilər</span>
          <span className="ap-sobe-count">{users.length}</span>
        </button>

        {sobeler.map(sobe => (
          <button
            key={sobe.id}
            type="button"
            className={`ap-sobe-tab ${selectedSobeFilter === String(sobe.id) ? 'ap-sobe-tab--active' : ''}`}
            onClick={() => setSelectedSobeFilter(String(sobe.id))}
          >
            <span>{sobe.ad}</span>
            <span className="ap-sobe-count">{sobe.uzvSayi ?? sobe.memberCount ?? 0}</span>
          </button>
        ))}
      </div>

      {/* ── 3. AXTARIŞ VƏ İSTİFADƏÇİLƏR CƏDVƏLİ ── */}
      <div className="ap-table-card">
        <div className="ap-table-toolbar">
          <div className="ap-search-wrap">
            <svg className="ap-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="ap-search-input"
              placeholder="İstifadəçi axtar..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <span style={{ color: '#64748b', fontSize: '12.5px' }}>
            Tapıldı: <strong style={{ color: '#cbd5e1' }}>{filteredUsers.length}</strong> nəfər
          </span>
        </div>

        {loading && users.length === 0 ? (
          <div className="ap-empty-state">İstifadəçilər yüklənir...</div>
        ) : error ? (
          <div className="ap-empty-state" style={{ color: '#f87171' }}>{error}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="ap-empty-state">Heç bir istifadəçi tapılmadı</div>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>İstifadəçi</th>
                  <th>Rol</th>
                  <th>Şöbə(lər)</th>
                  <th>Son Giriş Tarixi</th>
                  <th style={{ textAlign: 'right' }}>Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const displayName = user.adSoyad || user.name || `İstifadəçi #${user.id}`;
                  const initial = displayName.charAt(0).toUpperCase();
                  const roleStr = String(user.rol || user.role || 'USER').toUpperCase();
                  const badgeClass =
                    roleStr === 'SUPERADMIN'
                      ? 'ap-badge--superadmin'
                      : roleStr === 'ADMIN'
                      ? 'ap-badge--admin'
                      : 'ap-badge--user';

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="ap-user-col">
                          <div className="ap-avatar-dot-wrap">
                            <div className="ap-avatar">{initial}</div>
                            <span
                              className={`ap-status-dot ${
                                user.isOnline ? 'ap-status-dot--online' : 'ap-status-dot--offline'
                              }`}
                              title={user.isOnline ? 'Onlayn' : 'Oflayn'}
                            />
                          </div>
                          <div className="ap-user-info">
                            <span className="ap-user-name">{displayName}</span>
                            <span className="ap-user-meta">ID: {user.id}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`ap-badge ${badgeClass}`}>{roleStr}</span>
                      </td>

                      <td>
                        {user.sobeler && user.sobeler.length > 0 ? (
                          <div className="ap-sobe-tags">
                            {user.sobeler.map(s => (
                              <span key={s.id} className="ap-sobe-pill">
                                {s.ad}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="ap-empty-pill">Şöbə yoxdur</span>
                        )}
                      </td>

                      <td>{formatDate(user.sonGirisTarixi)}</td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="ap-btn-assign"
                          onClick={() => handleOpenAssignModal(user)}
                          title="Şöbə təyin et"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          Şöbə təyin et
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 4. MODAL: ŞÖBƏ TƏYİN ETMƏ ── */}
      {editingUser && (
        <div className="ap-modal-backdrop" onClick={() => setEditingUser(null)}>
          <div className="ap-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <div>
                <h3 className="ap-modal-title">Şöbə Təyin Et</h3>
                <p className="ap-modal-subtitle">
                  {editingUser.adSoyad || editingUser.name} (ID: {editingUser.id})
                </p>
              </div>
              <button
                type="button"
                className="ap-modal-close"
                onClick={() => setEditingUser(null)}
              >
                ✕
              </button>
            </div>

            <div className="ap-sobe-checkbox-list">
              {sobeler.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '13px', padding: '10px' }}>
                  Hələ heç bir şöbə yaradılmayıb. Əvvəlcə yuxarıdan şöbə yaradın.
                </div>
              ) : (
                sobeler.map(sobe => {
                  const isChecked = selectedSobeIds.includes(String(sobe.id));
                  return (
                    <label
                      key={sobe.id}
                      className={`ap-sobe-checkbox-item ${isChecked ? 'ap-sobe-checkbox-item--checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="ap-checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSobeCheckbox(String(sobe.id))}
                      />
                      <span className="ap-checkbox-label">{sobe.ad}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="ap-modal-footer">
              <button
                type="button"
                className="ap-btn-secondary"
                onClick={() => setEditingUser(null)}
                disabled={savingSobe}
              >
                Ləğv et
              </button>
              <button
                type="button"
                className="ap-btn-primary"
                onClick={handleSaveUserSobe}
                disabled={savingSobe}
              >
                {savingSobe ? 'Yadda saxlanılır...' : 'Yadda saxla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
