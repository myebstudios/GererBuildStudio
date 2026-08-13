import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock3,
  GripVertical,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import {
  EMPTY_TASK_FILTERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  activeTaskFilterCount,
  filterBoardTasks,
  positionForDrop,
  type TaskFilters,
  type TaskPriority,
  type TaskRecord,
  type TaskStatus,
  type TaskType,
} from "@/lib/taskBoard";
import { ApiError, api, useStore } from "@/state/store";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  doing: "Doing",
  review: "Review",
  done: "Done",
};

const STATUS_ICONS: Record<TaskStatus, typeof CircleDot> = {
  todo: CircleDot,
  doing: Clock3,
  review: ClipboardCheck,
  done: CheckCircle2,
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-ink-secondary/10 text-ink-secondary",
  normal: "bg-accent/10 text-accent",
  high: "bg-warning/10 text-warning",
  urgent: "bg-danger/10 text-danger",
};

interface TaskDraft {
  title: string;
  description: string;
  criteria: string;
  status: TaskStatus;
  type: TaskType;
  priority: TaskPriority;
  tags: string;
  dueDate: string;
  projectId: string;
  assigneeBotId: string;
}

const emptyDraft = (status: TaskStatus = "todo"): TaskDraft => ({
  title: "",
  description: "",
  criteria: "",
  status,
  type: "feature",
  priority: "normal",
  tags: "",
  dueDate: "",
  projectId: "",
  assigneeBotId: "",
});

function draftForTask(task: TaskRecord): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    criteria: task.acceptanceCriteria.join("\n"),
    status: task.status,
    type: task.type,
    priority: task.priority,
    tags: task.tags.join(", "),
    dueDate: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : "",
    projectId: task.projectId ?? "",
    assigneeBotId: task.assigneeBotId ?? "",
  };
}

