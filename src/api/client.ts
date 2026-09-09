const BASE_URL = 'https://pms.azerenerji.az/api/v1';

// ─── Token yaddaşı ────────────────────────────────────────────────────────────
// Electron-da localStorage 3-cü tərəf riski yoxdur, lakin modul dəyişəni
// daha sadə və sürətlidir (yalnız cari sessiya üçün kifayət edir).
let _accessToken: string | null = null;

export function getToken(): string | null {
  return _accessToken;
}

function setToken(token: string | null): void {
  _accessToken = token;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  console.log(`[API] ${options.method ?? 'GET'} ${url}`);

  // Bearer token varsa Authorization header əlavə et
  const authHeaders: Record<string, string> = {};
  if (_accessToken) {
    authHeaders['Authorization'] = `Bearer ${_accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      credentials: 'include', // cookie-based auth üçün saxlanılır
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    });
  } catch (networkErr) {
    // Network-level failure (ERR_FAILED, ERR_CONNECTION_REFUSED, CORS, etc.)
    console.error('[API] Network error:', networkErr);
    throw new Error(
      networkErr instanceof Error
        ? `Şəbəkə xətası: ${networkErr.message}`
        : 'Şəbəkə xətası: server əlçatmazdır'
    );
  }

  console.log(`[API] Response: ${res.status} ${res.statusText}`);

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      console.error('[API] Error body:', body);
      message = body?.message ?? body?.error ?? message;
    } catch {
      console.error('[API] Could not parse error body');
    }
    throw new Error(message);
  }

  const data = await res.json() as T;
  console.log('[API] Success:', data);
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  name?: string;      // login adı (məs. "Dilshad.Ibrahimli")
  adSoyad?: string;   // tam ad (məs. "Dilshad Ibrahimli")
  status?: number;
  role?: number | string;
  [key: string]: unknown; // backend-in əlavə sahələri üçün
}

export interface CaptchaResponse {
  sual: string;
  token: string;
}

export async function getCaptcha(): Promise<CaptchaResponse> {
  console.log('[Auth] getCaptcha() çağırıldı');
  return apiFetch<CaptchaResponse>('/auth/captcha');
}

export interface LoginPayload {
  name: string;
  password: string;
  captcha: string;
  captchaToken: string;
}

/** Login olur, Bearer token-i yaddaşa yazır və istifadəçini qaytarır.
 *  Backend: { istifadeci: User, accessToken: string }
 */
export async function login(payload: LoginPayload): Promise<User> {
  console.log('[Auth] login() çağırıldı, istifadəçi:', payload.name);

  const response = await apiFetch<{ istifadeci: User; accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  console.log('[Auth] login() cavabı alındı');

  if (response.accessToken) {
    setToken(response.accessToken);
    console.log('[Auth] accessToken yaddaşa yazıldı');
  } else {
    console.warn('[Auth] accessToken cavabda yoxdur');
  }

  return response.istifadeci;
}

/** App açılanda token yoxlayır.
 *  - Token yaddaşda yoxdursa → dərhal null qaytarır (server sorğusu göndərilmir)
 *  - Token varsa → /auth/men ilə doğrulayır; 401/xəta → null
 */
export async function getMe(): Promise<User | null> {
  console.log('[Auth] getMe() çağırıldı');

  if (!_accessToken) {
    console.log('[Auth] Token yoxdur — server sorğusu göndərilmir, login səhifəsinə yönləndirilir');
    return null;
  }

  try {
    const response = await apiFetch<{ istifadeci: User }>('/auth/men');
    console.log('[Auth] getMe() cavabı:', response);
    return response?.istifadeci ?? null;
  } catch {
    // Token köhnəlib və ya etibarsızdır
    setToken(null);
    console.warn('[Auth] Token etibarsızdır — silindi, login səhifəsinə yönləndirilir');
    return null;
  }
}

/** Sessiyanı bitirir: token yaddaşdan silinir və server-ə logout sorğusu göndərilir. */
export async function logout(): Promise<void> {
  console.log('[Auth] logout() çağırıldı');
  // Əvvəlcə token-i yaddaşdan sil (server sorğusu uğursuz olsa belə)
  setToken(null);
  console.log('[Auth] Token yaddaşdan silindi');
  try {
    await apiFetch<unknown>('/auth/logout', { method: 'POST' });
  } catch (err) {
    // Logout uğursuz olsa belə lokal vəziyyəti artıq sıfırladıq
    console.warn('[Auth] Server logout sorğusu uğursuz oldu (token artıq silindi):', err);
  }
}

// ─── Layihələr (Projects) ─────────────────────────────────────────────────────

/** Backend-in qaytardığı deadline obyekti */
export interface DeadlineInfo {
  seviyye: 'teyin-olunmayib' | 'normal' | 'sari' | 'qirmizi' | 'kecib';
  kecenFaiz: number;
  qalanFaiz: number;
  qalanGun: number;
  kilidli: boolean;
  start_at: string | null;
  end_at: string | null;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  status?: number | string;
  created_by?: number | string;
  created_at?: string;
  closed_at?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  /** Mürəkkəb deadline obyekti (backend v2+). Köhnə API-da string ola bilər. */
  deadline?: DeadlineInfo | string | null;
  menimRolum?: string;
  taskSayi?: number;
  uzvSayi?: number;
  [key: string]: unknown;
}

/** Cari istifadəçinin layihələr siyahısını alır. */
export async function getProjects(): Promise<Project[]> {
  console.log('[Projects] getProjects() çağırıldı');
  const res = await apiFetch<any>('/projects');
  console.log('[Projects] Backend-dən gələn cavab:', res);

  if (Array.isArray(res)) {
    return res;
  }
  if (Array.isArray(res?.projects)) {
    return res.projects;
  }
  if (Array.isArray(res?.layiheler)) {
    return res.layiheler;
  }
  if (Array.isArray(res?.data)) {
    return res.data;
  }
  return [];
}

/** Tək layihənin detallarını alır. */
export async function getProjectDetail(projectId: number): Promise<Project> {
  console.log(`[Projects] getProjectDetail(${projectId}) çağırıldı`);
  const res = await apiFetch<any>(`/projects/${projectId}`);
  console.log('[Projects] getProjectDetail cavabı:', res);
  // Backend { layihe: {...} } və ya birbaşa obyekt qaytara bilər
  return (res?.layihe ?? res?.project ?? res) as Project;
}

// ─── Tapşırıqlar (Tasks) ──────────────────────────────────────────────────────

/** Task statusu: 1=Açıq, 2=İcrada, 3=Bitib */
export enum TaskStatus {
  Aciq   = 1,
  Icrada = 2,
  Bitib  = 3,
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.Aciq]:   'Açıq',
  [TaskStatus.Icrada]: 'İcrada',
  [TaskStatus.Bitib]:  'Bitib',
};

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description?: string | null;
  status: TaskStatus | number;
  assignee_id?: number | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
  start_at?: string | null;
  /** Mürəkkəb deadline obyekti və ya string tarix */
  deadline?: DeadlineInfo | string | null;
  deadline_kilidli?: boolean;
  ceki?: number | null;
  /** Tapşırığın təyin olunduğu istifadəçi */
  assignee?: { id: number; name: string } | null;
  /** Backend-in hesabladığı deadline vəziyyəti (DeadlineInfo kimi) */
  deadlineVeziyyeti?: DeadlineInfo | null;
  [key: string]: unknown;
}

/** Layihənin tapşırıqlar siyahısını alır. */
export async function getTasks(projectId: number): Promise<Task[]> {
  console.log(`[Tasks] getTasks(${projectId}) çağırıldı`);
  const res = await apiFetch<any>(`/projects/${projectId}/tasks`);
  console.log('[Tasks] Backend-dən gələn cavab:', res);

  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.tasks))        return res.tasks;
  if (Array.isArray(res?.tapshiriqlar)) return res.tapshiriqlar;
  if (Array.isArray(res?.data))         return res.data;
  return [];
}

/** Task statusunu dəyişir.
 *  Qaydalar (backend tərəfindən yoxlanılır):
 *  - Menecer: istənilən status
 *  - İstifadəçi: yalnız öz taskı, yalnız Açıq↔İcrada arası
 *  - Ghost: heç nə
 *  403 → backend icazə vermir, xəta atılır
 */
export async function updateTaskStatus(
  projectId: number,
  taskId: number,
  status: TaskStatus | number,
): Promise<void> {
  console.log(`[Tasks] updateTaskStatus(project=${projectId}, task=${taskId}, status=${status})`);
  await apiFetch<unknown>(`/projects/${projectId}/tasks/${taskId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  console.log('[Tasks] Status uğurla dəyişdirildi');
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/** Mesaj növü: 'metn' | 'ses' | 'fayl' | 'zeng' */
export type MesajNovu = 'metn' | 'ses' | 'fayl' | 'zeng' | string;

/** Oxunma vəziyyəti */
export interface OxunmaVeziyyeti {
  oxuyanId: number;
  oxuyanAd?: string;
  oxunduAt: string;
}

/** Chat mesajı — backend-in qaytardığı tam struktur */
export interface ChatMesaj {
  id: number;
  projectId: number;
  senderId: number;
  senderName: string;
  message: string | null;
  mesajNovu: MesajNovu;
  isPrivate: boolean;
  recipientId?: number | null;
  recipientName?: string | null;
  createdAt: string;
  editedAt?: string | null;
  silinib: boolean;
  oxunmaVeziyyeti?: OxunmaVeziyyeti[];
  /** Fayl/səs mesajları üçün əlavə sahələr */
  fileName?: string | null;
  fileSize?: number | null;
  muddet?: number | null;  // səs müddəti (saniyə)
  [key: string]: unknown;
}

export interface ChatMember {
  id: number;
  ad?: string;
  soyad?: string;
  name?: string;
  email?: string;
  avatar?: string | null;
  rol?: string;
  [key: string]: unknown;
}

export interface ChatHistoryResult {
  mesajlar: ChatMesaj[];
  uzvler: ChatMember[];
}

/**
 * Layihə chat tarixçəsini alır.
 * @param projectId  Layihə ID-si
 * @param beforeId   Cursor pagination: bu ID-dən köhnə mesajlar (undefined = ən son)
 * @param limit      Neçə mesaj (1-100, default 30)
 */
export async function getChatHistory(
  projectId: number,
  beforeId?: number,
  limit = 30,
): Promise<ChatHistoryResult> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId != null) params.set('beforeId', String(beforeId));

  console.log(`[Chat] getChatHistory(project=${projectId}, beforeId=${beforeId ?? '—'}, limit=${limit})`);
  const res = await apiFetch<any>(`/projects/${projectId}/chat?${params}`);
  console.log('[Chat] Tarixçə cavabı:', res);

  let mesajlar: ChatMesaj[] = [];
  if (Array.isArray(res)) {
    mesajlar = res;
  } else if (Array.isArray(res?.mesajlar)) {
    mesajlar = res.mesajlar;
  } else if (Array.isArray(res?.messages)) {
    mesajlar = res.messages;
  } else if (Array.isArray(res?.data)) {
    mesajlar = res.data;
  }

  let uzvler: ChatMember[] = [];
  if (Array.isArray(res?.uzvler)) {
    uzvler = res.uzvler;
  } else if (Array.isArray(res?.members)) {
    uzvler = res.members;
  } else if (Array.isArray(res?.users)) {
    uzvler = res.users;
  } else if (Array.isArray(res?.istifadeciler)) {
    uzvler = res.istifadeciler;
  }

  return { mesajlar, uzvler };
}

/**
 * Layihə chatına fayl yükləyir (multipart/form-data, sahə: "fayl").
 */
export async function uploadFile(
  projectId: number,
  file: File,
): Promise<ChatMesaj | unknown> {
  const formData = new FormData();
  formData.append('fayl', file);

  const url = `${BASE_URL}/projects/${projectId}/chat/fayl`;
  console.log(`[Chat] uploadFile: POST ${url}, file=${file.name}, size=${file.size}`);

  const headers: Record<string, string> = {};
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      message = errBody?.message ?? errBody?.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

/**
 * Layihə chatına səs yazısı yükləyir (multipart/form-data, sahə: "ses").
 * @param muddet Səs müddəti (saniyə)
 */
export async function uploadVoice(
  projectId: number,
  audioBlob: Blob,
  muddet: number,
): Promise<ChatMesaj | unknown> {
  const formData = new FormData();
  // Server üçün fayl adı ilə append edirik (məs. audio.webm və ya audio.mp3)
  formData.append('ses', audioBlob, 'ses_mesaji.webm');
  formData.append('muddet', String(Math.round(muddet)));

  const url = `${BASE_URL}/projects/${projectId}/chat/ses`;
  console.log(`[Chat] uploadVoice: POST ${url}, size=${audioBlob.size}, muddet=${muddet}s`);

  const headers: Record<string, string> = {};
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      message = errBody?.message ?? errBody?.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

/**
 * Layihə chat faylını Bearer token ilə yükləyib Object URL (blob:...) yaradır.
 * HTML <img> və ya download linklər üçün uyğundur.
 */
export async function getFileBlobUrl(projectId: number, mesajId: number): Promise<string> {
  const url = `${BASE_URL}/projects/${projectId}/chat/fayl/${mesajId}`;
  const token = getToken();
  console.log(`[Chat] getFileBlobUrl: GET ${url}, token mövcuddur:`, Boolean(token));

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn('[Chat] getFileBlobUrl: Token yoxdur!');
  }

  const res = await fetch(url, {
    credentials: 'include',
    headers,
  });

  console.log(`[Chat] getFileBlobUrl cavab kodu: HTTP ${res.status}`);

  if (!res.ok) {
    throw new Error(`Fayl yüklənmədi (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Layihə chat səs yazısını Bearer token ilə yükləyib Object URL (blob:...) yaradır.
 * HTML5 <audio> tag-ı üçün uyğundur.
 */
export async function getVoiceBlobUrl(projectId: number, mesajId: number): Promise<string> {
  const url = `${BASE_URL}/projects/${projectId}/chat/ses/${mesajId}`;
  const token = getToken();
  console.log(`[Chat] getVoiceBlobUrl: GET ${url}, token mövcuddur:`, Boolean(token));

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn('[Chat] getVoiceBlobUrl: Token yoxdur!');
  }

  const res = await fetch(url, {
    credentials: 'include',
    headers,
  });

  console.log(`[Chat] getVoiceBlobUrl cavab kodu: HTTP ${res.status}`);

  if (!res.ok) {
    throw new Error(`Səs faylı yüklənmədi (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Sadə URL generator (token query parametri və ya birbaşa endpoint).
 */
export function getFileUrl(projectId: number, mesajId: number): string {
  return `${BASE_URL}/projects/${projectId}/chat/fayl/${mesajId}`;
}

export function getVoiceUrl(projectId: number, mesajId: number): string {
  return `${BASE_URL}/projects/${projectId}/chat/ses/${mesajId}`;
}

// ─── Bildirişlər (Notifications) ──────────────────────────────────────────────

export interface Bildiris {
  id: number;
  title: string;
  message?: string;
  senderName?: string;
  createdAt?: string;
  created_at?: string;
  oxundu?: boolean;
  read?: boolean;
  isRead?: boolean;
  type?: string;
  link?: string;
  [key: string]: unknown;
}

export interface NotificationsResult {
  say: number;
  siyahi: Bildiris[];
}

/**
 * Bildirişlər siyahısını və oxunmamış bildiriş sayını alır.
 * GET /notifications -> { say: number, siyahi: Bildiris[] }
 */
export async function getNotifications(): Promise<NotificationsResult> {
  console.log('[Notifications] getNotifications() çağırıldı');
  const res = await apiFetch<any>('/notifications');
  console.log('[Notifications] getNotifications cavabı:', res);

  let siyahi: Bildiris[] = [];
  if (Array.isArray(res)) {
    siyahi = res;
  } else if (Array.isArray(res?.siyahi)) {
    siyahi = res.siyahi;
  } else if (Array.isArray(res?.notifications)) {
    siyahi = res.notifications;
  } else if (Array.isArray(res?.data)) {
    siyahi = res.data;
  }

  const say = typeof res?.say === 'number'
    ? res.say
    : typeof res?.count === 'number'
    ? res.count
    : typeof res?.unreadCount === 'number'
    ? res.unreadCount
    : siyahi.filter(b => !b.oxundu && !b.read && !b.isRead).length;

  return { say, siyahi };
}

/**
 * Tək bir bildirişin detallarını alır.
 * GET /notifications/:id
 */
export async function getNotificationDetail(id: number): Promise<Bildiris> {
  console.log(`[Notifications] getNotificationDetail(${id}) çağırıldı`);
  const res = await apiFetch<any>(`/notifications/${id}`);
  console.log(`[Notifications] getNotificationDetail(${id}) cavabı:`, res);
  return (res?.bildiris ?? res?.notification ?? res?.data ?? res) as Bildiris;
}

/**
 * Bildirişi oxunmuş kimi qeyd edir.
 * PATCH /notifications/:id/read
 */
export async function markNotificationRead(id: number): Promise<any> {
  console.log(`[Notifications] markNotificationRead(${id}) çağırıldı`);
  const res = await apiFetch<any>(`/notifications/${id}/read`, {
    method: 'PATCH',
  });
  console.log(`[Notifications] markNotificationRead(${id}) cavabı:`, res);
  return res;
}

