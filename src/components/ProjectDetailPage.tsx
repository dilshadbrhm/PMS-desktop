import { useState, useEffect, useCallback } from 'react';
import {
  getProjectDetail,
  getTasks,
  type Project,
  type Task,
  type DeadlineInfo,
  TaskStatus,
} from '../api/client';
import {
  onOnlineListReceived,
  onPresenceUpdated,
  type PresenceData,
} from '../api/socket';
import TaskDetailModal from './TaskDetailModal';
import ChatPanel from './ChatPanel';
import './ProjectDetailPage.css';

interface Props {
  projectId: number;
  onBack: () => void;
  /** Login olmuş istifadəçinin ID-si — ChatPanel-də öz mesajlarını sıralamaq üçün */
  currentUserId: number;
}

// ─── Deadline köməkçiləri (ProjectsPage ilə eyni məntiqdə) ───────────────────

function parseDeadline(raw: Task['deadline'] | DeadlineInfo | null | undefined): DeadlineInfo | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as DeadlineInfo;
  return {
    seviyye: 'normal',
    kecenFaiz: 0,
    qalanFaiz: 100,
    qalanGun: 0,
    kilidli: false,
    start_at: null,
    end_at: raw as string,
  };
}

function deadlineSeviyyeClass(seviyye: DeadlineInfo['seviyye']): string {
  const map: Record<string, string> = {
    normal: 'dl-normal', sari: 'dl-sari', qirmizi: 'dl-qirmizi',
    kecib: 'dl-kecib', 'teyin-olunmayib': 'dl-yox',
  };
  return map[seviyye] ?? 'dl-yox';
}

function deadlineSeviyyeLabel(seviyye: DeadlineInfo['seviyye']): string {
  const map: Record<string, string> = {
    normal: 'Normal', sari: 'Tezliklə', qirmizi: 'Kritik',
    kecib: 'Keçib', 'teyin-olunmayib': 'Təyin edilməyib',
  };
  return map[seviyye] ?? 'Məlum deyil';
}

