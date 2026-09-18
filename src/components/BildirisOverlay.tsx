import React, { useState, useEffect } from 'react';
import { onYeniBildiris } from '../api/notifySocket';
import type { BildirisItem, BildirisSeviyye } from '../api/notifyClient';
import './BildirisOverlay.css';

interface ToastItem {
  id: string | number;
  title: string;
  mesaj: string;
  sender: string;
}

// ── Web Audio API ilə səs effekti generasiyası ─────────────────────────────
function playNotificationSound(seviyye: BildirisSeviyye) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (seviyye === 'adi') {
      // ── ADİ: Zərif iki tonlu chime (D5 -> A5) ──
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.08); // A5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);
    } else if (seviyye === 'vacib') {
      // ── VACİB: Orta gücdə ikiqat diqqət siqnalı ──
      [0, 0.14].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, now + offset); // E5
        osc.frequency.exponentialRampToValueAtTime(880, now + offset + 0.09); // A5

        gain.gain.setValueAtTime(0.01, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.28, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.13);
      });
    } else {
      // ── ÇOX VACİB: Güclü və 3 dəfə təkrarlanan həyəcan siqnalı ──
      [0, 0.18, 0.36].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        const freq = idx % 2 === 0 ? 880 : 700;
        osc.frequency.setValueAtTime(freq, now + offset);

        gain.gain.setValueAtTime(0.01, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    }
  } catch (e) {
    console.warn('[BildirisOverlay] Səs çalınarkən xəta:', e);
  }
}

function getSenderName(gonderen?: BildirisItem['gonderen']): string {
  if (!gonderen) return 'Sistem';
  if (typeof gonderen === 'string') return gonderen;
  return gonderen.adSoyad || gonderen.name || 'Sistem';
}

export default function BildirisOverlay(): React.ReactElement {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [vacibItem, setVacibItem] = useState<BildirisItem | null>(null);
  const [coxVacibItem, setCoxVacibItem] = useState<BildirisItem | null>(null);

  useEffect(() => {
    console.log('[BildirisOverlay] Real-time bildiriş dinləyicisi aktivləşdirildi');

    const unsubscribe = onYeniBildiris((yeni: BildirisItem) => {
      console.log('[BildirisOverlay] Yeni bildiriş alındı:', yeni);
      const seviyye: BildirisSeviyye = yeni.seviyye || 'adi';

      // Müvafiq səsi çal
      playNotificationSound(seviyye);

      if (seviyye === 'cox_vacib') {
        setCoxVacibItem(yeni);
      } else if (seviyye === 'vacib') {
        setVacibItem(yeni);
      } else {
        // Adi: sağ-alt künc toast-u
        const toastId = yeni.id || `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newToast: ToastItem = {
          id: toastId,
          title: 'Yeni Bildiriş',
          mesaj: yeni.mesaj,
          sender: getSenderName(yeni.gonderen),
        };

        setToasts(prev => [newToast, ...prev]);

        // 5 saniyə sonra avtomatik sil
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toastId));
        }, 5000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="bo-container">
      {/* ── 1. ADİ SƏVİYYƏ: SAĞ-ALT TOAST STACK ── */}
      {toasts.length > 0 && (
        <div className="bo-toast-stack" aria-live="polite">
          {toasts.map(toast => (
            <div key={toast.id} className="bo-toast">
              <div className="bo-toast-header">
                <div className="bo-toast-badge-group">
                  <div className="bo-toast-icon-wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <span className="bo-toast-brand">AZEREN PMS</span>
                </div>
                <button
                  type="button"
                  className="bo-toast-close"
                  onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                  title="Bağla"
                  aria-label="Bağla"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="bo-toast-body">
                <p className="bo-toast-msg">{toast.mesaj}</p>
                <div className="bo-toast-meta">
                  <span>Göndərən:</span>
                  <span className="bo-toast-sender">{toast.sender}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 2. VACİB SƏVİYYƏ: MƏRKƏZDƏ MODAL ── */}
      {vacibItem && (
        <div className="bo-modal-backdrop" role="dialog" aria-modal="true">
          <div className="bo-modal-card" onClick={e => e.stopPropagation()}>
            <div className="bo-modal-icon-badge">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h3 className="bo-modal-title">Vacib Bildiriş</h3>
            <p className="bo-modal-msg">{vacibItem.mesaj}</p>

            <div className="bo-modal-sender-box">
              <span>Göndərən:</span>
              <span className="bo-modal-sender-val">{getSenderName(vacibItem.gonderen)}</span>
            </div>

            <button
              type="button"
              className="bo-modal-btn"
              onClick={() => setVacibItem(null)}
            >
              Anladım
            </button>
          </div>
        </div>
      )}

      {/* ── 3. ÇOX VACİB SƏVİYYƏ: BÜTÜN EKRANI ÖRTƏN QIRMIZI OVERLAY ── */}
      {coxVacibItem && (
        <div className="bo-fullscreen-backdrop" role="alertdialog" aria-modal="true">
          <div className="bo-fullscreen-border-pulse" />

          <div className="bo-fullscreen-card" onClick={e => e.stopPropagation()}>
            <div className="bo-fullscreen-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <span className="bo-fullscreen-tag">Təcili</span>
            <h2 className="bo-fullscreen-title">TƏCİLİ VƏ ÇOX VACİB BİLDİRİŞ</h2>
            <p className="bo-fullscreen-msg">{coxVacibItem.mesaj}</p>

            <div className="bo-fullscreen-sender">
              <span>Göndərən:</span>
              <strong>{getSenderName(coxVacibItem.gonderen)}</strong>
            </div>

            <button
              type="button"
              className="bo-fullscreen-btn"
              onClick={() => setCoxVacibItem(null)}
            >
              Oxudum, Bağla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
