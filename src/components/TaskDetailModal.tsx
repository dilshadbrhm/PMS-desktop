import { useState, useEffect, useCallback } from 'react';
import {
  updateTaskStatus,
  type Task,
  type DeadlineInfo,
  TaskStatus,
} from '../api/client';
import './TaskDetailModal.css';

interface Props {
  task: Task;
  projectId: number;
  onClose: () => void;
  onStatusChanged: () => void; // board-u yenilə
}

// ─── Deadline köməkçiləri ─────────────────────────────────────────────────────

function parseDeadline(raw: Task['deadline'] | DeadlineInfo | null | undefined): DeadlineInfo | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as DeadlineInfo;
  return {
    seviyye: 'normal',
    kecenFaiz: 0,
    qalanFaiz: 100,
    qalanGun: 0,
    kilidli: false,
    start_at: null,
    end_at: raw as string,
  };
}

function dlClass(seviyye: DeadlineInfo['seviyye']): string {
  const m: Record<string, string> = {
    normal: 'dl-normal', sari: 'dl-sari', qirmizi: 'dl-qirmizi',
    kecib: 'dl-kecib', 'teyin-olunmayib': 'dl-yox',
  };
  return m[seviyye] ?? 'dl-yox';
}

function dlLabel(seviyye: DeadlineInfo['seviyye']): string {
  const m: Record<string, string> = {
    normal: 'Normal', sari: 'Tezliklə', qirmizi: 'Kritik',
    kecib: 'Keçib', 'teyin-olunmayib': 'Təyin edilməyib',
  };
  return m[seviyye] ?? 'Məlum deyil';
}

const fmtDate = (s?: string | null) => {
  if (!s) return null;
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('az-AZ', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return s; }
};

// ─── DeadlineChip ─────────────────────────────────────────────────────────────

