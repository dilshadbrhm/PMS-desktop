import { useState, useEffect, useCallback } from 'react';
import {
  getProjectDetail,
  getTasks,
  updateMemberRole,
  removeMember,
  closeProject,
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
import CreateTaskModal from './CreateTaskModal';
import AddMemberModal from './AddMemberModal';
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
  const hasAssignee = !!task.assignee?.name;

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
  { status: TaskStatus.Aciq, label: 'Açıq', cls: 'col-aciq' },
  { status: TaskStatus.Icrada, label: 'İcrada', cls: 'col-icrada' },
  { status: TaskStatus.Bitib, label: 'Bitib', cls: 'col-bitib' },
];

// ─── Layihə Başlıq Bloku ──────────────────────────────────────────────────────

function ProjectHeader({
  project,
  canClose,
  onCloseClick,
  isClosing,
}: {
  project: Project;
  canClose: boolean;
  onCloseClick: () => void;
  isClosing: boolean;
}) {
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
          {canClose && isOpen && (
            <button
              type="button"
              className="pdp-close-proj-btn"
              onClick={onCloseClick}
              disabled={isClosing}
              title="Layihəni bağla (bütün tapşırıqlar bitməlidir)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {isClosing ? 'Bağlanır...' : 'Layihəni bağla'}
            </button>
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

function checkIsManager(role?: string | number | null): boolean {
  if (role === null || role === undefined || role === '') return false;
  // Rəqəm və ya string yoxlaması: 2 = Menecer, 1 = Qlobal/Sistem Menecer/Admin
  if (role === 2 || role === 1 || role === '2' || role === '1') return true;
  const r = String(role).trim().toLowerCase();
  return (
    r === '2' ||
    r === '1' ||
    r.includes('men') ||     // Menecer, menecer
    r.includes('man') ||     // Manager, manager
    r.includes('admin') ||   // Admin
    r.includes('rehber') ||  // Rehber
    r.includes('rəhbər') ||  // Rəhbər
    r.includes('owner') ||   // Owner
    r.includes('sahib')
  );
}

// ─── Əsas Komponent ───────────────────────────────────────────────────────────

export default function ProjectDetailPage({ projectId, onBack, currentUserId }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<'tasks' | 'chat' | 'members'>('tasks');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(new Set());
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [closingProject, setClosingProject] = useState(false);
  const [showCloseProjectConfirm, setShowCloseProjectConfirm] = useState(false);
  const [closeProjectError, setCloseProjectError] = useState('');
  const [memberActionLoadingId, setMemberActionLoadingId] = useState<number | null>(null);
  const [memberActionError, setMemberActionError] = useState('');
  const [memberToDelete, setMemberToDelete] = useState<{ id: number; name: string } | null>(null);

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

  // Yeni task yaradıldıqda siyahını yenilə
  const handleTaskCreated = useCallback(async () => {
    try {
      const taskList = await getTasks(projectId);
      setTasks(taskList);
    } catch (err) {
      console.error('[ProjectDetail] Task refresh xətası:', err);
    }
  }, [projectId]);

  // Üzv əlavə edildikdə layihə məlumatlarını yenidən yüklə
  const handleMemberAdded = useCallback(async () => {
    console.log('[ProjectDetail] Üzv əlavə olundu, refetch edilir');
    await load();
  }, [load]);

  // Üzvləri hesabla
  const rawMembers: any[] =
    (project as any)?.uzvler ||
    (project as any)?.members ||
    (project as any)?.users ||
    (project as any)?.istifadeciler ||
    [];

  const membersMap = new Map<number, { name: string; role: number }>();
  for (const m of rawMembers) {
    const uId = Number(m.userId ?? m.id ?? m.istifadeciId ?? m.user?.id);
    const uRole = Number(m.role ?? m.rol ?? m.roleId ?? m.rolId ?? 3);
    const uName =
      m.name ||
      m.user?.name ||
      (m.ad && m.soyad ? `${m.ad} ${m.soyad}` : '') ||
      (m.user?.ad && m.user?.soyad ? `${m.user.ad} ${m.user.soyad}` : '') ||
      m.ad ||
      m.user?.ad ||
      m.username ||
      m.user?.username ||
      '';
    if (uId && uName) {
      membersMap.set(uId, { name: uName, role: uRole });
    }
  }

  for (const t of tasks) {
    if (t.assignee?.id && t.assignee?.name) {
      const aId = Number(t.assignee.id);
      if (!membersMap.has(aId)) {
        membersMap.set(aId, { name: t.assignee.name, role: 3 });
      }
    }
  }

  // Əgər cari istifadəçi üzv siyahısında yoxdursa, onu da əlavə edək (özünə təyin edə bilməsi üçün)
  if (currentUserId && !membersMap.has(currentUserId)) {
    membersMap.set(currentUserId, { name: 'Siz', role: 3 });
  }

  const normalizedMembers = Array.from(membersMap.entries()).map(([userId, info]) => ({
    userId,
    id: userId,
    name: info.name,
    role: info.role,
  }));

  const memberCount = normalizedMembers.length || Number(project?.uzvSayi ?? 0);

  // Cari istifadəçinin layihə üzvləri siyahısındakı rolu və yaradıcı (created_by) olub-olmaması
  const myMemberObj = rawMembers.find(
    (m: any) => Number(m.userId ?? m.id ?? m.istifadeciId) === Number(currentUserId)
  );
  const myRoleInMembers = myMemberObj?.role ?? myMemberObj?.rol ?? myMemberObj?.roleId ?? myMemberObj?.rolId;
  const isCreator = Boolean(project?.created_by && Number(project.created_by) === Number(currentUserId));

  const userRole =
    project?.menimRolum ||
    (project as any)?.myRole ||
    (project as any)?.rol ||
    (project as any)?.role ||
    myRoleInMembers ||
    (isCreator ? 2 : undefined);

  const isManager = checkIsManager(userRole) || isCreator;
  console.log(
    '[ProjectDetail] menimRolum:', JSON.stringify(project?.menimRolum),
    'myRoleInMembers:', JSON.stringify(myRoleInMembers),
    'isCreator:', isCreator,
    'userRole:', JSON.stringify(userRole),
    'isManager:', isManager
  );
  const existingMemberIds = new Set<number>(normalizedMembers.map(m => m.userId));

  // Üzv rolu dəyişmə
  const handleRoleChange = async (userId: number, newRole: 2 | 3 | 4) => {
    setMemberActionError('');
    setMemberActionLoadingId(userId);
    try {
      await updateMemberRole(projectId, userId, newRole);
      await load();
    } catch (err: unknown) {
      console.error('[ProjectDetail] updateMemberRole xətası:', err);
      setMemberActionError(err instanceof Error ? err.message : 'Rol dəyişdirilərkən xəta baş verdi');
    } finally {
      setMemberActionLoadingId(null);
    }
  };

  // Üzv silmə təsdiqi
  const confirmRemoveMember = async () => {
    if (!memberToDelete) return;
    setMemberActionError('');
    setMemberActionLoadingId(memberToDelete.id);
    try {
      await removeMember(projectId, memberToDelete.id);
      setMemberToDelete(null);
      await load();
    } catch (err: unknown) {
      console.error('[ProjectDetail] removeMember xətası:', err);
      setMemberActionError(err instanceof Error ? err.message : 'Üzv silinərkən xəta baş verdi');
    } finally {
      setMemberActionLoadingId(null);
    }
  };

  // Layihə bağlama
  const handleCloseProjectConfirm = async () => {
    setCloseProjectError('');
    setClosingProject(true);
    try {
      await closeProject(projectId);
      setShowCloseProjectConfirm(false);
      await load();
    } catch (err: unknown) {
      console.log('[CloseProject] Backend-in TAM xəta cavabı:', JSON.stringify(err instanceof Error ? { message: err.message, ...(err as any) } : err, null, 2));
      console.error('[ProjectDetail] closeProject xətası:', err);

      const realBackendMessage = err instanceof Error ? err.message : String(err || 'Layihə bağlanarkən xəta baş verdi');
      setCloseProjectError(realBackendMessage);
    } finally {
      setClosingProject(false);
    }
  };

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
            <ProjectHeader
              project={project}
              canClose={isManager}
              onCloseClick={() => {
                setCloseProjectError('');
                setShowCloseProjectConfirm(true);
              }}
              isClosing={closingProject}
            />

            {/* ── Tab Paneli və Əməliyyat Düymələri ── */}
            <div className="pdp-tabs-bar">
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

              {activeTab === 'tasks' && (
                <button
                  className="pdp-create-task-btn"
                  onClick={() => setShowCreateTaskModal(true)}
                  title="Yeni tapşırıq əlavə et"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  + Yeni Task
                </button>
              )}

              {activeTab === 'members' && isManager && (
                <button
                  className="pdp-create-task-btn"
                  onClick={() => setShowAddMemberModal(true)}
                  title="Layihəyə yeni üzv əlavə et"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  + Üzv əlavə et
                </button>
              )}
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
                {memberActionError && (
                  <div className="pdp-action-error-banner">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{memberActionError}</span>
                    <button type="button" className="pdp-banner-close" onClick={() => setMemberActionError('')}>×</button>
                  </div>
                )}

                {normalizedMembers.length === 0 ? (
                  <div className="pdp-col-empty">
                    <span>Üzv siyahısı tapılmadı</span>
                    {isManager && (
                      <button
                        type="button"
                        className="pdp-create-task-btn"
                        style={{ marginTop: 12 }}
                        onClick={() => setShowAddMemberModal(true)}
                      >
                        + Üzv əlavə et
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="pdp-members-grid">
                    {normalizedMembers.map(m => {
                      const isOnline = onlineUserIds.has(m.userId);
                      const isSelf = m.userId === currentUserId;
                      const canManageThisMember = isManager && !isSelf;
                      const isLoadingThisMember = memberActionLoadingId === m.userId;

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
                              <span className="pdp-member-name" title={m.name}>{m.name}</span>
                              {isSelf && (
                                <span className="pdp-member-self-tag">Siz</span>
                              )}
                            </div>
                            <span className="pdp-member-status-text">
                              {isOnline ? '🟢 Onlayn' : '⚪ Oflayn'}
                            </span>

                            {/* Rol və Əməliyyatlar */}
                            <div className="pdp-member-actions-row">
                              {canManageThisMember ? (
                                <>
                                  <select
                                    className="pdp-member-role-select"
                                    value={m.role}
                                    disabled={isLoadingThisMember}
                                    onChange={(e) => {
                                      const val = Number(e.target.value) as 2 | 3 | 4;
                                      handleRoleChange(m.userId, val);
                                    }}
                                    title="Üzvün rolunu dəyiş"
                                  >
                                    <option value={2}>Menecer</option>
                                    <option value={3}>İstifadəçi</option>
                                    <option value={4}>Ghost</option>
                                  </select>

                                  <button
                                    type="button"
                                    className="pdp-member-delete-btn"
                                    disabled={isLoadingThisMember}
                                    onClick={() => {
                                      setMemberActionError('');
                                      setMemberToDelete({ id: m.userId, name: m.name });
                                    }}
                                    title="Üzvü layihədən çıxar"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x1="14" y1="11" x2="14" y2="17" />
                                    </svg>
                                    Sil
                                  </button>
                                </>
                              ) : (
                                <span className="pdp-member-static-role">
                                  {m.role === 2 ? 'Menecer' : m.role === 4 ? 'Ghost' : 'İstifadəçi'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Üzv Silmə Təsdiq Dialoqu ── */}
      {memberToDelete && (
        <div className="pdp-confirm-overlay" onClick={() => !memberActionLoadingId && setMemberToDelete(null)}>
          <div className="pdp-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="pdp-confirm-icon pdp-confirm-icon--danger">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="pdp-confirm-title">Üzvü sil</h3>
            <p className="pdp-confirm-desc">
              <strong>{memberToDelete.name}</strong> adlı üzvü bu layihədən silmək istədiyinizə əminsiniz?
            </p>
            {memberActionError && (
              <div className="pdp-confirm-error">
                {memberActionError}
              </div>
            )}
            <div className="pdp-confirm-actions">
              <button
                type="button"
                className="pdp-confirm-cancel"
                disabled={Boolean(memberActionLoadingId)}
                onClick={() => setMemberToDelete(null)}
              >
                Ləğv et
              </button>
              <button
                type="button"
                className="pdp-confirm-danger-btn"
                disabled={Boolean(memberActionLoadingId)}
                onClick={confirmRemoveMember}
              >
                {memberActionLoadingId ? 'Silinir...' : 'Bəli, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Layihəni Bağlamaq Təsdiq Dialoqu ── */}
      {showCloseProjectConfirm && (
        <div className="pdp-confirm-overlay" onClick={() => !closingProject && setShowCloseProjectConfirm(false)}>
          <div className="pdp-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="pdp-confirm-icon pdp-confirm-icon--warning">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="pdp-confirm-title">Layihəni bağla</h3>
            <p className="pdp-confirm-desc">
              Layihəni bağlamaq istədiyinizə əminsiniz? Bütün tapşırıqlar bitmiş olmalıdır.
            </p>
            {closeProjectError && (
              <div className="pdp-confirm-error-alert" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{closeProjectError}</span>
              </div>
            )}
            <div className="pdp-confirm-actions">
              <button
                type="button"
                className="pdp-confirm-cancel"
                disabled={closingProject}
                onClick={() => setShowCloseProjectConfirm(false)}
              >
                Ləğv et
              </button>
              <button
                type="button"
                className="pdp-confirm-primary-btn"
                disabled={closingProject}
                onClick={handleCloseProjectConfirm}
              >
                {closingProject ? 'Bağlanır...' : 'Bəli, Layihəni bağla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task detal modali ── */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          projectId={projectId}
          userRole={userRole}
          isManager={isManager}
          members={normalizedMembers}
          onClose={handleModalClose}
          onStatusChanged={handleStatusChanged}
        />
      )}

      {/* ── Yeni Task Yaratma Modalı ── */}
      {showCreateTaskModal && (
        <CreateTaskModal
          projectId={projectId}
          currentUserId={currentUserId}
          userRole={userRole}
          members={normalizedMembers}
          onClose={() => setShowCreateTaskModal(false)}
          onTaskCreated={handleTaskCreated}
        />
      )}

      {/* ── Üzv Əlavə Etmə Modalı ── */}
      {showAddMemberModal && (
        <AddMemberModal
          projectId={projectId}
          existingMemberIds={existingMemberIds}
          onClose={() => setShowAddMemberModal(false)}
          onMemberAdded={handleMemberAdded}
        />
      )}
    </div>
  );
}
