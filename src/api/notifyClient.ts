import { getToken } from './client';

export const NOTIFY_BASE_URL =
  (import.meta as any).env?.VITE_NOTIFY_BASE_URL || 'http://localhost:4000';

console.log('[NotifyClient] NOTIFY_BASE_URL:', NOTIFY_BASE_URL, '| import.meta.env:', JSON.stringify((import.meta as any).env));

export type BildirisSeviyye = 'adi' | 'vacib' | 'cox_vacib';
export type HedefTipi = 'hamisi' | 'istifadeci' | 'rol' | 'layihe' | 'HAMISI' | 'SOBE' | 'sobe' | 'USER';

export interface SobeItem {
  id: string;
  ad: string;
  uzvSayi?: number;
  memberCount?: number;
  uzvler?: Array<{ id: string; adSoyad: string }>;
  [key: string]: unknown;
}

export interface BildirisItem {
  id: number | string;
  mesaj: string;
  seviyye: BildirisSeviyye;
  gonderen?: string | { id: number; name?: string; adSoyad?: string };
  tarix?: string;
  created_at?: string;
  oxunub?: boolean;
  [key: string]: unknown;
}

export interface GonderilenItem {
  id: number | string;
  mesaj: string;
  seviyye: BildirisSeviyye | string;
  hedefTipi?: string;
  hedefId?: string | number | null;
  hedefAd?: string;
  gonderenId?: string;
  gonderenAd?: string;
  tarix?: string;
  yaradildi?: string;
  created_at?: string;
  silinib?: boolean;
  cemiAlici?: number;
  oxuyanSay?: number;
  oxunmalar?: Array<{
    id: string;
    istifadeciId: string;
    oxunduTarixi?: string | null;
    catdiTarixi?: string | null;
    istifadeci?: { id: string; adSoyad: string };
  }>;
  [key: string]: unknown;
}

export interface NotifyUser {
  id: string | number;
  name?: string;
  adSoyad?: string;
  rol?: string;
  role?: string | number;
  isOnline?: boolean;
  sonGirisTarixi?: string | null;
  cihazId?: string | null;
  sobeler?: Array<{ id: string; ad: string }>;
  yaradildi?: string;
  [key: string]: unknown;
}

export async function notifyFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${NOTIFY_BASE_URL}${path}`;
  console.log(`[NotifyAPI] ${options.method ?? 'GET'} ${url}`);

  const token = getToken();
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    });
  } catch (networkErr) {
    console.error('[NotifyAPI] Network error:', networkErr);
    throw new Error(
      networkErr instanceof Error
        ? `Bildiriş serveri xətası: ${networkErr.message}`
        : 'Bildiriş serveri əlçatmazdır'
    );
  }

  console.log(`[NotifyAPI] Response: ${res.status} ${res.statusText}`);

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      console.error('[NotifyAPI] Error body:', body);
      message = body?.message ?? body?.error ?? message;
    } catch {
      console.error('[NotifyAPI] Could not parse error body');
    }
    throw new Error(message);
  }

  const data = (await res.json()) as T;
  return data;
}

export interface NotifyMeResponse {
  id: string | number;
  adSoyad?: string;
  rol: 'SUPERADMIN' | 'ADMIN' | 'USER' | string;
}

/**
 * Cari istifadəçinin notify sistemindəki rolunu gətirir: GET /notify/men
 */
export async function getNotifyMe(): Promise<NotifyMeResponse | null> {
  console.log('[NotifyAPI] getNotifyMe() çağırıldı');
  try {
    const res = await notifyFetch<any>('/notify/men');
    return (res?.data ?? res) as NotifyMeResponse;
  } catch (err) {
    console.error('[NotifyAPI] getNotifyMe() xətası:', err);
    return null;
  }
}

/**
 * Bildiriş tarixçəsini gətirir: GET /notify/tarixce
 */
export async function getBildirisTarixce(): Promise<BildirisItem[]> {
  console.log('[NotifyAPI] getBildirisTarixce() çağırıldı');
  const res = await notifyFetch<any>('/notify/tarixce');
  return (res?.tarixce ?? res?.data ?? res ?? []) as BildirisItem[];
}

/**
 * Göndərilən bildirişləri gətirir (admin üçün): GET /notify/gonderilenler
 */
export async function getGonderilenler(): Promise<GonderilenItem[]> {
  console.log('[NotifyAPI] getGonderilenler() çağırıldı');
  const res = await notifyFetch<any>('/notify/gonderilenler');
  return (res?.gonderilenler ?? res?.data ?? res ?? []) as GonderilenItem[];
}

/**
 * İstifadəçiləri gətirir (admin üçün): GET /notify/istifadeciler
 */
export async function getIstifadeciler(): Promise<NotifyUser[]> {
  console.log('[NotifyAPI] getIstifadeciler() çağırıldı');
  const res = await notifyFetch<any>('/notify/istifadeciler');
  return (res?.istifadeciler ?? res?.users ?? res?.data ?? res ?? []) as NotifyUser[];
}

/**
 * Bütün şöbələri gətirir (üzv sayı ilə): GET /notify/sobeler
 */
export async function getSobeler(): Promise<SobeItem[]> {
  console.log('[NotifyAPI] getSobeler() çağırıldı');
  const res = await notifyFetch<any>('/notify/sobeler');
  return (res?.sobeler ?? res?.data ?? res ?? []) as SobeItem[];
}

/**
 * Yeni şöbə yaradır: POST /notify/sobe
 */
export async function createSobe(ad: string): Promise<SobeItem> {
  console.log('[NotifyAPI] createSobe() çağırıldı:', ad);
  const res = await notifyFetch<any>('/notify/sobe', {
    method: 'POST',
    body: JSON.stringify({ ad: ad.trim() }),
  });
  return (res?.data ?? res) as SobeItem;
}

/**
 * İstifadəçiyə şöbə(lər) təyin edir: PATCH /notify/istifadeci/:id/sobe
 */
export async function updateUserSobe(
  userId: string | number,
  sobeIds: string[],
): Promise<{ id: string; adSoyad: string; sobeler: Array<{ id: string; ad: string }> }> {
  console.log('[NotifyAPI] updateUserSobe() çağırıldı:', { userId, sobeIds });
  const res = await notifyFetch<any>(`/notify/istifadeci/${userId}/sobe`, {
    method: 'PATCH',
    body: JSON.stringify({ sobeIds }),
  });
  return (res?.data ?? res);
}

/**
 * @deprecated Backend artıq bu endpointi dəstəkləmir.
 * Bildirişləri göndərmək üçün notifySocket.ts-dəki sendBildiris() funksiyasından istifadə edin
 * (socket.emit('bildirisGonder', ...) ilə işləyir).
 *
 * Bu funksiya yanlışlıqla çağırılmasın deyə saxlanılır, lakin istifadə edilmir.
 */
export async function sendBildiris(
  hedefTipi: string,
  hedefId: string | number | null,
  mesaj: string,
  seviyye: BildirisSeviyye,
): Promise<{ success: boolean; message?: string }> {
  console.warn('[NotifyAPI] sendBildiris() DEPRECATED — notifySocket.sendBildiris() istifadə edin');
  console.log('[NotifyAPI] sendBildiris() cagirildi', { hedefTipi, hedefId, mesaj, seviyye });
  const res = await notifyFetch<any>('/notify/gonder', {
    method: 'POST',
    body: JSON.stringify({ hedefTipi, hedefId, mesaj, seviyye }),
  });
  return res;
}

