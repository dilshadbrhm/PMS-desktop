import { useState, useEffect, useCallback, useRef } from 'react';
import { searchUsers, addMember, type SearchedUser } from '../api/client';
import './AddMemberModal.css';

interface Props {
  projectId: number;
  existingMemberIds: Set<number>;
  onClose: () => void;
  onMemberAdded: () => void;
}

const ROLES: { id: 2 | 3 | 4; label: string; desc: string }[] = [
  { id: 2, label: 'Menecer', desc: 'Bütün tapşırıqları və üzvləri idarə edir' },
  { id: 3, label: 'İstifadəçi', desc: 'Tapşırıq icraçısı (özünə təyin edə bilər)' },
  { id: 4, label: 'Ghost', desc: 'Yalnız izləyici (oxuma hüququ)' },
];

export default function AddMemberModal({
  projectId,
  existingMemberIds,
  onClose,
  onMemberAdded,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<2 | 3 | 4>(3);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [searchedOnce, setSearchedOnce] = useState(false);

  const debounceTimer = useRef<any>(null);

  // Modal ESC ilə bağlanma
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // Axtarış funksiyası
  const doSearch = useCallback(
    async (searchTerm: string) => {
      setSearching(true);
      setError('');
      try {
        const list = await searchUsers(projectId, searchTerm);
        setResults(list);
        setSearchedOnce(true);
      } catch (err: unknown) {
        console.error('[AddMemberModal] Axtarış xətası:', err);
        setError(err instanceof Error ? err.message : 'İstifadəçiləri axtararkən xəta baş verdi');
      } finally {
        setSearching(false);
      }
    },
    [projectId]
  );

  // İlkin yükləmədə (və ya boş qaldıqda) bütün/tövsiyə olunan istifadəçiləri gətir
  useEffect(() => {
    doSearch('');
  }, [doSearch]);

  // Input dəyişəndə 300ms debounce ilə axtar
  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      doSearch(val);
    }, 300);
  };

  // Üzv əlavə et
  const handleAdd = async (user: SearchedUser) => {
    const uId = Number(user.id ?? user.userId);
    if (!uId) return;

    setAddingId(uId);
    setError('');
    try {
      const res = await addMember(projectId, uId, selectedRole);
      console.log('[AddMember] addMember cavabı:', res);
      setAddedIds(prev => new Set(prev).add(uId));
      onMemberAdded(); // Valideyn komponentdə layihə məlumatlarını yenilə
      // Axtarışı dərhal təkrar çağıraraq siyahını da yenilə
      await doSearch(query);
    } catch (err: unknown) {
      console.error('[AddMemberModal] Əlavə etmə xətası:', err);
      setError(err instanceof Error ? err.message : 'Üzv əlavə edilərkən xəta baş verdi');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="amm-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="amm-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="amm-header">
          <div className="amm-title-wrap">
            <div className="amm-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <div>
              <h2 className="amm-title">Layihəyə Üzv Əlavə Et</h2>
              <p className="amm-subtitle">İstifadəçini axtarın və uyğun rol ilə layihəyə qoşun</p>
            </div>
          </div>
          <button className="amm-close-btn" onClick={onClose} title="Bağla">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Xəta banneri */}
        {error && (
          <div className="amm-error-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Rol Seçimi */}
        <div className="amm-section">
          <label className="amm-label">Təyin ediləcək rol:</label>
          <div className="amm-roles-grid">
            {ROLES.map(r => {
              const active = selectedRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`amm-role-btn ${active ? 'amm-role-btn--active' : ''}`}
                  onClick={() => setSelectedRole(r.id)}
                >
                  <div className="amm-role-top">
                    <span className="amm-role-name">{r.label}</span>
                    <span className="amm-role-id">Rol {r.id}</span>
                  </div>
                  <span className="amm-role-desc">{r.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Axtarış Qutusu */}
        <div className="amm-section">
          <label className="amm-label" htmlFor="amm-search-input">
            İstifadəçi axtar:
          </label>
          <div className="amm-search-wrap">
            <svg className="amm-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="amm-search-input"
              type="text"
              className="amm-search-input"
              placeholder="Ad, soyad və ya istifadəçi adı ilə axtarın..."
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              autoFocus
            />
            {searching && <div className="amm-mini-spinner" />}
          </div>
        </div>

        {/* Nəticələr siyahısı */}
        <div className="amm-results-section">
          <label className="amm-label">
            Tapılan istifadəçilər ({results.length}):
          </label>

          <div className="amm-results-list">
            {searching && results.length === 0 ? (
              <div className="amm-empty-state">
                <div className="amm-mini-spinner" />
                <span>İstifadəçilər axtarılır...</span>
              </div>
            ) : results.length === 0 && searchedOnce ? (
              <div className="amm-empty-state">
                <span>Uyğun istifadəçi tapılmadı</span>
              </div>
            ) : (
              results.map(u => {
                const uId = Number(u.id ?? u.userId);
                const isAlreadyMember = existingMemberIds.has(uId);
                const isJustAdded = addedIds.has(uId);
                const isCurrentAdding = addingId === uId;

                const displayName =
                  u.name ||
                  (u.ad && u.soyad ? `${u.ad} ${u.soyad}` : (u.ad || u.username || 'İstifadəçi'));

                return (
                  <div key={uId} className="amm-user-row">
                    <div className="amm-user-info">
                      <div className="amm-user-avatar">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="amm-user-texts">
                        <span className="amm-user-name">{displayName}</span>
                        <div className="amm-user-sub">
                          {u.username && <span className="amm-user-uname">@{u.username}</span>}
                          {u.email && <span className="amm-user-email">· {u.email}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="amm-user-actions">
                      {isJustAdded ? (
                        <span className="amm-badge amm-badge--success">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Əlavə olundu
                        </span>
                      ) : isAlreadyMember ? (
                        <span className="amm-badge amm-badge--exists">
                          Artıq üzvdür
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="amm-add-btn"
                          onClick={() => handleAdd(u)}
                          disabled={isCurrentAdding}
                        >
                          {isCurrentAdding ? (
                            <div className="amm-btn-spinner" />
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                              </svg>
                              Əlavə et
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="amm-footer">
          <button type="button" className="amm-close-action-btn" onClick={onClose}>
            Tamamla / Bağla
          </button>
        </div>
      </div>
    </div>
  );
}
