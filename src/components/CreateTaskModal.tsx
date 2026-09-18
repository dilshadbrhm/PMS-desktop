import { useState, useEffect, useCallback } from 'react';
import { createTask, type Task } from '../api/client';
import './CreateTaskModal.css';

interface MemberOption {
  userId: number;
  name: string;
}

interface Props {
  projectId: number;
  currentUserId: number;
  userRole?: string | null;
  members: MemberOption[];
  onClose: () => void;
  onTaskCreated: (newTask: Task) => void;
}

function checkIsManager(role?: string | number | null): boolean {
  if (role === null || role === undefined || role === '') return false;
  // Rəqəm və ya string yoxlaması: 2 = Menecer, 1 = Qlobal/Sistem Menecer/Admin
  if (role === 2 || role === 1 || role === '2' || role === '1') return true;
  const r = String(role).trim().toLowerCase();
  return (
    r === '2' ||
    r === '1' ||
    r.includes('men') ||     // Menecer, menecer
    r.includes('man') ||     // Manager, manager
    r.includes('admin') ||   // Admin
    r.includes('rehber') ||  // Rehber
    r.includes('rəhbər') ||  // Rəhbər
    r.includes('owner') ||   // Owner
    r.includes('sahib')
  );
}

export default function CreateTaskModal({
  projectId,
  currentUserId,
  userRole,
  members,
  onClose,
  onTaskCreated,
}: Props) {
  // Rol yoxlaması: 'Menecer', 'Manager', 'admin', '1' və s.
  const isManager = checkIsManager(userRole);
  console.log('[CreateTaskModal] userRole:', userRole, 'isManager:', isManager, 'members:', members);

  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  // Menecer üçün: defolt olaraq özü (currentUserId) və ya siyahının 1-ci üzvü
  const [assigneeId, setAssigneeId]   = useState<number | ''>(
    currentUserId || (members[0]?.userId ?? '')
  );
  const [deadline, setDeadline]       = useState('');
  const [ceki, setCeki]               = useState<number>(1);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');

  // Escape düyməsi ilə bağla
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Tapşırıq başlığı məcburidir');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // İstifadəçi rolu üçün: assigneeId mütləq özüdür və ceki backend default (və ya 1)
      const finalAssigneeId = isManager
        ? (assigneeId ? Number(assigneeId) : null)
        : currentUserId;

      const created = await createTask(projectId, {
        title: trimmedTitle,
        description: description.trim() || undefined,
        assigneeId: finalAssigneeId,
        deadline: deadline || undefined,
        ceki: isManager ? Number(ceki) : undefined,
      });

      onTaskCreated(created);
      onClose();
    } catch (err: unknown) {
      console.error('[CreateTaskModal] Task yaratma xətası:', err);
      const msg = err instanceof Error ? err.message : 'Tapşırıq yaradılarkən xəta baş verdi';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ctm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Yeni Tapşırıq yarat"
    >
      <div className="ctm-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ctm-header">
          <div className="ctm-title-wrap">
            <div className="ctm-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div>
              <h2 className="ctm-title">Yeni Tapşırıq</h2>
              <p className="ctm-subtitle">Layihə daxilində yeni tapşırıq əlavə edin</p>
            </div>
          </div>
          <button className="ctm-close-btn" onClick={onClose} title="Bağla">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Xəta bildirişi */}
        {error && (
          <div className="ctm-error-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="ctm-form">
          <div className="ctm-field">
            <label className="ctm-label">
              Tapşırıq başlığı <span className="ctm-required">*</span>
            </label>
            <input
              type="text"
              className="ctm-input"
              placeholder="Məs. Əsas səhifənin dizaynını tamamla"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={submitting}
              autoFocus
              required
            />
          </div>

          <div className="ctm-field">
            <label className="ctm-label">Açıqlama</label>
            <textarea
              className="ctm-textarea"
              placeholder="Görüləcək işlər və texniki tələblər..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={submitting}
              rows={3}
            />
          </div>

          {/* İcraçı seçimi (Menecer üçün dropdown, İstifadəçi üçün özü) */}
          {isManager ? (
            <div className="ctm-field">
              <label className="ctm-label">Təyin edilən şəxs (İcraçı)</label>
              <select
                className="ctm-select"
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value ? Number(e.target.value) : '')}
                disabled={submitting}
              >
                <option value="">Təyin edilməyib</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} {m.userId === currentUserId ? '(Siz)' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="ctm-field">
              <label className="ctm-label">İcraçı</label>
              <div className="ctm-readonly-box">
                <span className="ctm-readonly-tag">Sizə təyin olunur</span>
              </div>
            </div>
          )}

          <div className="ctm-row">
            {/* Deadline */}
            <div className="ctm-field ctm-col">
              <label className="ctm-label">Son tarix (Deadline)</label>
              <input
                type="date"
                className="ctm-input ctm-date-input"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Çəki (Yalnız Menecer rolu üçün görünür) */}
            {isManager && (
              <div className="ctm-field ctm-col">
                <label className="ctm-label">Çəki (1 - 5)</label>
                <div className="ctm-ceki-wrap">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      className={`ctm-ceki-star ${star <= ceki ? 'ctm-ceki-star--active' : ''}`}
                      onClick={() => setCeki(star)}
                      disabled={submitting}
                      title={`${star} ulduz`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ctm-ceki-val">{ceki}</span>
                </div>
              </div>
            )}
          </div>

          <div className="ctm-footer">
            <button
              type="button"
              className="ctm-btn-cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Ləğv et
            </button>
            <button
              type="submit"
              className="ctm-btn-submit"
              disabled={submitting || !title.trim()}
            >
              {submitting ? (
                <>
                  <span className="ctm-spinner" />
                  Yaradılır...
                </>
              ) : (
                'Tapşırığı yarat'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
