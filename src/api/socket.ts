/**
 * src/api/socket.ts
 * Socket.io /chat namespace bağlantısını idarə edən modul.
 *
 * İstifadə:
 *   import { connectSocket, disconnectSocket } from './api/socket';
 *   connectSocket(token);   // login-dən sonra
 *   disconnectSocket();     // logout-dan sonra
 */

import { io, type Socket } from 'socket.io-client';

const SOCKET_URL       = 'https://pms.azerenerji.az';
const SOCKET_NAMESPACE = '/chat';

/** Aktiv socket instansı (yalnız bu modul daxilində idarə edilir) */
let _socket: Socket | null = null;

// ─── Bağlan ───────────────────────────────────────────────────────────────────

/**
 * /chat namespace-ə qoşulur.
 * @param token  Login-dən alınan Bearer access token
 *
 * Auth strategiyası:
 *  - `auth.token`  → backend socket middleware-i buradan oxuyur (Bearer)
 *  - `withCredentials: true` → httpOnly cookie-ni də göndərir
 *  İki kanal eyni anda aktiv olur; backend hansını tanıyırsa qəbul edir.
 */
export function connectSocket(token: string): Socket {
  // Əgər artıq bağlıdırsa eyni instansı qaytar
  if (_socket?.connected) {
    console.log('[Socket] Artıq bağlıdır, mövcud instans qaytarılır');
    return _socket;
  }

  // Köhnə, bağlı olmayan instansı təmizlə
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  console.log(`[Socket] Bağlanılır → ${SOCKET_URL}${SOCKET_NAMESPACE}`);

  _socket = io(`${SOCKET_URL}${SOCKET_NAMESPACE}`, {
    // ── Auth ──────────────────────────────────────────────
    auth: { token },              // socket.handshake.auth.token (Bearer)
    withCredentials: true,        // httpOnly cookie-ni də göndər

    // ── Transport ─────────────────────────────────────────
    transports: ['websocket', 'polling'],  // əvvəlcə WS, düşərsə polling

    // ── Yenidən bağlanma siyasəti ─────────────────────────
    reconnection:        true,
    reconnectionAttempts: 10,
    reconnectionDelay:   1500,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.4,

    // ── Timeout ───────────────────────────────────────────
    timeout: 10000,
  });

  // ── Hadisə logları ──────────────────────────────────────────────────────────

  _socket.on('connect', () => {
    console.log(`[Socket] ✅ Bağlandı  | id=${_socket?.id} | namespace=${SOCKET_NAMESPACE}`);
  });

  _socket.on('disconnect', (reason) => {
    console.warn(`[Socket] ⚠️  Bağlantı kəsildi | reason="${reason}"`);
    if (reason === 'io server disconnect') {
      // Server özü kəsibsə manual yenidən qoşul
      console.log('[Socket] Server tərəfindən kəsildi — yenidən qoşulunur...');
      _socket?.connect();
    }
  });

  _socket.on('connect_error', (err) => {
    console.error(`[Socket] ❌ Bağlantı xətası | ${err.message}`);
    // Əlavə context (socket.io v4+ bəzi xətalarda data göndərir)
    if ('data' in err) {
      console.error('[Socket] Xəta datası:', (err as Error & { data?: unknown }).data);
    }
  });

  _socket.on('xeta', (payload: unknown) => {
    console.error('[Socket] 🔴 Server "xeta" hadisəsi:', payload);
  });

  // Əgər socket qoşulmazdan əvvəl onNewNotification qeydiyyatdan keçibsə, dinləyiciləri bağla
  for (const cb of _notificationCallbacks) {
    _socket.on('yeniNotification', (data: unknown) => {
      console.log('[Socket] 🔔 yeniNotification hadisəsi gəldi:', data);
      cb(data);
    });
  }

  return _socket;
}

// ─── Ayır ────────────────────────────────────────────────────────────────────

/**
 * Aktiv socket bağlantısını bağlayır və instansı təmizləyir.
 * Logout-dan sonra çağırılmalıdır.
 */
export function disconnectSocket(): void {
  if (!_socket) {
    console.log('[Socket] Ayırmaq üçün aktiv bağlantı yoxdur');
    return;
  }
  console.log('[Socket] Bağlantı manuel ayrılır...');
  _socket.removeAllListeners();
  _socket.disconnect();
  _socket = null;
  console.log('[Socket] Bağlantı ayrıldı');
}

// ─── Köməkçi getter ──────────────────────────────────────────────────────────

/**
 * Aktiv socket instansını qaytarır.
 * Chat hadisələrinə abunə olmaq üçün istifadə edilir.
 * Bağlantı yoxdursa null qaytarır.
 */
export function getSocket(): Socket | null {
  return _socket;
}

/**
 * Socket hazırda bağlıdırmı?
 */