function taskPayload(draft: TaskDraft) {
  return {
    title: draft.title,
    description: draft.description,
    acceptanceCriteria: draft.criteria.split("\n").map((item) => item.trim()).filter(Boolean),
    status: draft.status,
    type: draft.type,
    priority: draft.priority,
    tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    dueAt: draft.dueDate ? new Date(`${draft.dueDate}T23:59:59`).getTime() : null,
    projectId: draft.projectId || null,
    assigneeBotId: draft.assigneeBotId || null,
  };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function TaskModal({
  task,
  initialStatus,
  onClose,
}: {
  task: TaskRecord | null;
  initialStatus: TaskStatus;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState<TaskDraft>(() => task ? draftForTask(task) : emptyDraft(initialStatus));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const mutate = async (operation: Promise<any>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await operation;
      if (result.task) dispatch({ type: "taskUpserted", task: result.task });
      onClose();
    } catch (reason) {
      if (reason instanceof ApiError && reason.body.latest) {
        dispatch({ type: "taskUpserted", task: reason.body.latest });
        setError(`${reason.message} The form has been refreshed with the latest task; reopen it to continue.`);
      } else {
        setError(errorMessage(reason));
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!task) {
      await mutate(api("/api/tasks", { method: "POST", body: JSON.stringify(taskPayload(draft)) }));
      return;
    }
    let revision = task.revision;
    if (draft.assigneeBotId && draft.assigneeBotId !== task.assigneeBotId) {
      setBusy(true);
      setError(null);
      try {
        const delegated = await api(`/api/tasks/${task.id}/delegate`, {
          method: "POST",
          body: JSON.stringify({ revision, botId: draft.assigneeBotId }),
        });
        revision = delegated.task.revision;
        dispatch({ type: "taskUpserted", task: delegated.task });
      } catch (reason) {
        if (reason instanceof ApiError && reason.body.latest) dispatch({ type: "taskUpserted", task: reason.body.latest });
        setError(errorMessage(reason));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    const payload = taskPayload(draft);
    if (draft.assigneeBotId && draft.assigneeBotId !== task.assigneeBotId) delete (payload as any).assigneeBotId;
    await mutate(api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ revision, patch: payload }),
    }));
  };

  const remove = () => {
    if (!task) return;
    setBusy(true);
    setError(null);
    api(`/api/tasks/${task.id}`, { method: "DELETE", body: JSON.stringify({ revision: task.revision }) })
      .then(() => {
        dispatch({ type: "taskDeleted", taskId: task.id });
        onClose();
      })
      .catch((reason) => {
        if (reason instanceof ApiError && reason.body.latest) dispatch({ type: "taskUpserted", task: reason.body.latest });
        setError(errorMessage(reason));
      })
      .finally(() => setBusy(false));
  };

  const input = "w-full rounded-lg border border-hairline/60 bg-inset px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-accent/70 focus:outline-none";
  const label = "mb-1.5 block text-[12px] font-medium text-ink-secondary";
  const latestTask = task ? state.tasks.find((candidate) => candidate.id === task.id) ?? task : null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="animate-pop-in flex max-h-[calc(100vh-32px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline/60 bg-panel shadow-2xl shadow-black/70">
        <header className="flex items-center justify-between border-b border-hairline/50 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-ink">{task ? "Task details" : "Create task"}</h2>
            {task && <p className="mt-0.5 text-[11px] text-ink-secondary">Revision {latestTask?.revision} · updated {new Date(latestTask?.updatedAt ?? task.updatedAt).toLocaleString()}</p>}
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-md p-1.5 text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40" aria-label="Close task dialog"><X size={18} /></button>
        </header>

        <div className="min-h-0 overflow-y-auto p-5">
          {error && <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-[12px] text-danger"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</div>}
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-4">
              <label className="block"><span className={label}>Title</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={input} maxLength={200} placeholder="What needs to happen?" /></label>
              <label className="block"><span className={label}>Description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={cn(input, "min-h-28 resize-y leading-5")} placeholder="Context, constraints, and useful links…" /></label>
              <label className="block"><span className={label}>Acceptance criteria <span className="font-normal">· one per line</span></span><textarea value={draft.criteria} onChange={(event) => setDraft({ ...draft, criteria: event.target.value })} className={cn(input, "min-h-24 resize-y leading-5")} placeholder={"The change is covered by tests\nThe user can verify the result"} /></label>
            </div>
            <div className="space-y-3">
              <label className="block"><span className={label}>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })} className={input}>{TASK_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
              <label className="block"><span className={label}>Agent</span><select value={draft.assigneeBotId} onChange={(event) => setDraft({ ...draft, assigneeBotId: event.target.value })} className={input}><option value="">Unassigned</option>{state.bots.filter((bot) => !bot.hidden).map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}{task?.assignee && !task.assignee.available && <option value={task.assignee.id}>{task.assignee.name}</option>}</select></label>
              <label className="block"><span className={label}>Project</span><select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value })} className={input}><option value="">No project</option>{state.taskProjects.map((project) => <option key={project.id} value={project.id}>#{project.mention} · {project.name}{project.available ? "" : " (unavailable)"}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className={label}>Type</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as TaskType })} className={input}>{TASK_TYPES.map((type) => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
                <label className="block"><span className={label}>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })} className={input}>{TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}</select></label>
              </div>
              <label className="block"><span className={label}>Due date</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className={input} /></label>
              <label className="block"><span className={label}>Tags <span className="font-normal">· comma separated</span></span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} className={input} placeholder="frontend, agents" /></label>
            </div>
          </div>

          {task && task.activity.length > 0 && (
            <section className="mt-5 border-t border-hairline/50 pt-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">Activity</h3>
              <div className="mt-2 space-y-2">
                {[...task.activity].reverse().slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-3 text-[12px]">
                    <span className="text-ink"><span className="font-medium">{entry.actor.kind === "user" ? "You" : entry.actor.name}</span> {entry.detail ?? entry.action}</span>
                    <time className="shrink-0 text-ink-secondary">{new Date(entry.at).toLocaleString()}</time>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-hairline/50 px-5 py-4">
          <div>
            {task && (confirmDelete ? (
              <div className="flex items-center gap-2 text-[12px] text-danger"><span>Delete permanently?</span><button onClick={remove} disabled={busy} className="rounded-md bg-danger px-2.5 py-1.5 font-medium text-white disabled:opacity-40">Delete</button><button onClick={() => setConfirmDelete(false)} className="px-2 py-1.5 text-ink-secondary">Cancel</button></div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} disabled={busy} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-danger hover:bg-danger/10 disabled:opacity-40"><Trash2 size={14} /> Delete</button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="rounded-lg bg-raised px-4 py-2 text-[13px] text-ink hover:bg-raised-hover disabled:opacity-40">Cancel</button>
            <button onClick={() => void save()} disabled={busy || !draft.title.trim()} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-40">{busy && <Loader2 size={14} className="animate-spin" />}{task ? "Save changes" : "Create task"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function TaskCard({ task, onOpen, onMove, onDropBefore }: {
  task: TaskRecord;
  onOpen: () => void;
  onMove: (status: TaskStatus) => void;
  onDropBefore: (event: DragEvent) => void;
}) {
  const overdue = task.dueAt !== null && task.dueAt < Date.now() && task.status !== "done";
  return (
    <article
      draggable
      tabIndex={0}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/task-id", task.id);
      }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={onDropBefore}
      onDoubleClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }}
      className="group rounded-xl border border-hairline/60 bg-card p-3 shadow-sm outline-none hover:border-hairline focus:border-accent/70"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={15} className="mt-0.5 shrink-0 cursor-grab text-ink-secondary/50 group-hover:text-ink-secondary" />
        <button onClick={onOpen} className="min-w-0 flex-1 text-left"><h3 className="text-[13px] font-semibold leading-5 text-ink">{task.title}</h3>{task.description && <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-ink-secondary">{task.description}</p>}</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", PRIORITY_STYLES[task.priority])}>{task.priority}</span>
        <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-ink-secondary">{task.type}</span>
        {task.project && <span className={cn("max-w-32 truncate rounded px-1.5 py-0.5 text-[10px]", task.project.available ? "bg-accent/10 text-accent" : "bg-warning/10 text-warning")} title={task.project.name}>#{task.project.mention}</span>}
      </div>
      {(task.assignee || task.dueAt || task.tags.length > 0) && (
        <div className="mt-3 space-y-1.5 border-t border-hairline/40 pt-2.5 text-[10px] text-ink-secondary">
          {task.assignee && <div className={cn("flex items-center gap-1.5", !task.assignee.available && "text-warning")}><UserRound size={12} /> {task.assignee.name}</div>}
          {task.dueAt && <div className={cn("flex items-center gap-1.5", overdue && "text-danger")}><CalendarDays size={12} /> {overdue ? "Overdue · " : ""}{new Date(task.dueAt).toLocaleDateString()}</div>}
          {task.tags.length > 0 && <div className="flex items-center gap-1.5"><Tag size={12} /><span className="truncate">{task.tags.join(", ")}</span></div>}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[9px] text-ink-secondary/70">rev {task.revision}</span>
        <select value={task.status} onClick={(event) => event.stopPropagation()} onChange={(event) => onMove(event.target.value as TaskStatus)} aria-label={`Move ${task.title}`} className="rounded-md border border-hairline/50 bg-inset px-1.5 py-1 text-[10px] text-ink-secondary focus:border-accent focus:outline-none">{TASK_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>
      </div>
    </article>
  );
}

export function TaskBoardScreen() {
  const { state, dispatch } = useStore();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [editing, setEditing] = useState<TaskRecord | null | undefined>(undefined);
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const [error, setError] = useState<string | null>(null);
  const visible = useMemo(() => filterBoardTasks(state.tasks, filters), [filters, state.tasks]);
  const filterCount = activeTaskFilterCount(filters);
  const tags = useMemo(() => [...new Set(state.tasks.flatMap((task) => task.tags))].sort(), [state.tasks]);
  const selectClass = "min-w-28 rounded-lg border border-hairline/50 bg-panel px-2.5 py-2 text-[11px] text-ink focus:border-accent/70 focus:outline-none";

  useEffect(() => {
    let alive = true;
    api("/api/tasks")
      .then(({ tasks, projects }) => {
        if (alive) dispatch({ type: "hydrateTasks", tasks, projects });
      })
      .catch((reason) => {
        if (alive) setError(errorMessage(reason));
      });
    return () => { alive = false; };
  }, [dispatch]);

  const reconcileError = (reason: unknown) => {
    if (reason instanceof ApiError && reason.body.latest) dispatch({ type: "taskUpserted", task: reason.body.latest });
    setError(errorMessage(reason));
  };

  const moveTask = async (task: TaskRecord, status: TaskStatus, beforeId: string | null = null) => {
    const position = positionForDrop(state.tasks, status, task.id, beforeId);
    setError(null);
    try {
      const result = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revision: task.revision, patch: { status, position } }),
      });
      dispatch({ type: "taskUpserted", task: result.task });
    } catch (reason) {
      reconcileError(reason);
    }
  };

  const dropped = (event: DragEvent, status: TaskStatus, beforeId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData("text/task-id");
    const task = state.tasks.find((candidate) => candidate.id === id);
    if (task) void moveTask(task, status, beforeId);
  };

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-app">
      <header className="flex min-h-[64px] shrink-0 items-center justify-between border-b border-hairline/40 px-5 py-3" style={{ WebkitAppRegion: "drag" } as CSSProperties}>
        <div className="flex items-center gap-2.5"><ClipboardCheck size={20} className="text-accent" /><div><h1 className="text-[16px] font-semibold text-ink">Task Board</h1><p className="text-[11px] text-ink-secondary">Shared work for you and your agents.</p></div></div>
        <button onClick={() => { setNewStatus("todo"); setEditing(null); }} className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}><Plus size={16} /> New task</button>
      </header>

      <section className="shrink-0 border-b border-hairline/40 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-hairline/50 bg-panel px-3 py-2"><Search size={15} className="text-ink-secondary" /><input value={filters.text} onChange={(event) => setFilters({ ...filters, text: event.target.value })} placeholder="Search tasks" className="min-w-0 flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-secondary focus:outline-none" /></div>
          <select value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: event.target.value })} className={selectClass} aria-label="Filter by project"><option value="">All projects</option><option value="none">No project</option>{state.taskProjects.map((project) => <option key={project.id} value={project.id}>#{project.mention}</option>)}</select>
          <select value={filters.assigneeBotId} onChange={(event) => setFilters({ ...filters, assigneeBotId: event.target.value })} className={selectClass} aria-label="Filter by agent"><option value="">All agents</option><option value="unassigned">Unassigned</option>{state.bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={selectClass} aria-label="Filter by status"><option value="">All statuses</option>{TASK_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select>
          <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })} className={selectClass} aria-label="Filter by type"><option value="">All types</option>{TASK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })} className={selectClass} aria-label="Filter by priority"><option value="">All priorities</option>{TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
          <select value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })} className={selectClass} aria-label="Filter by tag"><option value="">All tags</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
          <button onClick={() => setFilters({ ...filters, overdue: !filters.overdue })} className={cn("rounded-lg border px-3 py-2 text-[11px]", filters.overdue ? "border-danger/50 bg-danger/10 text-danger" : "border-hairline/50 bg-panel text-ink-secondary hover:text-ink")}>Overdue</button>
          {filterCount > 0 && <button onClick={() => setFilters(EMPTY_TASK_FILTERS)} className="rounded-lg px-3 py-2 text-[11px] text-accent hover:bg-accent/10">Clear {filterCount}</button>}
        </div>
      </section>

      {error && <div className="mx-4 mt-3 flex shrink-0 items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger"><span className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={14} /></button></div>}

      {!state.tasksLoaded ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-ink-secondary"><Loader2 size={16} className="animate-spin" /> Loading board…</div>
      ) : state.tasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6"><div className="max-w-md rounded-2xl border border-dashed border-hairline bg-panel p-10 text-center"><ClipboardCheck size={34} className="mx-auto text-accent" /><h2 className="mt-4 text-[16px] font-semibold text-ink">Give the team something to do</h2><p className="mt-2 text-[13px] leading-5 text-ink-secondary">Create a task here, or ask an agent to add and delegate work through the shared board.</p><button onClick={() => { setNewStatus("todo"); setEditing(null); }} className="mt-5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white"><Plus size={15} className="mr-1.5 inline" />Create first task</button></div></div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
          <div className="grid h-full min-w-[920px] grid-cols-4 gap-3">
            {TASK_STATUSES.map((status) => {
              const Icon = STATUS_ICONS[status];
              const tasks = visible.filter((task) => task.status === status);
              return (
                <section key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropped(event, status, null)} className="flex min-h-0 flex-col rounded-xl border border-hairline/50 bg-panel/70">
                  <header className="flex items-center justify-between px-3 py-3"><div className="flex items-center gap-2"><Icon size={15} className={status === "done" ? "text-success" : status === "review" ? "text-warning" : "text-accent"} /><h2 className="text-[12px] font-semibold text-ink">{STATUS_LABELS[status]}</h2><span className="rounded-full bg-raised px-1.5 py-0.5 text-[9px] text-ink-secondary">{tasks.length}</span></div><button onClick={() => { setNewStatus(status); setEditing(null); }} className="rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink" aria-label={`Add ${STATUS_LABELS[status]} task`}><Plus size={14} /></button></header>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={() => setEditing(task)} onMove={(next) => void moveTask(task, next)} onDropBefore={(event) => dropped(event, status, task.id)} />)}
                    {tasks.length === 0 && <div className="rounded-lg border border-dashed border-hairline/60 px-3 py-8 text-center text-[10px] text-ink-secondary">{filterCount ? "No matching tasks" : "Drop a task here"}</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {editing !== undefined && <TaskModal task={editing} initialStatus={newStatus} onClose={() => setEditing(undefined)} />}
    </main>
  );
}
