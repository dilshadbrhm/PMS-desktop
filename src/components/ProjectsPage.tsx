import { useState, useEffect, useCallback } from 'react';
import { getProjects, type Project, type DeadlineInfo } from '../api/client';
import './ProjectsPage.css';

interface Props {
  onBack: () => void;
  onSelectProject: (projectId: number) => void;
}

// ─── Deadline köməkçiləri ──────────────────────────────────────────────────────

/** Backend-dən gələn deadline field-ini DeadlineInfo kimi qaytarır (köhnə string formatla da işləyir) */
function parseDeadline(raw: Project['deadline']): DeadlineInfo | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as DeadlineInfo;
  // Köhnə API: sadə tarix stringi gəlirsə minimal obyekt qaytar
  return {
    seviyye: 'normal',
    kecenFaiz: 0,
    qalanFaiz: 100,
    qalanGun: 0,
    kilidli: false,
    start_at: null,
    end_at: raw,
  };
}

/** Seviyye-yə görə CSS class adını qaytarır */
function deadlineSeviyyeClass(seviyye: DeadlineInfo['seviyye']): string {
  switch (seviyye) {
    case 'normal':           return 'dl-normal';
    case 'sari':             return 'dl-sari';
    case 'qirmizi':          return 'dl-qirmizi';
    case 'kecib':            return 'dl-kecib';
    case 'teyin-olunmayib':  return 'dl-yox';
    default:                 return 'dl-yox';
  }
}

/** Seviyye-yə görə oxunaqlı etiket */
function deadlineSeviyyeLabel(seviyye: DeadlineInfo['seviyye']): string {
  switch (seviyye) {
    case 'normal':           return 'Normal';
    case 'sari':             return 'Tezliklə';
    case 'qirmizi':          return 'Kritik';
    case 'kecib':            return 'Keçib';
    case 'teyin-olunmayib':  return 'Təyin edilməyib';
    default:                 return 'Məlum deyil';
  }
}

// ─── Tarix köməkçisi ───────────────────────────────────────────────────────────

const formatDate = (dateStr?: string | null): string | null => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('az-AZ', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

// ─── Status köməkçisi ──────────────────────────────────────────────────────────

const isProjectOpen = (status?: number | string): boolean => {
  if (status === 0 || status === '0' || status === 'closed' || status === 'BAGLI') return false;
  return true; // default açıq
};

// ─── DeadlineChip komponenti ───────────────────────────────────────────────────

function DeadlineChip({ dl }: { dl: DeadlineInfo }) {
  const cls = deadlineSeviyyeClass(dl.seviyye);
  const label = deadlineSeviyyeLabel(dl.seviyye);

  if (dl.seviyye === 'teyin-olunmayib') {
    return (
      <div className={`pp-deadline-chip ${cls}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{label}</span>
      </div>
    );
  }

  const endLabel = formatDate(dl.end_at);

  return (
    <div className={`pp-deadline-wrap`}>
      {/* Badge: seviyye + qalan gün */}
      <div className={`pp-deadline-chip ${cls}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>
          {dl.seviyye === 'kecib'
            ? label
            : `${label} · ${dl.qalanGun} gün`}
        </span>
        {dl.kilidli && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" title="Kilidli">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
      </div>

      {/* Progress bar */}
      {dl.seviyye !== 'kecib' && (
        <div className="pp-deadline-bar-wrap" title={`${Math.round(dl.kecenFaiz)}% keçib`}>
          <div
            className={`pp-deadline-bar-fill ${cls}`}
            style={{ width: `${Math.min(100, dl.kecenFaiz)}%` }}
          />
        </div>
      )}

      {/* Bitmə tarixi */}
      {endLabel && (
        <span className="pp-deadline-date">{endLabel}</span>
      )}
    </div>
  );
}

// ─── Əsas komponent ────────────────────────────────────────────────────────────

export default function ProjectsPage({ onBack, onSelectProject }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err: unknown) {
      console.error('[Projects] Layihələri yükləyərkən xəta:', err);
      const msg = err instanceof Error ? err.message : 'Layihələri yükləmək mümkün olmadı';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="pp-root">
      {/* Arxa fon dekorativ blob-ları */}
      <div className="pp-blob pp-blob--1" />
      <div className="pp-blob pp-blob--2" />

      {/* Header bar */}
      <header className="pp-header">
        <div className="pp-header-left">
          <button className="pp-back-btn" onClick={onBack} title="Dashboard-a qayıt">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Dashboard
          </button>
          <div className="pp-title-wrap">
            <h1 className="pp-title">Layihələrim</h1>
            {!loading && !error && (
              <span className="pp-count-badge">{projects.length} layihə</span>
            )}
          </div>
        </div>

        <div className="pp-header-right">
          <button
            className="pp-refresh-btn"
            onClick={fetchProjects}
            disabled={loading}
            title="Siyahını yenilə"
          >
            <svg
              className={loading ? 'pp-spin' : ''}
              width="16"
              height="16"
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

      {/* Əsas məzmun */}
      <main className="pp-content">
        {loading && (
          <div className="pp-state-container">
            <div className="pp-spinner" />
            <p className="pp-state-text">Layihələr yüklənir...</p>
          </div>
        )}

        {!loading && error && (
          <div className="pp-state-container pp-error-box">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3 className="pp-error-title">Xəta baş verdi</h3>
            <p className="pp-error-msg">{error}</p>
            <button className="pp-retry-btn" onClick={fetchProjects}>
              Yenidən cəhd et
            </button>
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="pp-state-container pp-empty-box">
            <div className="pp-empty-icon">📂</div>
            <h3>Hələ heç bir layihə tapılmadı</h3>
            <p>Sizə təyin edilmiş və ya yaratdığınız layihələr burada görünəcək.</p>
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div className="pp-grid">
            {projects.map(project => {
              const open = isProjectOpen(project.status);
              // deadline: ya mürəkkəb obyekt, ya string, ya null
              const dl = parseDeadline(project.deadline);

              return (
                <div
                  key={project.id}
                  className="pp-card"
                  onClick={() => onSelectProject(project.id)}
                  style={{ cursor: 'pointer' }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onSelectProject(project.id)}
                >
                  <div className="pp-card-top">
                    <div className="pp-card-title-group">
                      <h3 className="pp-card-name">{project.name}</h3>
                      {project.menimRolum && (
                        <span className="pp-role-badge">{project.menimRolum}</span>
                      )}
                    </div>
                    <span className={`pp-status-badge ${open ? 'pp-status--open' : 'pp-status--closed'}`}>
                      {open ? 'Açıq' : 'Bağlı'}
                    </span>
                  </div>

                  <p className="pp-card-desc">
                    {project.description || 'Təsvir qeyd edilməyib.'}
                  </p>

                  <div className="pp-card-footer">
                    <div className="pp-meta-item" title="Tapşırıq sayı">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <span>{project.taskSayi ?? 0} task</span>
                    </div>

                    <div className="pp-meta-item" title="Üzv sayı">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <span>{project.uzvSayi ?? 0} üzv</span>
                    </div>

                    {/* Deadline: mürəkkəb DeadlineChip komponenti ilə render edilir */}
                    {dl && (
                      <div className="pp-meta-item pp-meta-deadline">
                        <DeadlineChip dl={dl} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
