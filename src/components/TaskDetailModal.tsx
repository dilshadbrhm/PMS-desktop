import { useState, useEffect, useCallback } from 'react';
import {
  updateTaskStatus,
  updateTask,
  deleteTask,
  type Task,
  type DeadlineInfo,
  TaskStatus,
} from '../api/client';
import './TaskDetailModal.css';

interface MemberOption {
  userId: number;
  name: string;
}

interface Props {
  task: Task;
  projectId: number;
  userRole?: string | number | null;
  isManager?: boolean;
  members?: MemberOption[];
  onClose: () => void;
  onStatusChanged: () => void; // board-u yenilə
}

function checkIsManagerRole(role?: string | number | null): boolean {
  if (role === null || role === undefined || role === '') return false;
  if (role === 2 || role === 1 || role === '2' || role === '1') return true;
  const r = String(role).trim().toLowerCase();
  return (
    r === '2' ||
    r === '1' ||
    r.includes('men') ||
    r.includes('man') ||
    r.includes('admin') ||
    r.includes('rehber') ||
    r.includes('rəhbər') ||
    r.includes('owner') ||
    r.includes('sahib')
  );
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

const toDateInputVal = (s?: string | null) => {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
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

export default function TaskDetailModal({
  task,
  projectId,
  userRole,
  isManager: isManagerProp,
  members = [],
  onClose,
  onStatusChanged,
}: Props) {
  const [currentTask, setCurrentTask] = useState<Task>(task);
  const [saving, setSaving]           = useState(false);
  const [apiError, setApiError]       = useState('');

  // Menecer hüququ yoxlanışı
  const isManager = isManagerProp ?? checkIsManagerRole(userRole);

  // Redaktə rejimi state-ləri
  const [isEditing, setIsEditing]           = useState(false);
  const [editTitle, setEditTitle]           = useState(currentTask.title || '');
  const [editDesc, setEditDesc]             = useState(currentTask.description || '');
  const [editAssigneeId, setEditAssigneeId] = useState<number | ''>(
    currentTask.assignee?.id ?? currentTask.assignee_id ?? ''
  );
  const [editDeadline, setEditDeadline]     = useState<string>(() => {
    const rawDl = currentTask.deadlineVeziyyeti?.end_at || currentTask.deadline;
    return typeof rawDl === 'string' ? toDateInputVal(rawDl) : (rawDl?.end_at ? toDateInputVal(rawDl.end_at) : '');
  });
  const [editStartAt, setEditStartAt]       = useState<string>(() => {
    const rawSt = currentTask.deadlineVeziyyeti?.start_at || currentTask.start_at;
    return rawSt ? toDateInputVal(rawSt) : '';
  });
  const [editCeki, setEditCeki]             = useState<number>(Number(currentTask.ceki) || 1);

  // Silmə təsdiq pəncərəsi
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]                   = useState(false);

  // Task dəyişəndə sinxronlaşdır
  useEffect(() => {
    setCurrentTask(task);
  }, [task]);

  const dl = parseDeadline(currentTask.deadlineVeziyyeti ?? currentTask.deadline);
  const currentStatus = Number(currentTask.status);
  const assigneeName  = currentTask.assignee?.name ?? null;

  // Escape düyməsi ilə bağla
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
      } else if (isEditing) {
        setIsEditing(false);
      } else {
        onClose();
      }
    }
  }, [onClose, isEditing, showDeleteConfirm]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleStatusChange = async (newStatus: number) => {
    if (newStatus === currentStatus) return;
    setSaving(true);
    setApiError('');
    try {
      await updateTaskStatus(projectId, currentTask.id, newStatus);
      onStatusChanged();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status dəyişdirilmədi';
      setApiError(msg);
      console.error('[TaskDetailModal] Status xətası:', err);
    } finally {
      setSaving(false);
    }
  };

  // Redaktəni başlat
  const handleStartEdit = () => {
    setApiError('');
    setEditTitle(currentTask.title || '');
    setEditDesc(currentTask.description || '');
    setEditAssigneeId(currentTask.assignee?.id ?? currentTask.assignee_id ?? '');
    const rawDl = currentTask.deadlineVeziyyeti?.end_at || currentTask.deadline;
    setEditDeadline(typeof rawDl === 'string' ? toDateInputVal(rawDl) : (rawDl?.end_at ? toDateInputVal(rawDl.end_at) : ''));
    const rawSt = currentTask.deadlineVeziyyeti?.start_at || currentTask.start_at;
    setEditStartAt(rawSt ? toDateInputVal(rawSt) : '');
    setEditCeki(Number(currentTask.ceki) || 1);
    setIsEditing(true);
  };

  // Redaktəni ləğv et
  const handleCancelEdit = () => {
    setIsEditing(false);
    setApiError('');
  };

  // Redaktəni yadda saxla
  const handleSaveEdit = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setApiError('Başlıq boş ola bilməz');
      return;
    }

    setSaving(true);
    setApiError('');
    try {
      const updated = await updateTask(projectId, currentTask.id, {
        title: trimmed,
        description: editDesc.trim() || null,
        assigneeId: editAssigneeId !== '' ? Number(editAssigneeId) : null,
        deadline: editDeadline ? new Date(editDeadline).toISOString() : null,
        start_at: editStartAt ? new Date(editStartAt).toISOString() : null,
        ceki: Number(editCeki) || null,
      });

      // Tapşırığı yenilənmiş məlumatla əvəzlə
      setCurrentTask(prev => ({
        ...prev,
        ...updated,
        title: trimmed,
        description: editDesc.trim() || null,
        ceki: Number(editCeki) || null,
        assignee: editAssigneeId !== '' 
          ? members.find(m => m.userId === Number(editAssigneeId)) 
            ? { id: Number(editAssigneeId), name: members.find(m => m.userId === Number(editAssigneeId))!.name }
            : prev.assignee
          : null,
      }));

      setIsEditing(false);
      onStatusChanged(); // Kanban board yenilənsin
    } catch (err: unknown) {
      console.error('[TaskDetailModal] updateTask xətası:', err);
      const msg = err instanceof Error ? err.message : 'Dəyişiklikləri yadda saxlamaq mümkün olmadı';
      setApiError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Silmə əməliyyatı
  const handleDeleteTask = async () => {
    setDeleting(true);
    setApiError('');
    try {
      await deleteTask(projectId, currentTask.id);
      onStatusChanged(); // Kanban-dan task silinsin
      onClose(); // Modalı bağla
    } catch (err: unknown) {
      console.error('[TaskDetailModal] deleteTask xətası:', err);
      const msg = err instanceof Error ? err.message : 'Task silinərkən xəta baş verdi';
      setApiError(msg);
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="tdm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={currentTask.title}
    >
      {/* Karta klik keçməsin */}
      <div
        className="tdm-card"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Başlıq sətri ─────────────────────────────── */}
        <div className="tdm-top">
          <div className="tdm-id-badge">#{currentTask.id}</div>
          
          <div className="tdm-top-actions">
            {isManager && !isEditing && (
              <>
                <button
                  type="button"
                  className="tdm-action-btn tdm-edit-btn"
                  onClick={handleStartEdit}
                  title="Redaktə et"
                  aria-label="Redaktə et"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="tdm-action-btn tdm-delete-btn"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Sil"
                  aria-label="Sil"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </>
            )}

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
        </div>

        {/* ── Silmə Təsdiqi Banneri ── */}
        {showDeleteConfirm && (
          <div className="tdm-delete-confirm-box">
            <div className="tdm-delete-confirm-header">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Bu taskı silmək istədiyinizə əminsiniz?</span>
            </div>
            <p className="tdm-delete-confirm-text">
              Bu əməliyyat geri qaytarılmır. Tapşırıq və onunla bağlı bütün məlumatlar həmişəlik silinəcək.
            </p>
            <div className="tdm-delete-confirm-actions">
              <button
                type="button"
                className="tdm-confirm-btn tdm-confirm-cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Xeyr
              </button>
              <button
                type="button"
                className="tdm-confirm-btn tdm-confirm-delete"
                onClick={handleDeleteTask}
                disabled={deleting}
              >
                {deleting ? 'Silinir...' : 'Bəli, Sil'}
              </button>
            </div>
          </div>
        )}

        {/* ── Xəta mesajı ── */}
        {apiError && (
          <div className="tdm-api-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {apiError}
          </div>
        )}

        {/* ── Redaktə Formu və ya Normal Görünüş ── */}
        {isEditing ? (
          <div className="tdm-edit-form">
            <div className="tdm-field">
              <label className="tdm-label">
                Başlıq <span className="tdm-required">*</span>
              </label>
              <input
                type="text"
                className="tdm-input"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Tapşırığın başlığı..."
                disabled={saving}
                autoFocus
              />
            </div>

            <div className="tdm-field">
              <label className="tdm-label">Açıqlama</label>
              <textarea
                className="tdm-textarea"
                rows={4}
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Tapşırığın təsviri və görüləcək işlər..."
                disabled={saving}
              />
            </div>

            <div className="tdm-row">
              <div className="tdm-field tdm-col">
                <label className="tdm-label">İcraçı</label>
                <select
                  className="tdm-select"
                  value={editAssigneeId}
                  onChange={e => setEditAssigneeId(e.target.value ? Number(e.target.value) : '')}
                  disabled={saving}
                >
                  <option value="">Təyin edilməyib</option>
                  {members.map(m => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="tdm-field tdm-col">
                <label className="tdm-label">Çəki (1 - 5)</label>
                <div className="tdm-ceki-picker">
                  {[1, 2, 3, 4, 5].map(val => (
                    <button
                      key={val}
                      type="button"
                      className={`tdm-ceki-btn ${editCeki === val ? 'tdm-ceki-btn--active' : ''}`}
                      onClick={() => setEditCeki(val)}
                      disabled={saving}
                    >
                      ★ {val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="tdm-row">
              <div className="tdm-field tdm-col">
                <label className="tdm-label">Başlama tarixi</label>
                <input
                  type="date"
                  className="tdm-input tdm-date-input"
                  value={editStartAt}
                  onChange={e => setEditStartAt(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="tdm-field tdm-col">
                <label className="tdm-label">Son tarix (Deadline)</label>
                <input
                  type="date"
                  className="tdm-input tdm-date-input"
                  value={editDeadline}
                  onChange={e => setEditDeadline(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="tdm-edit-actions">
              <button
                type="button"
                className="tdm-btn tdm-btn-cancel"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Ləğv et
              </button>
              <button
                type="button"
                className="tdm-btn tdm-btn-save"
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving ? 'Yadda saxlanılır...' : 'Yadda saxla'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="tdm-title">{currentTask.title}</h2>

            {/* ── Açıqlama ─────────────────────────────────── */}
            {currentTask.description ? (
              <p className="tdm-desc">{currentTask.description}</p>
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
              {currentTask.ceki != null && (
                <div className="tdm-meta-row">
                  <span className="tdm-meta-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Çəki
                  </span>
                  <CekiBadge ceki={currentTask.ceki} />
                </div>
              )}

              {/* Başlama tarixi */}
              {currentTask.start_at && (
                <div className="tdm-meta-row">
                  <span className="tdm-meta-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Başlama
                  </span>
                  <span className="tdm-meta-val">{fmtDate(currentTask.start_at)}</span>
                </div>
              )}

              {/* Yaradılma tarixi */}
              {currentTask.created_at && (
                <div className="tdm-meta-row">
                  <span className="tdm-meta-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    Yaradılıb
                  </span>
                  <span className="tdm-meta-val">{fmtDate(currentTask.created_at)}</span>
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

              {/* Saving indicator */}
              {saving && (
                <div className="tdm-saving">
                  <span className="tdm-saving-spinner" />
                  Status dəyişdirilir...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
