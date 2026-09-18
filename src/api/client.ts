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

/**
 * Layihənin bütün üzvlərini alır.
 * GET /projects/:projectId/members
 */
export async function getProjectMembers(projectId: number): Promise<any[]> {
  console.log(`[Projects] getProjectMembers(${projectId}) çağırıldı`);
  try {
    const res = await apiFetch<any>(`/projects/${projectId}/members`);
    console.log('[Projects] getProjectMembers cavabı:', res);
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.members)) return res.members;
    if (Array.isArray(res?.uzvler)) return res.uzvler;
    if (Array.isArray(res?.users)) return res.users;
    if (Array.isArray(res?.istifadeciler)) return res.istifadeciler;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  } catch (err) {
    console.warn('[Projects] getProjectMembers xətası:', err);
    return [];
  }
}

/** Tək layihənin detallarını alır. */
export async function getProjectDetail(projectId: number): Promise<Project> {
  console.log(`[Projects] getProjectDetail(${projectId}) çağırıldı`);
  const [res, memberList] = await Promise.all([
    apiFetch<any>(`/projects/${projectId}`),
    getProjectMembers(projectId),
  ]);
  console.log('[ProjectDetail] RAW backend cavabı:', JSON.stringify(res, null, 2));
  console.log('[Projects] getProjectDetail cavabı:', res);
  // Backend { layihe: {...}, menimRolum: '...' } və ya birbaşa obyekt qaytara bilər
  const base = (res?.layihe ?? res?.project ?? res) || {};
  const menimRolum =
    base.menimRolum ||
    res?.menimRolum ||
    res?.myRole ||
    res?.rol ||
    base.myRole ||
    base.rol ||
    base.role ||
    res?.role;

  const rawUzvler =
    base.uzvler ||
    res?.uzvler ||
    base.members ||
    res?.members ||
    base.users ||
    res?.users ||
    base.istifadeciler ||
    res?.istifadeciler ||
    [];

  // /members endpoint-indən gələn və layihə detallarındakı üzvləri birləşdir
  const combinedMembers = [...(Array.isArray(memberList) ? memberList : []), ...(Array.isArray(rawUzvler) ? rawUzvler : [])];

  return {
    ...base,
    menimRolum,
    uzvler: combinedMembers,
  } as Project;
}

export interface SearchedUser {
  id: number;
  userId?: number;
  username?: string;
  name?: string;
  ad?: string;
  soyad?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Layihəyə əlavə etmək üçün istifadəçiləri axtarır.
 * GET /projects/:projectId/members/axtar?q=...
 */
export async function searchUsers(projectId: number, q?: string): Promise<SearchedUser[]> {
  const query = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  console.log(`[Projects] searchUsers(${projectId}, q='${q ?? ''}') çağırıldı`);
  const res = await apiFetch<any>(`/projects/${projectId}/members/axtar${query}`);
  console.log('[Projects] searchUsers cavabı:', res);
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.users)) return res.users;
  if (Array.isArray(res?.istifadeciler)) return res.istifadeciler;
  if (Array.isArray(res?.members)) return res.members;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

/**
 * Layihəyə yeni üzv əlavə edir.
 * POST /projects/:projectId/members, body { userId, role }
 * role: 2=Menecer, 3=İstifadəçi, 4=Ghost
 */
/**
 * Layihəyə yeni üzv əlavə edir.
 * POST /projects/:projectId/members, body { userId, role }
 * role: 2=Menecer, 3=İstifadəçi, 4=Ghost
 */
export async function addMember(
  projectId: number,
  userId: number,
  role: 2 | 3 | 4
): Promise<any> {
  console.log(`[Projects] addMember(projectId=${projectId}, userId=${userId}, role=${role}) çağırıldı`);
  const res = await apiFetch<any>(`/projects/${projectId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId: Number(userId), role: Number(role) }),
  });
  console.log('[Projects] addMember cavabı:', res);
  return res;
}

/**
 * Layihə üzvünün rolunu dəyişir (PATCH /projects/:projectId/members/:userId)
 * role: 2=Menecer, 3=İstifadəçi, 4=Ghost
 */
export async function updateMemberRole(
  projectId: number,
  userId: number,
  role: 2 | 3 | 4
): Promise<any> {
  console.log(`[Projects] updateMemberRole(projectId=${projectId}, userId=${userId}, role=${role}) çağırıldı`);
  const res = await apiFetch<any>(`/projects/${projectId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: Number(role) }),
  });
  console.log('[Projects] updateMemberRole cavabı:', res);
  return res;
}

/**
 * Layihədən üzvü silir (DELETE /projects/:projectId/members/:userId)
 */
export async function removeMember(
  projectId: number,
  userId: number
): Promise<any> {
  console.log(`[Projects] removeMember(projectId=${projectId}, userId=${userId}) çağırıldı`);
  const res = await apiFetch<any>(`/projects/${projectId}/members/${userId}`, {
    method: 'DELETE',
  });
  console.log('[Projects] removeMember cavabı:', res);
  return res;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  start_at?: string | null;
  end_at?: string | null;
}

