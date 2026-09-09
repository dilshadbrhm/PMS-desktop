import { useState, useEffect, useCallback, useRef } from 'react';
import { getCaptcha, login, type User } from '../api/client';
import './LoginPage.css';

interface Props {
  onLoginSuccess: (user: User) => void;
}

export default function LoginPage({ onLoginSuccess }: Props) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaSual, setCaptchaSual] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const captchaRef = useRef<HTMLInputElement>(null);

  const fetchCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    // NOTE: intentionally NOT clearing error here so login error stays visible
    // while new captcha loads in the background.
    try {
      const data = await getCaptcha();
      setCaptchaSual(data.sual);
      setCaptchaToken(data.token);
      setCaptchaAnswer('');
      setTimeout(() => captchaRef.current?.focus(), 50);
    } catch {
      setError('Captcha yüklənmədi. Yenidən cəhd edin.');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  // Called by the manual "Yenilə" button — clears error first
  const handleManualCaptchaRefresh = useCallback(async () => {
    setError('');
    await fetchCaptcha();
  }, [fetchCaptcha]);


  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Login] Form submit tetikləndi');

    if (!name || !password || !captchaAnswer) {
      console.warn('[Login] Boş sahə var — submit dayandırıldı', { name: !!name, password: !!password, captchaAnswer: !!captchaAnswer });
      return;
    }

    setLoading(true);
    setError('');
    console.log('[Login] login() çağırılır...', { name, captchaToken: captchaToken.slice(0, 12) + '…' });

    try {
      const user = await login({ name, password, captcha: captchaAnswer, captchaToken });
      console.log('[Login] ✅ Login uğurlu, backend-in qaytardığı user:', JSON.stringify(user));
      onLoginSuccess(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xəta baş verdi';
      console.error('[Login] ❌ Login xətası:', err);
      // Refresh captcha first (so new token is ready), THEN show error.
      // Order matters: fetchCaptcha no longer clears the error state.
      await fetchCaptcha();
      setError(msg);
    } finally {
      setLoading(false);
      console.log('[Login] loading = false');
    }
  };


  return (
    <div className="lp-root">
      {/* Left panel — branding */}
      <div className="lp-brand">
        <div className="lp-brand-inner">
          <div className="lp-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <rect width="48" height="48" rx="14" fill="url(#g1)" />
              <path d="M14 24h6l4-10 4 20 4-10h6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="lp-logo-text">PMS</span>
          </div>
          <h1 className="lp-headline">Layihə İdarəetmə<br />Sistemi</h1>
          <p className="lp-sub">Komandanızla birlikdə layihələri planlaşdırın, tapşırıqları izləyin və effektiv əməkdaşlıq edin.</p>

          <ul className="lp-features">
            {['Layihə və tapşırıq idarəetməsi', 'Real-vaxt chat & bildirişlər', 'Timeline & audit jurnalı'].map(f => (
              <li key={f}>
                <span className="lp-check">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-brand-blur lp-brand-blur--1" />
        <div className="lp-brand-blur lp-brand-blur--2" />
      </div>

      {/* Right panel — form */}
      <div className="lp-form-panel">
        <div className="lp-card">
          <div className="lp-card-header">
            <h2>Xoş gəldiniz</h2>
            <p>Hesabınıza daxil olun</p>
          </div>

          <form id="login-form" onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <div className="lp-field">
              <label htmlFor="lp-name">İstifadəçi adı</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="lp-name"
                  type="text"
                  autoComplete="username"
                  placeholder="istifadəçi adı"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="lp-field">
              <label htmlFor="lp-password">Parol</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="lp-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="lp-eye-btn"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Parolu gizlət' : 'Parolu göstər'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Captcha */}
            <div className="lp-field">
              <div className="lp-captcha-label-row">
                <label htmlFor="lp-captcha">Captcha</label>
                <button
                  type="button"
                  className="lp-refresh-btn"
                  onClick={handleManualCaptchaRefresh}
                  disabled={captchaLoading || loading}
                  aria-label="Yeni captcha al"
                >
                  <svg className={captchaLoading ? 'spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Yenilə
                </button>
              </div>
              <div className="lp-captcha-box">
                <div className="lp-captcha-sual">
                  {captchaLoading
                    ? <span className="lp-captcha-skeleton" />
                    : <><span className="lp-captcha-math">{captchaSual}</span><span className="lp-captcha-eq"> = ?</span></>
                  }
                </div>
                <input
                  id="lp-captcha"
                  ref={captchaRef}
                  type="number"
                  inputMode="numeric"
                  placeholder="Cavab"
                  value={captchaAnswer}
                  onChange={e => setCaptchaAnswer(e.target.value)}
                  disabled={captchaLoading || loading}
                  required
                  className="lp-captcha-input"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="lp-error" role="alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <button
              id="lp-submit"
              type="submit"
              className="lp-submit"
              disabled={loading || captchaLoading || !name || !password || !captchaAnswer}
            >
              {loading
                ? <><span className="lp-spinner" />Yüklənir...</>
                : 'Daxil ol'}
            </button>
          </form>
        </div>

        <p className="lp-footer">© 2026 Azerenerji PMS</p>
      </div>
    </div>
  );
}