export function isSocketConnected(): boolean {
  return _socket?.connected ?? false;
}

// ─── Chat socket funksiyaları ─────────────────────────────────────────────────

/** sendMessage ACK cavabının strukturu */
export interface SendMessageAck {
  ok: boolean;
  mesajId?: number;
  error?: string;
}

/**
 * Layihə chatına mətn mesajı göndərir.
 * @returns ACK cavabı — { ok: true, mesajId } və ya { ok: false, error }
 */
export function sendMessage(
  projectId: number,
  message: string,
): Promise<SendMessageAck> {
  return new Promise((resolve, reject) => {
    if (!_socket?.connected) {
      reject(new Error('Socket bağlı deyil'));
      return;
    }
    console.log(`[Socket] mesajGonder → project=${projectId}`);
    _socket.emit(
      'mesajGonder',
      { projectId, message },
      (ack: SendMessageAck) => {
        console.log('[Socket] mesajGonder ACK:', ack);
        resolve(ack);
      },
    );
  });
}

/**
 * Yeni mesaj hadisəsinə abunə olur.
 * @param callback  Hər yeni mesajda çağırılır
 * @returns  Abunəliyi ləğv edən funksiya (unsubscribe)
 */
export function onNewMessage(
  callback: (mesaj: unknown) => void,
): () => void {
  if (!_socket) {
    console.warn('[Socket] onNewMessage: socket yoxdur');
    return () => {};
  }
  _socket.on('yeniMesaj', callback);
  console.log('[Socket] yeniMesaj dinləyicisi qeydiyyata alındı');

  return () => {
    _socket?.off('yeniMesaj', callback);
    console.log('[Socket] yeniMesaj dinləyicisi silindi');
  };
}

/**
 * Layihə chat otağına qoşulur — serverə bildiriş gedir.
 * ChatPanel mount olanda çağırılır.
 */
export function joinProject(projectId: number): void {
  if (!_socket?.connected) {
    console.warn('[Socket] joinProject: socket bağlı deyil');
    return;
  }
  console.log(`[Socket] proyekteQosul → project=${projectId}`);
  _socket.emit('proyekteQosul', { projectId });
}

/**
 * Layihə chat otağından çıxır.
 * ChatPanel unmount olanda çağırılır.
 */
export function leaveProject(projectId: number): void {
  if (!_socket?.connected) {
    console.warn('[Socket] leaveProject: socket bağlı deyil');
    return;
  }
  console.log(`[Socket] proyektdenCix → project=${projectId}`);
  _socket.emit('proyektdenCix', { projectId });
}

// ─── Yazır... (Typing) göstəricisi ───────────────────────────────────────────

/**
 * İstifadəçinin yazıb-yazmadığını serverə bildirir.
 * @param projectId Layihə ID-si
 * @param aktiv true olduqda yazır, false olduqda dayandırdı
 */
export function sendTyping(projectId: number, aktiv: boolean): void {
  console.log('[Chat] sendTyping göndərilir:', aktiv);
  if (!_socket?.connected) return;
  _socket.emit('yaziriq', { projectId, tip: 'metn', aktiv });
}

export interface TypingData {
  projectId: number;
  userId?: number;
  istifadeciId?: number;
  userName?: string;
  istifadeciAd?: string;
  name?: string;
  ad?: string;
  tip?: string;
  aktiv?: boolean;
}

/**
 * Layihədə başqa birinin "yazır..." vəziyyətinə abunə olur.
 * @param callback Gələn typing məlumatını qəbul edir
 * @returns Abunəliyi ləğv edən funksiya (unsubscribe)
 */
export function onSomeoneTyping(
  callback: (data: TypingData) => void,
): () => void {
  if (!_socket) {
    console.warn('[Socket] onSomeoneTyping: socket yoxdur');
    return () => {};
  }
  _socket.on('kimseYazir', callback);
  console.log('[Socket] kimseYazir dinləyicisi qeydiyyata alındı');

  return () => {
    _socket?.off('kimseYazir', callback);
    console.log('[Socket] kimseYazir dinləyicisi silindi');
  };
}

// ─── Oxundu (Read) statusu ───────────────────────────────────────────────────

/**
 * Mesajların oxunduğunu serverə bildirir.
 * @param projectId Layihə ID-si
 * @param sonOxunanId Ən son oxunan mesajın ID-si
 */
export function markAsRead(projectId: number, sonOxunanId: number): void {
  if (!_socket?.connected) {
    console.warn(`[Socket] markAsRead xətası: socket bağlı deyil (project=${projectId}, sonOxunanId=${sonOxunanId})`);
    return;
  }
  console.log(`[Socket] oxundu emit edilir → project=${projectId}, sonOxunanId=${sonOxunanId}`);
  _socket.emit('oxundu', { projectId, sonOxunanId });
}

