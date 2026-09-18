import { useState, useEffect, useCallback } from 'react';
import { createProject, type Project } from '../api/client';
import './CreateProjectModal.css';

interface Props {
  onClose: () => void;
  onProjectCreated: (newProject: Project) => void;
}

export default function CreateProjectModal({ onClose, onProjectCreated }: Props) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt]         = useState('');
  const [endAt, setEndAt]             = useState('');
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
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Layihə adı məcburidir');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const created = await createProject({
        name: trimmedName,
        description: description.trim() || undefined,
        start_at: startAt || undefined,
        end_at: endAt || undefined,
      });

      onProjectCreated(created);
      onClose();
    } catch (err: unknown) {
      console.error('[CreateProjectModal] Layihə yaratma xətası:', err);
      const msg = err instanceof Error ? err.message : 'Layihə yaradılarkən xəta baş verdi';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="cpm-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Yeni Layihə yarat"
    >
      <div className="cpm-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="cpm-header">
          <div className="cpm-title-wrap">
            <div className="cpm-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </div>
            <div>
              <h2 className="cpm-title">Yeni Layihə</h2>
              <p className="cpm-subtitle">Yeni layihə məlumatlarını daxil edin</p>
            </div>
          </div>
          <button className="cpm-close-btn" onClick={onClose} title="Bağla">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Xəta bildirişi */}
        {error && (
          <div className="cpm-error-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="cpm-form">
          <div className="cpm-field">
            <label className="cpm-label">
              Layihə adı <span className="cpm-required">*</span>
            </label>
            <input
              type="text"
              className="cpm-input"
              placeholder="Məs. Yeni Veb Portal"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={submitting}
              autoFocus
              required
            />
          </div>

          <div className="cpm-field">
            <label className="cpm-label">Açıqlama (təsvir)</label>
            <textarea
              className="cpm-textarea"
              placeholder="Layihənin məqsədi və qısa detalları..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={submitting}
              rows={3}
            />
          </div>

          <div className="cpm-row">
            <div className="cpm-field cpm-col">
              <label className="cpm-label">Başlama tarixi</label>
              <input
                type="date"
                className="cpm-input cpm-date-input"
                value={startAt}
                onChange={e => setStartAt(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="cpm-field cpm-col">
              <label className="cpm-label">Bitmə tarixi</label>
              <input
                type="date"
                className="cpm-input cpm-date-input"
                value={endAt}
                onChange={e => setEndAt(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="cpm-footer">
            <button
              type="button"
              className="cpm-btn-cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Ləğv et
            </button>
            <button
              type="submit"
              className="cpm-btn-submit"
              disabled={submitting || !name.trim()}
            >
              {submitting ? (
                <>
                  <span className="cpm-spinner" />
                  Yaradılır...
                </>
              ) : (
                'Layihəni yarat'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