const formatDate = (dateStr?: string | null): string | null => {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('az-AZ', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
};

// ─── DeadlineChip (yenidən istifadə) ─────────────────────────────────────────

function DeadlineChip({ dl }: { dl: DeadlineInfo }) {
  const cls = deadlineSeviyyeClass(dl.seviyye);
  const label = deadlineSeviyyeLabel(dl.seviyye);

  if (dl.seviyye === 'teyin-olunmayib') {
    return (
      <span className={`pdp-dl-chip ${cls}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        {label}
      </span>
    );
  }

  return (
    <div className="pdp-dl-wrap">
      <span className={`pdp-dl-chip ${cls}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        {dl.seviyye === 'kecib' ? label : `${label} · ${dl.qalanGun} gün`}
        {dl.kilidli && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" title="Kilidli">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
      </span>
      {dl.seviyye !== 'kecib' && (
        <div className="pdp-dl-bar-wrap" title={`${Math.round(dl.kecenFaiz)}% keçib`}>
          <div className={`pdp-dl-bar-fill ${cls}`} style={{ width: `${Math.min(100, dl.kecenFaiz)}%` }} />
        </div>
      )}
      {formatDate(dl.end_at) && (
        <span className="pdp-dl-date">{formatDate(dl.end_at)}</span>
      )}
    </div>
  );
}

// ─── Ceki (çəki) ulduzları ────────────────────────────────────────────────────

function CekiBadge({ ceki }: { ceki?: number | null }) {
  if (!ceki) return null;
  return (
    <span className="pdp-ceki" title={`Çəki: ${ceki}`}>
      {'★'.repeat(Math.min(ceki, 5))}{'☆'.repeat(Math.max(0, 5 - ceki))}
    </span>
  );
}

// ─── Task Kartı ───────────────────────────────────────────────────────────────

function TaskCard({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const dl = parseDeadline(task.deadlineVeziyyeti ?? task.deadline);
  const assigneeName = task.assignee?.name ?? 'Təyin edilməyib';
  const hasAssignee  = !!task.assignee?.name;

  return (
    <div
      className="pdp-task-card"
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen(task)}
      title="Detalları gör"
    >
      <p className="pdp-task-title">{task.title}</p>

      {task.description && (
        <p className="pdp-task-desc">{task.description}</p>
      )}

      <div className="pdp-task-meta">
        <span className={`pdp-assignee ${hasAssignee ? '' : 'pdp-assignee--empty'}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          {assigneeName}
        </span>
        <CekiBadge ceki={task.ceki} />
      </div>

      {dl && (
        <div className="pdp-task-deadline">
          <DeadlineChip dl={dl} />
        </div>
      )}
    </div>
  );
}

// ─── Status Sütunu ────────────────────────────────────────────────────────────

const COLUMNS: { status: number; label: string; cls: string }[] = [
  { status: TaskStatus.Aciq,   label: 'Açıq',    cls: 'col-aciq'   },
  { status: TaskStatus.Icrada, label: 'İcrada',   cls: 'col-icrada' },
  { status: TaskStatus.Bitib,  label: 'Bitib',    cls: 'col-bitib'  },
];

// ─── Layihə Başlıq Bloku ──────────────────────────────────────────────────────

function ProjectHeader({ project }: { project: Project }) {
  const dl = parseDeadline(project.deadline);
  const isOpen = project.status !== 0 && project.status !== '0' &&
                 project.status !== 'closed' && project.status !== 'BAGLI';

  return (
    <div className="pdp-proj-header">
      <div className="pdp-proj-title-row">
        <h2 className="pdp-proj-name">{project.name}</h2>
        <div className="pdp-proj-badges">
          <span className={`pdp-proj-status ${isOpen ? 'ps-open' : 'ps-closed'}`}>
            {isOpen ? 'Açıq' : 'Bağlı'}
          </span>
          {project.menimRolum && (
            <span className="pdp-proj-role">{project.menimRolum}</span>
          )}
        </div>
      </div>

      {project.description && (
        <p className="pdp-proj-desc">{project.description}</p>
      )}

      <div className="pdp-proj-meta">
        {project.start_at && (
          <span className="pdp-proj-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Başlama: {formatDate(project.start_at)}
          </span>
        )}
        {project.end_at && (
          <span className="pdp-proj-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Bitmə: {formatDate(project.end_at)}
          </span>
        )}
        {typeof project.taskSayi === 'number' && (
          <span className="pdp-proj-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            {project.taskSayi} task
          </span>
        )}
        {typeof project.uzvSayi === 'number' && (
          <span className="pdp-proj-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
            </svg>
            {project.uzvSayi} üzv
          </span>
        )}
        {dl && (
          <span className="pdp-proj-meta-item">
            <DeadlineChip dl={dl} />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Əsas Komponent ───────────────────────────────────────────────────────────

export default function ProjectDetailPage({ projectId, onBack, currentUserId }: Props) {
  const [project, setProject]           = useState<Project | null>(null);
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab]       = useState<'tasks' | 'chat' | 'members'>('tasks');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());

  // Socket-dən onlayn istifadəçiləri qlobal səviyyədə də dinləyirik (Üzvlər tab-ı üçün)
  useEffect(() => {
    const unsubOnline = onOnlineListReceived((ids: number[]) => {
      setOnlineUserIds(new Set(ids.map(Number)));
    });
    const unsubPres = onPresenceUpdated((presence: PresenceData) => {
      const uId = Number(presence.userId ?? presence.istifadeciId ?? 0);
      if (!uId) return;
      const isOnline = presence.online !== false && presence.status !== 'offline';
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        if (isOnline) next.add(uId);
        else next.delete(uId);
        return next;
      });
    });

    return () => {
      unsubOnline();
      unsubPres();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [proj, taskList] = await Promise.all([
        getProjectDetail(projectId),
        getTasks(projectId),
      ]);
      setProject(proj);
      setTasks(taskList);
    } catch (err: unknown) {
      console.error('[ProjectDetail] Yükləmə xətası:', err);
      setError(err instanceof Error ? err.message : 'Məlumatları yükləmək mümkün olmadı');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Task modalını aç
  const handleTaskOpen = (task: Task) => setSelectedTask(task);

  // Modal bağlandıqda
  const handleModalClose = () => setSelectedTask(null);

  // Status dəyişəndə: siyahını yenidən yüklə, modalı bağla
  const handleStatusChanged = useCallback(async () => {
    setSelectedTask(null);
    // Yalnız task siyahısını yenilə (daha sürətli)
    try {
      const taskList = await getTasks(projectId);
      setTasks(taskList);
    } catch (err) {
      console.error('[ProjectDetail] Task refresh xətası:', err);
    }
  }, [projectId]);

  return (
    <div className="pdp-root">
      {/* Dekorativ blob-lar */}
      <div className="pdp-blob pdp-blob--1" />
      <div className="pdp-blob pdp-blob--2" />

      {/* Header */}
      <header className="pdp-header">
        <button className="pdp-back-btn" onClick={onBack} title="Layihələrə qayıt">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          Layihələr
        </button>

        <button
          className="pdp-refresh-btn"
          onClick={load}
          disabled={loading}
          title="Yenilə"
        >
          <svg className={loading ? 'pdp-spin' : ''} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Yenilə
        </button>
      </header>

      <main className="pdp-main">
        {/* ── Yükləmə ── */}
        {loading && (
          <div className="pdp-state-center">
            <div className="pdp-spinner" />
            <p className="pdp-state-text">Məlumatlar yüklənir...</p>
          </div>
        )}

        {/* ── Xəta ── */}
        {!loading && error && (
          <div className="pdp-state-center pdp-error-box">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3 className="pdp-error-title">Xəta baş verdi</h3>
            <p className="pdp-error-msg">{error}</p>
            <button className="pdp-retry-btn" onClick={load}>Yenidən cəhd et</button>
          </div>
        )}

        {/* ── Məzmun ── */}
        {!loading && !error && project && (
          <>
            {/* Layihə başlığı */}
            <ProjectHeader project={project} />

            {/* ── Tab küdəkləri ── */}
            {(() => {
              const rawMembers: any[] =
                (project as any)?.uzvler ||
                (project as any)?.members ||
                (project as any)?.users ||
                (project as any)?.istifadeciler ||
                [];

              const membersMap = new Map<number, string>();
              for (const m of rawMembers) {
                const uId = Number(m.userId ?? m.id ?? m.istifadeciId);
                const uName = m.name || (m.ad && m.soyad ? `${m.ad} ${m.soyad}` : (m.ad || ''));
                if (uId && uName) {
                  membersMap.set(uId, uName);
                }
              }

              for (const t of tasks) {
                if (t.assignee?.id && t.assignee?.name) {
                  membersMap.set(Number(t.assignee.id), t.assignee.name);
                }
              }

              const normalizedMembers = Array.from(membersMap.entries()).map(([userId, name]) => ({
                userId,
                id: userId,
                name,
              }));

              const memberCount = normalizedMembers.length || Number(project.uzvSayi ?? 0);

              return (
                <>
                  <div className="pdp-tabs">
                    <button
                      className={`pdp-tab ${activeTab === 'tasks' ? 'pdp-tab--active' : ''}`}
                      onClick={() => setActiveTab('tasks')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      Tapşırıqlar
                      <span className="pdp-tab-badge">{tasks.length}</span>
                    </button>
                    <button
                      className={`pdp-tab ${activeTab === 'chat' ? 'pdp-tab--active' : ''}`}
                      onClick={() => setActiveTab('chat')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Chat
                    </button>
                    <button
                      className={`pdp-tab ${activeTab === 'members' ? 'pdp-tab--active' : ''}`}
                      onClick={() => setActiveTab('members')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                      </svg>
                      Üzvlər
                      <span className="pdp-tab-badge">{memberCount}</span>
                    </button>
                  </div>

                  {/* ── Tapşırıqlar tab-ı (Kanban) ── */}
                  {activeTab === 'tasks' && (
                    <div className="pdp-board">
                      {COLUMNS.map(col => {
                        const colTasks = tasks.filter(t => Number(t.status) === col.status);
                        return (
                          <div key={col.status} className={`pdp-col ${col.cls}`}>
                            <div className="pdp-col-header">
                              <span className="pdp-col-label">{col.label}</span>
                              <span className="pdp-col-count">{colTasks.length}</span>
                            </div>

                            <div className="pdp-col-body">
                              {colTasks.length === 0 ? (
                                <div className="pdp-col-empty">
                                  <span>Tapşırıq yoxdur</span>
                                </div>
                              ) : (
                                colTasks.map(task => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    onOpen={handleTaskOpen}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Chat tab-ı ── */}
                  {activeTab === 'chat' && (
                    <div className="pdp-chat-wrap">
                      <ChatPanel
                        projectId={projectId}
                        currentUserId={currentUserId}
                        projectMembers={normalizedMembers}
                      />
                    </div>
                  )}

                  {/* ── Üzvlər tab-ı ── */}
                  {activeTab === 'members' && (
                    <div className="pdp-members-tab">
                      {normalizedMembers.length === 0 ? (
                        <div className="pdp-col-empty">
                          <span>Üzv siyahısı tapılmadı</span>
                        </div>
                      ) : (
                        <div className="pdp-members-grid">
                          {normalizedMembers.map(m => {
                            const isOnline = onlineUserIds.has(m.userId);
                            return (
                              <div key={m.userId} className={`pdp-member-card ${isOnline ? 'pdp-member-card--online' : ''}`}>
                                <div className="pdp-member-avatar-wrap">
                                  <div className="pdp-member-avatar">
                                    {m.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className={`pdp-member-presence-dot ${isOnline ? 'pdp-member-presence-dot--online' : ''}`} />
                                </div>
                                <div className="pdp-member-details">
                                  <div className="pdp-member-name-row">
                                    <span className="pdp-member-name">{m.name}</span>
                                    {m.userId === currentUserId && (
                                      <span className="pdp-member-self-tag">Siz</span>
                                    )}
                                  </div>
                                  <span className="pdp-member-status-text">
                                    {isOnline ? '🟢 Onlayn' : '⚪ Oflayn'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </main>

      {/* ── Task detal modali ── */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          projectId={projectId}
          onClose={handleModalClose}
          onStatusChanged={handleStatusChanged}
        />
      )}
    </div>
  );
}