function DeadlineChip({ dl }: { dl: DeadlineInfo }) {
  const cls = dlClass(dl.seviyye);
  const label = dlLabel(dl.seviyye);

  if (dl.seviyye === 'teyin-olunmayib') {
    return <span className={`tdm-dl-chip ${cls}`}>{label}</span>;
  }

  return (
    <div className="tdm-dl-wrap">
      <span className={`tdm-dl-chip ${cls}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        {dl.seviyye === 'kecib' ? label : `${label} · ${dl.qalanGun} gün qalıb`}
        {dl.kilidli && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" title="Kilidli">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
      </span>

      {dl.seviyye !== 'kecib' && (
        <>
          <div className="tdm-dl-bar-wrap">
            <div
              className={`tdm-dl-bar-fill ${cls}`}
              style={{ width: `${Math.min(100, dl.kecenFaiz)}%` }}
            />
          </div>
          <div className="tdm-dl-faiz-row">
            <span className="tdm-dl-faiz-text">{Math.round(dl.kecenFaiz)}% keçib</span>
            <span className="tdm-dl-faiz-text">{Math.round(dl.qalanFaiz)}% qalıb</span>
          </div>
        </>
      )}

      {dl.start_at && (
        <div className="tdm-dl-dates">
          <span>Başlama: {fmtDate(dl.start_at)}</span>
          {dl.end_at && <span>Bitmə: {fmtDate(dl.end_at)}</span>}
        </div>
      )}
      {!dl.start_at && dl.end_at && (
        <div className="tdm-dl-dates">
          <span>Son tarix: {fmtDate(dl.end_at)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Status düymələri konfiqurasiyası ─────────────────────────────────────────

const STATUS_BTNS = [
  { status: TaskStatus.Aciq,   label: 'Açıq',   cls: 'sb-aciq'   },
  { status: TaskStatus.Icrada, label: 'İcrada',  cls: 'sb-icrada' },
  { status: TaskStatus.Bitib,  label: 'Bitib',   cls: 'sb-bitib'  },
] as const;

// ─── Ceki ─────────────────────────────────────────────────────────────────────

function CekiBadge({ ceki }: { ceki?: number | null }) {
  if (!ceki) return null;
  return (
    <span className="tdm-ceki" title={`Çəki: ${ceki}/5`}>
      {'★'.repeat(Math.min(ceki, 5))}{'☆'.repeat(Math.max(0, 5 - ceki))}
      <span className="tdm-ceki-num"> {ceki}/5</span>
    </span>
  );
}

// ─── Modal komponenti ─────────────────────────────────────────────────────────

export default function TaskDetailModal({ task, projectId, onClose, onStatusChanged }: Props) {
  const [saving, setSaving]     = useState(false);
  const [apiError, setApiError] = useState('');

  const dl = parseDeadline(task.deadlineVeziyyeti ?? task.deadline);
  const currentStatus = Number(task.status);
  const assigneeName  = task.assignee?.name ?? null;

  // Escape düyməsi ilə bağla
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Scroll kilidlə
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleStatusChange = async (newStatus: number) => {
    if (newStatus === currentStatus) return; // heç nə dəyişmir
    setSaving(true);
    setApiError('');
    try {
      await updateTaskStatus(projectId, task.id, newStatus);
      onStatusChanged(); // board-u yenilə
      onClose();         // modalı bağla
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status dəyişdirilmədi';
      setApiError(msg);
      console.error('[TaskDetailModal] Status xətası:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="tdm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={task.title}
    >
      {/* Karta klik keçməsin */}
      <div
        className="tdm-card"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Başlıq sətri ─────────────────────────────── */}
        <div className="tdm-top">
          <div className="tdm-id-badge">#{task.id}</div>
          <button
            className="tdm-close-btn"
            onClick={onClose}
            aria-label="Bağla"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <h2 className="tdm-title">{task.title}</h2>

        {/* ── Açıqlama ─────────────────────────────────── */}
        {task.description ? (
          <p className="tdm-desc">{task.description}</p>
        ) : (
          <p className="tdm-desc tdm-desc--empty">Açıqlama qeyd edilməyib.</p>
        )}

        <div className="tdm-divider" />

        {/* ── Metadata grid ────────────────────────────── */}
        <div className="tdm-meta-grid">

          {/* Assignee */}
          <div className="tdm-meta-row">
            <span className="tdm-meta-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              Təyin olunan
            </span>
            <span className={`tdm-meta-val ${!assigneeName ? 'tdm-meta-empty' : ''}`}>
              {assigneeName ?? 'Təyin edilməyib'}
            </span>
          </div>

          {/* Çəki */}
          {task.ceki != null && (
            <div className="tdm-meta-row">
              <span className="tdm-meta-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Çəki
              </span>
              <CekiBadge ceki={task.ceki} />
            </div>
          )}

          {/* Başlama tarixi */}
          {task.start_at && (
            <div className="tdm-meta-row">
              <span className="tdm-meta-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Başlama
              </span>
              <span className="tdm-meta-val">{fmtDate(task.start_at)}</span>
            </div>
          )}

          {/* Yaradılma tarixi */}
          {task.created_at && (
            <div className="tdm-meta-row">
              <span className="tdm-meta-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                Yaradılıb
              </span>
              <span className="tdm-meta-val">{fmtDate(task.created_at)}</span>
            </div>
          )}
        </div>

        {/* ── Deadline ─────────────────────────────────── */}
        {dl && (
          <div className="tdm-section">
            <p className="tdm-section-title">Deadline</p>
            <DeadlineChip dl={dl} />
          </div>
        )}

        <div className="tdm-divider" />

        {/* ── Status dəyişmə ───────────────────────────── */}
        <div className="tdm-section">
          <p className="tdm-section-title">Status dəyiş</p>
          <div className="tdm-status-row">
            {STATUS_BTNS.map(btn => {
              const isActive = currentStatus === btn.status;
              return (
                <button
                  key={btn.status}
                  className={`tdm-status-btn ${btn.cls} ${isActive ? 'tdm-status-btn--active' : ''}`}
                  onClick={() => handleStatusChange(btn.status)}
                  disabled={saving || isActive}
                  title={isActive ? 'Cari status' : `${btn.label} kimi işarələ`}
                >
                  {isActive && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Xəta mesajı */}
          {apiError && (
            <div className="tdm-api-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {apiError}
            </div>
          )}

          {/* Saving indicator */}
          {saving && (
            <div className="tdm-saving">
              <span className="tdm-saving-spinner" />
              Status dəyişdirilir...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
