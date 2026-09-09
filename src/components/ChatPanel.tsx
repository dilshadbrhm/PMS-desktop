import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getChatHistory,
  uploadFile,
  uploadVoice,
  getFileBlobUrl,
  getVoiceBlobUrl,
  type ChatMesaj,
  type ChatMember,
} from '../api/client';
import {
  sendMessage,
  onNewMessage,
  joinProject,
  leaveProject,
  sendTyping,
  onSomeoneTyping,
  markAsRead,
  onMessageUpdated,
  onOnlineListReceived,
  onPresenceUpdated,
  type TypingData,
  type PresenceData,
} from '../api/socket';
import './ChatPanel.css';

interface Props {
  projectId: number;
  /** Cari giriş etmiş istifadəçinin ID-si — öz mesajlarını sağa sıralamaq üçün */
  currentUserId: number;
  /** Əlavə ehtiyat üçün ProjectDetailPage-dən gələn üzv siyahısı */
  projectMembers?: Array<{ id: number; name?: string; ad?: string; soyad?: string; [key: string]: unknown }>;
}

// ─── Vaxt formatı (Hər mesajda tam tarix + saat) ──────────────────────────────
// Format nümunəsi: "8 Sen 2026, 14:23"
const MONTH_NAMES_AZ = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn',
  'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek',
];

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const day = d.getDate();
    const month = MONTH_NAMES_AZ[d.getMonth()] || '';
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${mins}`;
  } catch {
    return '';
  }
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─── Oxundu ikonları (✓ / ✓✓) ─────────────────────────────────────────────────

function ReadReceipt({ mesaj }: { mesaj: ChatMesaj }) {
  const rawStatus = (mesaj as any).oxunmaVeziyyeti;
  const isRead =
    rawStatus === 'oxundu' ||
    (Array.isArray(rawStatus) && rawStatus.length > 0) ||
    Boolean((mesaj as any).oxundu) ||
    Boolean((mesaj as any).isRead);

  if (isRead) {
    return (
      <span className="cp-receipt cp-receipt--read" title="Oxundu (✓✓)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L7 17l-5-5" />
          <path d="M22 10l-7.5 7.5-2-2" />
        </svg>
      </span>
    );
  }

  return (
    <span className="cp-receipt cp-receipt--sent" title="Göndərildi (✓)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
}

// ─── Fayl Yükləmə / Göstərmə Düyməsi ──────────────────────────────────────────

function FileAttachment({ projectId, mesaj }: { projectId: number; mesaj: ChatMesaj }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blobUrl = await getFileBlobUrl(projectId, mesaj.id);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = mesaj.fileName || `fayl_${mesaj.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[Chat] Fayl yüklənmə xətası:', err);
      alert('Fayl yüklənərkən xəta baş verdi');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="cp-file-card">
      <div className="cp-file-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <div className="cp-file-info">
        <span className="cp-file-name" title={mesaj.fileName || ''}>{mesaj.fileName || 'Fayl'}</span>
        {mesaj.fileSize && <span className="cp-file-size">{formatBytes(mesaj.fileSize)}</span>}
      </div>
      <button
        className="cp-file-btn"
        onClick={handleDownload}
        disabled={downloading}
        title="Endir"
      >
        {downloading ? (
          <span className="cp-btn-spinner" />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ─── Səs Mesajı Pleyeri ───────────────────────────────────────────────────────

function VoicePlayer({ projectId, mesaj }: { projectId: number; mesaj: ChatMesaj }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    async function loadAudio() {
      setLoading(true);
      setError(false);
      try {
        const url = await getVoiceBlobUrl(projectId, mesaj.id);
        if (active) {
          createdUrl = url;
          setAudioUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error('[Chat] Səs faylını yükləmək olmadı:', e);
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAudio();

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [projectId, mesaj.id]);

  if (loading) {
    return (
      <div className="cp-voice-loader">
        <span className="cp-btn-spinner" />
        <span>Səs yazısı yüklənir...</span>
      </div>
    );
  }

  if (error || !audioUrl) {
    return <div className="cp-voice-error">⚠️ Səs oxunmadı</div>;
  }

  return (
    <div className="cp-voice-player">
      <audio controls src={audioUrl} preload="metadata" />
      {mesaj.muddet != null && <span className="cp-voice-time">{mesaj.muddet} san</span>}
    </div>
  );
}

// ─── Tək mesaj köpüyü ─────────────────────────────────────────────────────────

function MessageBubble({
  mesaj,
  isMine,
  projectId,
  isSenderOnline,
}: {
  mesaj: ChatMesaj;
  isMine: boolean;
  projectId: number;
  isSenderOnline?: boolean;
}) {
  const isDeleted = mesaj.silinib;
  const isEdited  = !!mesaj.editedAt;

  return (
    <div className={`cp-bubble-wrap ${isMine ? 'cp-mine' : 'cp-theirs'}`}>
      {/* Göndərən adı (başqalarının mesajlarında) + onlayn olduqda yaşıl nöqtə */}
      {!isMine && (
        <span className="cp-sender-name">
          {isSenderOnline && <span className="cp-sender-dot" title="Onlayn" />}
          {mesaj.senderName}
        </span>
      )}

      <div className={`cp-bubble ${isMine ? 'cp-bubble--mine' : 'cp-bubble--theirs'} ${isDeleted ? 'cp-bubble--deleted' : ''}`}>
        {/* Fayl mesajı */}
        {mesaj.mesajNovu === 'fayl' && !isDeleted && (
          <FileAttachment projectId={projectId} mesaj={mesaj} />
        )}

        {/* Səs mesajı */}
        {mesaj.mesajNovu === 'ses' && !isDeleted && (
          <VoicePlayer projectId={projectId} mesaj={mesaj} />
        )}

        {/* Mətn */}
        {isDeleted ? (
          <span className="cp-deleted-text">🚫 Mesaj silindi</span>
        ) : (
          mesaj.message && <p className="cp-text">{mesaj.message}</p>
        )}

        {/* Vaxt + redaktə + oxundu statusu */}
        <div className="cp-meta">
          {isEdited && <span className="cp-edited">redaktə</span>}
          <span className="cp-time">{fmtTime(mesaj.createdAt)}</span>
          {mesaj.isPrivate && (
            <span className="cp-private-badge" title="Şəxsi mesaj">🔒</span>
          )}
          {isMine && <ReadReceipt mesaj={mesaj} />}
        </div>
      </div>
    </div>
  );
}

// ─── Əsas komponent ───────────────────────────────────────────────────────────

export default function ChatPanel({ projectId, currentUserId, projectMembers }: Props) {
  const [messages,    setMessages]    = useState<ChatMesaj[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState('');
  const [inputText,   setInputText]   = useState('');
  const [sending,     setSending]     = useState(false);
  const [sendError,   setSendError]   = useState('');

  // Üzvlər xəritəsi (ID -> Ad)
  const [membersMap, setMembersMap]   = useState<Map<number, string>>(new Map());
  const membersMapRef = useRef<Map<number, string>>(membersMap);
  useEffect(() => {
    membersMapRef.current = membersMap;
  }, [membersMap]);

  // Onlayn istifadəçilər (ID Set)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

  // 1. "Yazır..." göstəricisi state (ID -> Ad)
  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(new Map());
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef    = useRef<boolean>(false);

  // 3. Səs yazma state
  const [recording,       setRecording]       = useState(false);
  const [recordSeconds,   setRecordSeconds]   = useState(0);
  const mediaRecorderRef                      = useRef<MediaRecorder | null>(null);
  const audioChunksRef                        = useRef<Blob[]>([]);
  const recordIntervalRef                     = useRef<NodeJS.Timeout | null>(null);

  // Fayl input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);

  // Prop kimi gələn projectMembers-i üzv xəritəsinə qat
  useEffect(() => {
    if (projectMembers && projectMembers.length > 0) {
      setMembersMap(prev => {
        const next = new Map(prev);
        for (const m of projectMembers) {
          const uId = Number((m as any).userId ?? m.id ?? (m as any).istifadeciId);
          const name = m.name || (m.ad && m.soyad ? `${m.ad} ${m.soyad}` : (m.ad || ''));
          if (uId && name) next.set(uId, name);
        }
        return next;
      });
    }
  }, [projectMembers]);

  // ── Tarixçəni yüklə ────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await getChatHistory(projectId);
      setMessages(result.mesajlar);

      // Üzvlər siyahısını xəritəyə əlavə et
      if (result.uzvler && result.uzvler.length > 0) {
        setMembersMap(prev => {
          const next = new Map(prev);
          for (const u of result.uzvler) {
            const uId = Number((u as any).userId ?? u.id ?? (u as any).istifadeciId);
            const name = u.name || (u.ad && u.soyad ? `${u.ad} ${u.soyad}` : (u.ad || ''));
            if (uId && name) next.set(uId, name);
          }
          return next;
        });
      }

      // Siyahı yüklənəndə ən son mesaj varsa oxundu göndər
      if (result.mesajlar.length > 0) {
        const lastMsg = result.mesajlar[result.mesajlar.length - 1];
        if (lastMsg?.id) {
          const sonMesajId = Number(lastMsg.id);
          console.log('[Chat] markAsRead çağırıldı, sonOxunanId:', sonMesajId);
          markAsRead(projectId, sonMesajId);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Chat tarixçəsi yüklənmədi';
      setLoadError(msg);
      console.error('[ChatPanel] Tarixçə xətası:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // ── Mount / Socket dinləyiciləri ────────────────────────────────────────────

  useEffect(() => {
    loadHistory();
    joinProject(projectId);

    // 1. Yeni mesajlara qulaq as
    const unsubNewMsg = onNewMessage((raw) => {
      const mesaj = raw as ChatMesaj;
      console.log('[Chat] onNewMessage:', mesaj);
      if (Number(mesaj.projectId) !== projectId) return;

      setMessages(prev => {
        if (prev.some(m => Number(m.id) === Number(mesaj.id))) return prev;
        return [...prev, mesaj];
      });

      // Mesaj göndərən adı xəritədə yoxdursa əlavə et
      if (mesaj.senderId && mesaj.senderName) {
        const sId = Number(mesaj.senderId);
        setMembersMap(prev => {
          if (!prev.has(sId)) {
            const next = new Map(prev);
            next.set(sId, mesaj.senderName);
            return next;
          }
          return prev;
        });
      }

      // Yeni gələn mesaj olduqda serverə oxundu işarəsi vur
      if (mesaj.id) {
        const sonMesajId = Number(mesaj.id);
        console.log('[Chat] markAsRead çağırıldı, sonOxunanId:', sonMesajId);
        markAsRead(projectId, sonMesajId);
      }
    });

    // 2. Mesaj yenilənmələri (oxundu ✓✓, redaktə, silinmə)
    const unsubMsgUpdated = onMessageUpdated((raw: any) => {
      console.log('[Chat] mesajYenilendi RAW payload:', JSON.stringify(raw));
      if (!raw) return;

      // Tək mesaj obyekti yaxud oxunma hadisəsi
      const targetId = Number(raw.id ?? raw.mesajId ?? raw.messageId);

      setMessages(prev => {
        if (targetId) {
          return prev.map(m => {
            if (Number(m.id) === targetId) {
              const prevOxunma = Array.isArray(m.oxunmaVeziyyeti) ? m.oxunmaVeziyyeti : [];
              const rawOxunma = raw.oxunmaVeziyyeti;

              let newOxunma = prevOxunma;
              if (Array.isArray(rawOxunma)) {
                newOxunma = rawOxunma;
              } else if (rawOxunma === 'oxundu' || raw.oxuyanId) {
                newOxunma = raw.oxuyanId
                  ? [...prevOxunma, { oxuyanId: Number(raw.oxuyanId), oxunduAt: new Date().toISOString() }]
                  : [{ oxuyanId: 1, oxunduAt: new Date().toISOString() }];
              }

              return {
                ...m,
                ...raw,
                oxunmaVeziyyeti: rawOxunma === 'oxundu' ? 'oxundu' : (newOxunma.length > 0 ? newOxunma : [{ oxuyanId: 1, oxunduAt: new Date().toISOString() }]),
                oxundu: raw.oxundu ?? (rawOxunma === 'oxundu' ? true : m.oxundu),
              };
            }
            return m;
          });
        }

        // Əgər backend { sonOxunanId, oxuyanId } kimi toplu oxunma göndəribsə:
        const sonId = Number(raw.sonOxunanId ?? raw.lastReadId);
        if (sonId) {
          return prev.map(m => {
            if (Number(m.id) <= sonId && Number(m.senderId) === Number(currentUserId)) {
              const prevOxunma = Array.isArray(m.oxunmaVeziyyeti) ? m.oxunmaVeziyyeti : [];
              return {
                ...m,
                oxunmaVeziyyeti: 'oxundu',
                oxundu: true,
              };
            }
            return m;
          });
        }

        return prev;
      });
    });

    // 3. "Yazır..." hadisəsi
    const unsubTyping = onSomeoneTyping((data: TypingData) => {
      console.log('[Chat] kimseYazir RAW payload:', JSON.stringify(data));
      if (Number(data.projectId) !== Number(projectId)) return;
      const uId = Number((data as any).userId ?? (data as any).istifadeciId ?? (data as any).senderId ?? (data as any).id ?? 0);

      // Cari istifadəçinin öz typing-i göstərilməsin
      if (uId && uId === Number(currentUserId)) return;

      // Adı müəyyən et: data payload-dan və ya üzvlər xəritəsindən
      setTypingUsers(prev => {
        const next = new Map(prev);
        const isAktiv = (data as any).aktiv !== false && (data as any).isTyping !== false;
        if (isAktiv) {
          const payloadAdSoyad =
            (data as any).adSoyad ||
            ((data as any).ad && (data as any).soyad ? `${(data as any).ad} ${(data as any).soyad}` : '');

          const knownName =
            payloadAdSoyad ||
            (data as any).userName ||
            (data as any).istifadeciAd ||
            (data as any).name ||
            (data as any).ad ||
            (uId ? membersMapRef.current.get(uId) : '');

          // Əgər ad tapılmasa, heç nə göstərmə (generic "İstifadəçi" göstərmə)
          if (knownName && knownName.trim()) {
            next.set(uId || 999999, knownName.trim());
          }
        } else {
          next.delete(uId || 999999);
        }
        return next;
      });
    });

    // 4. Onlayn istifadəçilər siyahısı
    const unsubOnlineList = onOnlineListReceived((ids: number[]) => {
      setOnlineUserIds(new Set(ids.map(Number)));
    });

    // 5. Tək istifadəçinin presence dəyişməsi
    const unsubPresence = onPresenceUpdated((presence: PresenceData) => {
      const uId = Number(presence.userId ?? presence.istifadeciId ?? 0);
      if (!uId) return;

      const isOnline = presence.online !== false && presence.status !== 'offline';
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        if (isOnline) {
          next.add(uId);
        } else {
          next.delete(uId);
        }
        return next;
      });
    });

    return () => {
      unsubNewMsg();
      unsubMsgUpdated();
      unsubTyping();
      unsubOnlineList();
      unsubPresence();
      leaveProject(projectId);
    };
  }, [projectId, currentUserId, loadHistory]);

  // ── Yeni mesaj və ya typing gəldikdə aşağı sürüşdür ─────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // ── Typing debounce idarəsi ────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Əgər yazmağa başladısa:
    if (!isTypingRef.current && val.trim().length > 0) {
      isTypingRef.current = true;
      sendTyping(projectId, true);
    }

    // Əgər input tam boşalıbsa:
    if (val.trim().length === 0 && isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(projectId, false);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      return;
    }

    // Hər klaviatura basılışında 2 saniyəlik timeout yenilənir
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        sendTyping(projectId, false);
      }
    }, 2000);
  };

  // ── Mətn mesajı göndər ─────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    // Yazmağı dərhal dayandır
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(projectId, false);
    }

    setSending(true);
    setSendError('');
    setInputText('');

    try {
      const ack = await sendMessage(projectId, text);
      if (!ack.ok) {
        setSendError(ack.error ?? 'Mesaj göndərilmədi');
        setInputText(text);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mesaj göndərilmədi';
      setSendError(msg);
      setInputText(text);
      console.error('[ChatPanel] Göndərmə xətası:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Fayl yükləmə idarəsi ───────────────────────────────────────────────────

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSending(true);
    setSendError('');
    try {
      await uploadFile(projectId, file);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Fayl göndərilə bilmədi';
      setSendError(msg);
      console.error('[ChatPanel] Fayl yükləmə xətası:', err);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Səs yazma idarəsi ─────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      setSendError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const seconds = recordSeconds;
          try {
            setSending(true);
            await uploadVoice(projectId, audioBlob, Math.max(1, seconds));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Səs göndərilə bilmədi';
            setSendError(msg);
            console.error('[ChatPanel] Səs yükləmə xətası:', err);
          } finally {
            setSending(false);
          }
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);

      recordIntervalRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('[ChatPanel] Mikrofon icazəsi xətası:', err);
      setSendError('Mikrofona çıxış icazəsi verilmədi və ya mikrofon tapılmadı.');
    }
  };

  const stopRecording = () => {
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const typingNames = Array.from(typingUsers.values());
  const memberEntries = Array.from(membersMap.entries());

  return (
    <div className="cp-root">
      {/* ── Üst zolaq: Onlayn üzvlər göstəricisi ──────── */}
      {memberEntries.length > 0 && (
        <div className="cp-members-bar">
          <span className="cp-members-label">Üzvlər:</span>
          <div className="cp-members-list">
            {memberEntries.map(([id, name]) => {
              const isOnline = onlineUserIds.has(id);
              return (
                <div
                  key={id}
                  className={`cp-member-pill ${isOnline ? 'cp-member-pill--online' : ''}`}
                  title={`${name} (${isOnline ? 'Onlayn' : 'Oflayn'})`}
                >
                  <span className={`cp-presence-dot ${isOnline ? 'cp-presence-dot--online' : ''}`} />
                  <span className="cp-member-name">{name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mesaj axını ─────────────────────────────── */}
      <div className="cp-feed">
        {loading && (
          <div className="cp-state">
            <div className="cp-spinner" />
            <span>Chat yüklənir...</span>
          </div>
        )}

        {!loading && loadError && (
          <div className="cp-state cp-state--error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{loadError}</span>
            <button className="cp-retry-btn" onClick={loadHistory}>Yenidən cəhd et</button>
          </div>
        )}

        {!loading && !loadError && messages.length === 0 && (
          <div className="cp-state cp-state--empty">
            <div className="cp-empty-icon">💬</div>
            <span>Hələ heç bir mesaj yoxdur.</span>
            <span className="cp-empty-hint">Birinci mesajı siz göndərin!</span>
          </div>
        )}

        {!loading && !loadError && messages.map(m => (
          <MessageBubble
            key={m.id}
            mesaj={m}
            isMine={m.senderId === currentUserId}
            projectId={projectId}
            isSenderOnline={m.senderId ? onlineUserIds.has(Number(m.senderId)) : false}
          />
        ))}

        {/* "Yazır..." animasiyalı göstəricisi */}
        {typingNames.length > 0 && (
          <div className="cp-typing-indicator">
            <div className="cp-typing-dots">
              <span /><span /><span />
            </div>
            <span className="cp-typing-text">
              {typingNames.length === 1
                ? `${typingNames[0]} yazır...`
                : `${typingNames.slice(0, 2).join(', ')} və başqaları yazır...`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Göndərmə xətası ──────────────────────────── */}
      {sendError && (
        <div className="cp-send-error">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {sendError}
        </div>
      )}

      {/* ── Səs yazma canlı paneli ──────────────────── */}
      {recording && (
        <div className="cp-recording-banner">
          <div className="cp-recording-pulse" />
          <span className="cp-recording-title">Səs yazılır...</span>
          <span className="cp-recording-timer">
            {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
          </span>
          <span className="cp-recording-hint">(Dayandırmaq və göndərmək üçün 🎤 klikləyin)</span>
        </div>
      )}

      {/* ── Input paneli ─────────────────────────────── */}
      <div className="cp-input-bar">
        {/* Gizli Fayl Input-u */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />

        {/* 📎 Fayl Əlavə Et */}
        <button
          type="button"
          className="cp-tool-btn"
          onClick={handleFileClick}
          disabled={sending || recording}
          title="Fayl göndər"
          aria-label="Fayl seç"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* 🎤 Səs Yaz / Dayandır */}
        <button
          type="button"
          className={`cp-tool-btn ${recording ? 'cp-tool-btn--rec' : ''}`}
          onClick={toggleRecording}
          disabled={sending}
          title={recording ? 'Səs yazmanı dayandır və göndər' : 'Səs yaz'}
          aria-label="Səs yaz"
        >
          {recording ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Mətn sahəsi */}
        <textarea
          ref={inputRef}
          className="cp-input"
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={recording ? 'Səs yazılır...' : 'Mesaj yaz... (Enter — göndər, Shift+Enter — yeni sətir)'}
          rows={1}
          disabled={sending || recording}
          maxLength={4000}
          aria-label="Mesaj"
        />

        {/* Göndər Düyməsi */}
        <button
          className="cp-send-btn"
          onClick={handleSend}
          disabled={!inputText.trim() || sending || recording}
          title="Göndər (Enter)"
          aria-label="Göndər"
        >
          {sending ? (
            <span className="cp-send-spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
