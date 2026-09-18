import { io, type Socket } from 'socket.io-client';
import { NOTIFY_BASE_URL, type BildirisItem, type BildirisSeviyye, type HedefTipi } from './notifyClient';

const NOTIFY_NAMESPACE = '/notify';
const CIHAZ_ID_KEY = 'azeren_notify_cihaz_id';

let _notifySocket: Socket | null = null;
// qosul eventi yalniz BIR DEFE gonderilib mi? (reconnect-de tekrar gondermemek ucun)
let _qosulGonderildi = false;

/**
 * Cihaz üçün unikal ID əldə edir və ya yaradıb localStorage-da saxlayır.
 */
export function getCihazId(): string {
  try {
    let id = localStorage.getItem(CIHAZ_ID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cihaz-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(CIHAZ_ID_KEY, id);
    }
    return id;
  } catch (err) {
    console.error('[NotifySocket] localStorage oxunarkən xəta:', err);
    return `cihaz-${Date.now()}`;
  }
}

/**
 * http://localhost:4000/notify namespace-ə socket bağlantısı qurur.
 */
export function connectNotifySocket(token: string, cihazId?: string): Socket {
  const resolvedCihazId = cihazId || getCihazId();

  // Socket artıq mövcuddursa
  if (_notifySocket) {
    if (_notifySocket.connected) {
      console.log('[NotifySocket] Artıq bağlıdır, mövcud instans qaytarılır. ID:', _notifySocket.id);
      return _notifySocket;
    } else {
      console.log('[NotifySocket] Socket mövcuddur amma bağlı deyil. connect() çağırılır...');
      _notifySocket.connect();
      return _notifySocket;
    }
  }

  _qosulGonderildi = false;
  const socketUrl = `${NOTIFY_BASE_URL}${NOTIFY_NAMESPACE}`;
  console.log(`[NotifySocket] Yeni socket yaranır → ${socketUrl}, cihazId: ${resolvedCihazId}`);

  _notifySocket = io(socketUrl, {
    auth: {
      token,
      cihazId: resolvedCihazId,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  _notifySocket.on('connect', () => {
    console.log('[NotifySocket] Status dəyişdi:', 'connected=' + _notifySocket?.connected, 'id=' + _notifySocket?.id);
    console.log(`[NotifySocket] Uğurla qoşuldu, id=${_notifySocket?.id}`);

    // qosul YALNIZ BIR DƏFƏ göndərilir (reconnect-də təkrar göndərməmək üçün)
    if (!_qosulGonderildi) {
      _qosulGonderildi = true;
      console.log('[NotifySocket] qosul eventi göndərilir (ilk dəfə), cihazId:', resolvedCihazId);
      _notifySocket?.emit('qosul', { cihazId: resolvedCihazId }, (ack: any) => {
        console.log('[NotifySocket] qosul ACK cavabı:', ack);
      });
    } else {
      console.log('[NotifySocket] Reconnect oldu, qosul artıq göndərilib, keçilir');
    }

    // Diaqnostika: test event
    setTimeout(() => {
      if (_notifySocket && _notifySocket.connected) {
        _notifySocket.emit('test', { ping: 1 }, (ack) => {
          console.log('[NotifySocket] TEST event ACK alındı:', JSON.stringify(ack));
        });
      }
    }, 500);
  });

  _notifySocket.on('connect_error', (err) => {
    console.error('[NotifySocket] Status dəyişdi:', 'connected=' + _notifySocket?.connected, 'id=' + _notifySocket?.id);
    console.error('[NotifySocket] Qoşulma xətası:', err.message);
  });

  _notifySocket.on('disconnect', (reason) => {
    console.log('[NotifySocket] DISCONNECT, səbəb:', reason, 'vaxt:', new Date().toISOString());
    console.log('[NotifySocket] Status dəyişdi:', 'connected=' + _notifySocket?.connected, 'id=' + _notifySocket?.id);

    // 'io server disconnect' — server özü kəsibsə (məs. auth və ya təkrar sessiya)
    // Socket.io bu səbəbdə avtomatik reconnect etmir, ona görə manual connect() çağırırıq:
    if (reason === 'io server disconnect') {
      console.warn('[NotifySocket] Server tərəfindən kəsildi — 1 saniyə sonra yenidən connect() cəhdi edilir...');
      setTimeout(() => {
        if (_notifySocket && !_notifySocket.connected) {
          _notifySocket.connect();
        }
      }, 1000);
    }
  });

  // Reconnection lifecycle logları
  _notifySocket.io.on('reconnect_attempt', (attempt) => {
    console.log('[NotifySocket] Reconnect cəhdi #' + attempt);
  });
  _notifySocket.io.on('reconnect', (attempt) => {
    console.log('[NotifySocket] Reconnect uğurlu oldu #' + attempt);
  });

  return _notifySocket;
}

export function disconnectNotifySocket(): void {
  if (_notifySocket) {
    console.log('[NotifySocket] Ayrılır...');
    _notifySocket.removeAllListeners();
    _notifySocket.disconnect();
    _notifySocket = null;
    _qosulGonderildi = false;
  }
}

export function getNotifySocket(): Socket | null {
  return _notifySocket;
}

/** getNotifySocket üçün qısa alias */
export const getSocket = getNotifySocket;

/**
 * Bildiriş göndərir: socket.emit('bildirisGonder', {...})
 * ACK cavabını Promise kimi qaytarır.
 */
export function sendBildiris(
  hedefTipi: HedefTipi,
  hedefId: string | number | null,
  mesaj: string,
  seviyye: BildirisSeviyye
): Promise<{ success: boolean; message?: string }> {
  return new Promise((resolve, reject) => {
    if (!_notifySocket || !_notifySocket.connected) {
      const msg = '[NotifySocket] Socket qoşulmayıb, bildirisGonder göndərilə bilmədi';
      console.warn(msg);
      return reject(new Error(msg));
    }

    console.log('[notifySocket] sendBildiris çağırıldı, socket bağlıdırmı:', _notifySocket.connected);
    console.log('[notifySocket] emit edilir:', { hedefTipi, hedefId, mesaj, seviyye });
    _notifySocket.emit(
      'bildirisGonder',
      { hedefTipi, hedefId, mesaj, seviyye },
      (ack: { success: boolean; message?: string } | undefined) => {
        console.log('[notifySocket] ACK cavabı gəldi:', ack);
        if (ack?.success === false) {
          console.warn('[NotifySocket] bildirisGonder ACK xətası:', ack.message);
          reject(new Error(ack.message ?? 'Bildiriş göndərilmədi'));
        } else {
          resolve(ack ?? { success: true });
        }
      }
    );
  });
}

/**
 * Yeni bildiriş hadisəsini dinləyir.
 */
export function onYeniBildiris(callback: (data: BildirisItem) => void): () => void {
  if (!_notifySocket) {
    console.warn('[NotifySocket] Dinləyici qoşularkən socket mövcud deyildi');
  }

  console.log('[notifySocket] onYeniBildiris qeydiyyatdan keçdi, socket:', _notifySocket?.id ?? 'yoxdur');

  const handler = (data: any) => {
    console.log('[NotifySocket] yeniBildiris hadisəsi alındı:', data);
    callback(data);
  };

  _notifySocket?.on('yeniBildiris', handler);

  return () => {
    _notifySocket?.off('yeniBildiris', handler);
  };
}

/**
 * Bildirişi silir: socket.emit('bildirisSil', { bildirisId })
 * ACK cavabını və ya server hadisəsini Promise kimi qaytarır.
 */
export function deleteBildiris(
  bildirisId: string | number
): Promise<{ success: boolean; message?: string }> {
  return new Promise((resolve, reject) => {
    if (!_notifySocket || !_notifySocket.connected) {
      const msg = '[NotifySocket] Socket qoşulmayıb, bildirisSil göndərilə bilmədi';
      console.warn(msg);
      return reject(new Error(msg));
    }

    const idStr = String(bildirisId);
    console.log('[notifySocket] deleteBildiris çağırıldı, bildirisId:', idStr);

    let isDone = false;

    const cleanup = () => {
      _notifySocket?.off('bildirisSilindi', handleSilindi);
      _notifySocket?.off('xeta', handleXeta);
    };

    const handleSilindi = (data: any) => {
      const targetId = data?.bildirisId ?? data?.id;
      if (String(targetId) === idStr) {
        if (!isDone) {
          isDone = true;
          cleanup();
          resolve({ success: true });
        }
      }
    };

    const handleXeta = (data: any) => {
      if (!isDone) {
        isDone = true;
        cleanup();
        reject(new Error(data?.mesaj || data?.message || 'Bildiriş silinərkən xəta baş verdi'));
      }
    };

    _notifySocket.on('bildirisSilindi', handleSilindi);
    _notifySocket.on('xeta', handleXeta);

    _notifySocket.emit(
      'bildirisSil',
      { bildirisId: idStr },
      (ack: { success?: boolean; ugurlu?: boolean; message?: string } | undefined) => {
        console.log('[notifySocket] bildirisSil ACK cavabı:', ack);
        if (ack?.success === false) {
          if (!isDone) {
            isDone = true;
            cleanup();
            reject(new Error(ack.message ?? 'Bildiriş silinmədi'));
          }
        } else if (ack?.success === true || ack?.ugurlu === true) {
          if (!isDone) {
            isDone = true;
            cleanup();
            resolve({ success: true });
          }
        }
      }
    );

    // 5 saniyəlik timeout təhlükəsizliyi
    setTimeout(() => {
      if (!isDone) {
        isDone = true;
        cleanup();
        resolve({ success: true });
      }
    }, 5000);
  });
}

/**
 * Bildiriş silindi hadisəsini dinləyir.
 */
export function onBildirisSilindi(
  callback: (data: { id?: string | number; bildirisId?: string | number }) => void
): () => void {
  const handler = (data: any) => {
    console.log('[NotifySocket] bildirisSilindi hadisəsi alındı:', data);
    const resolvedId = data?.id ?? data?.bildirisId;
    callback({ ...data, id: resolvedId, bildirisId: resolvedId });
  };

  _notifySocket?.on('bildirisSilindi', handler);

  return () => {
    _notifySocket?.off('bildirisSilindi', handler);
  };
}

/**
 * Sessiya bağlandı hadisəsini dinləyir (başqa cihaz daxil olduqda və s.).
 */
export function onSessiyaBaglandi(callback: (data: any) => void): () => void {
  const handler = (data: any) => {
    console.log('[NotifySocket] sessiyaBaglandi hadisəsi alındı:', data);
    callback(data);
  };

  _notifySocket?.on('sessiyaBaglandi', handler);

  return () => {
    _notifySocket?.off('sessiyaBaglandi', handler);
  };
}

/**
 * Onlayn istifadəçilər siyahısının yenilənməsini dinləyir (presenceYenilendi və ya onlineSiyahi).
 */
export function onPresenceUpdated(
  callback: (onlineUsers: Array<{ id: string; adSoyad: string; rol: string }>) => void,
): () => void {
  const handler = (data: any) => {
    console.log('[NotifySocket] presence hadisəsi alındı:', data);
    callback(Array.isArray(data) ? data : []);
  };

  _notifySocket?.on('presenceYenilendi', handler);
  _notifySocket?.on('onlineSiyahi', handler);

  return () => {
    _notifySocket?.off('presenceYenilendi', handler);
    _notifySocket?.off('onlineSiyahi', handler);
  };
}