/**
 * Mesaj yeniləndikdə (məs. oxunma statusu ✓✓ dəyişəndə və ya redaktə/silinmə) tetiklenir.
 * @param callback Yenilənmiş mesaj obyektini qəbul edir
 * @returns Abunəliyi ləğv edən funksiya (unsubscribe)
 */
export function onMessageUpdated(
  callback: (mesaj: unknown) => void,
): () => void {
  if (!_socket) {
    console.warn('[Socket] onMessageUpdated: socket yoxdur');
    return () => {};
  }
  const handler = (data: unknown) => {
    console.log('[Chat] mesajYenilendi gəldi:', data);
    callback(data);
  };
  _socket.on('mesajYenilendi', handler);
  console.log('[Socket] mesajYenilendi dinləyicisi qeydiyyata alındı');

  return () => {
    _socket?.off('mesajYenilendi', handler);
    console.log('[Socket] mesajYenilendi dinləyicisi silindi');
  };
}

// ─── Onlayn istifadəçilər (Presence) ─────────────────────────────────────────

export interface PresenceData {
  userId?: number;
  istifadeciId?: number;
  online?: boolean;
  status?: string;
  [key: string]: unknown;
}

/**
 * Layihə otağına daxil olduqda serverdən cari onlayn istifadəçilərin siyahısını dinləyir.
 */
export function onOnlineListReceived(
  callback: (onlineUserIds: number[]) => void,
): () => void {
  if (!_socket) {
    console.warn('[Socket] onOnlineListReceived: socket yoxdur');
    return () => {};
  }
  const handler = (data: any) => {
    console.log('[Chat] onlineSiyahi gəldi:', JSON.stringify(data));
    let list: number[] = [];
    if (Array.isArray(data)) {
      list = data.map((x: any) => (typeof x === 'object' ? Number(x.userId ?? x.id ?? x.istifadeciId) : Number(x))).filter(Boolean);
    } else if (Array.isArray(data?.onlineUserIds)) {
      list = data.onlineUserIds.map((x: any) => Number(x)).filter(Boolean);
    } else if (Array.isArray(data?.istifadeciler)) {
      list = data.istifadeciler.map((x: any) => (typeof x === 'object' ? Number(x.userId ?? x.id ?? x.istifadeciId) : Number(x))).filter(Boolean);
    }
    callback(list);
  };

  _socket.on('onlineSiyahi', handler);
  console.log('[Socket] onlineSiyahi dinləyicisi qeydiyyata alındı');

  return () => {
    _socket?.off('onlineSiyahi', handler);
    console.log('[Socket] onlineSiyahi dinləyicisi silindi');
  };
}

/**
 * İstifadəçi online və ya offline olduqda server presenceYenilendi hadisəsi göndərir.
 */
export function onPresenceUpdated(
  callback: (presence: PresenceData) => void,
): () => void {
  if (!_socket) {
    console.warn('[Socket] onPresenceUpdated: socket yoxdur');
    return () => {};
  }
  const handler = (data: any) => {
    console.log('[Chat] presenceYenilendi:', JSON.stringify(data));
    callback(data);
  };

  _socket.on('presenceYenilendi', handler);
  console.log('[Socket] presenceYenilendi dinləyicisi qeydiyyata alındı');

  return () => {
    _socket?.off('presenceYenilendi', handler);
    console.log('[Socket] presenceYenilendi dinləyicisi silindi');
  };
}

// ─── Bildirişlər (Notifications) ──────────────────────────────────────────────

/**
 * Real-time yeni bildiriş hadisəsinə abunə olur.
 * Backend `yeniNotification` hadisəsi göndərdikdə callback çağırılır.
 * Əvvəlcə /chat socket-i dinlənir; eyni zamanda root namespace instansı varsa onda da qeydiyyatdan keçirilir.
 */
let _notificationCallbacks: Array<(notification: unknown) => void> = [];

export function onNewNotification(
  callback: (notification: unknown) => void,
): () => void {
  _notificationCallbacks.push(callback);
  console.log('[Socket] onNewNotification abunəçi əlavə edildi, cəmi:', _notificationCallbacks.length);

  const handler = (data: unknown) => {
    console.log('[Socket] 🔔 yeniNotification hadisəsi gəldi:', data);
    callback(data);
  };

  if (_socket) {
    _socket.on('yeniNotification', handler);
    console.log('[Socket] /chat namespace-də yeniNotification dinləyicisi qeydiyyata alındı');
  } else {
    console.warn('[Socket] onNewNotification: _socket hələ aktiv deyil, callback yaddaşda saxlanıldı');
  }

  return () => {
    _notificationCallbacks = _notificationCallbacks.filter(cb => cb !== callback);
    _socket?.off('yeniNotification', handler);
    console.log('[Socket] yeniNotification dinləyicisi silindi');
  };
}