/** Yeni layihə yaradır (POST /projects) */
export async function createProject(data: CreateProjectPayload): Promise<Project> {
  console.log('[Projects] createProject() çağırıldı, payload:', data);
  const body: Record<string, any> = {
    name: data.name,
  };
  if (data.description !== undefined && data.description !== null && data.description !== '') {
    body.description = data.description;
  }
  if (data.start_at !== undefined && data.start_at !== null && data.start_at !== '') {
    body.start_at = data.start_at;
  }
  if (data.end_at !== undefined && data.end_at !== null && data.end_at !== '') {
    body.end_at = data.end_at;
  }

  const res = await apiFetch<any>('/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log('[Projects] createProject() cavabı:', res);
  return (res?.layihe ?? res?.project ?? res?.data ?? res) as Project;
}

/**
 * Layihəni bağlayır (POST /projects/:projectId/bagla)
 * Yalnız Menecer üçün; bütün tapşırıqlar bitmiş olmalıdır.
 */
export async function closeProject(projectId: number): Promise<any> {
  console.log(`[Projects] closeProject(${projectId}) çağırıldı`);
  try {
    const res = await apiFetch<any>(`/projects/${projectId}/bagla`, {
      method: 'POST',
    });
    console.log('[Projects] closeProject cavabı:', res);
    return res;
  } catch (err: unknown) {
    console.log('[CloseProject] Backend-in TAM xəta cavabı:', JSON.stringify(err instanceof Error ? { message: err.message, stack: err.stack, ...(err as any) } : err, null, 2));
    throw err;
  }
}

// ─── Tapşırıqlar (Tasks) ──────────────────────────────────────────────────────

/** Task statusu: 1=Açıq, 2=İcrada, 3=Bitib */
export enum TaskStatus {
  Aciq = 1,
  Icrada = 2,
  Bitib = 3,
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.Aciq]: 'Açıq',
  [TaskStatus.Icrada]: 'İcrada',
  [TaskStatus.Bitib]: 'Bitib',
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
  if (Array.isArray(res?.tasks)) return res.tasks;
  if (Array.isArray(res?.tapshiriqlar)) return res.tapshiriqlar;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assigneeId?: number | null;
  start_at?: string | null;
  deadline?: string | null;
  ceki?: number | null;
}

/** Yeni tapşırıq yaradır (POST /projects/:projectId/tasks) */
export async function createTask(projectId: number, data: CreateTaskPayload): Promise<Task> {
  console.log(`[Tasks] createTask(projectId=${projectId}) çağırıldı, daxil olan data:`, data);

  // Backend DTO (class-validator whitelist) üçün təmizlənmiş body:
  // Sahələr: title, description, assigneeId (mütləq camelCase), start_at, deadline, ceki
  const body: Record<string, any> = {
    title: data.title,
  };

  if (data.description !== undefined && data.description !== null && data.description !== '') {
    body.description = data.description;
  }
  if (data.assigneeId !== undefined && data.assigneeId !== null) {
    body.assigneeId = Number(data.assigneeId);
  }
  if (data.start_at !== undefined && data.start_at !== null && data.start_at !== '') {
    body.start_at = data.start_at;
  }
  if (data.deadline !== undefined && data.deadline !== null && data.deadline !== '') {
    body.deadline = data.deadline;
  }
  if (data.ceki !== undefined && data.ceki !== null) {
    body.ceki = Number(data.ceki);
  }

  console.log('[Tasks] createTask() backend-ə göndərilən yekun JSON body:', body);

  const res = await apiFetch<any>(`/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  console.log('[Tasks] createTask() cavabı:', res);
  return (res?.task ?? res?.tapshiriq ?? res?.data ?? res) as Task;
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

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  assigneeId?: number | null;
  start_at?: string | null;
  deadline?: string | null;
  ceki?: number | null;
}

/**
 * Task məlumatlarını yeniləyir (PATCH /projects/:projectId/tasks/:taskId)
 * Yalnız Menecer hüququ ilə çağırılır.
 */
export async function updateTask(
  projectId: number,
  taskId: number,
  data: UpdateTaskPayload
): Promise<Task> {
  console.log(`[Tasks] updateTask(projectId=${projectId}, taskId=${taskId}) çağırıldı:`, data);

  const body: Record<string, any> = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.description !== undefined) body.description = data.description;
  if (data.assigneeId !== undefined) {
    body.assigneeId = data.assigneeId !== null ? Number(data.assigneeId) : null;
  }
  if (data.start_at !== undefined) body.start_at = data.start_at;
  if (data.deadline !== undefined) body.deadline = data.deadline;
  if (data.ceki !== undefined) {
    body.ceki = data.ceki !== null ? Number(data.ceki) : null;
  }

  const res = await apiFetch<any>(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  console.log('[Tasks] updateTask cavabı:', res);
  return (res?.task ?? res?.tapshiriq ?? res?.data ?? res) as Task;
}

/**
 * Taskı silir (DELETE /projects/:projectId/tasks/:taskId)
 * Yalnız Menecer hüququ ilə çağırılır.
 */
export async function deleteTask(projectId: number, taskId: number): Promise<void> {
  console.log(`[Tasks] deleteTask(projectId=${projectId}, taskId=${taskId}) çağırıldı`);
  await apiFetch<unknown>(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
  console.log('[Tasks] Task uğurla silindi');
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

