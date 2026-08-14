export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const;
export const TASK_TYPES = ["feature", "bug", "research", "documentation", "maintenance"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskActor = { kind: "user" } | { kind: "bot"; botId: string; name: string } | { kind: "sync"; source: "trello" };

export interface TaskActivity {
  id: string;
  action: "created" | "updated" | "moved" | "claimed" | "delegated";
  actor: TaskActor;
  at: number;
  detail?: string;
}

export interface TaskProject {
  id: string;
  name: string;
  mention: string;
  available: boolean;
}

export interface TaskAssignee {
  id: string;
  name: string;
  available: boolean;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: TaskStatus;
  type: TaskType;
  priority: TaskPriority;
  tags: string[];
  dueAt: number | null;
  projectId: string | null;
  assigneeBotId: string | null;
  position: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  createdBy: TaskActor;
  updatedBy: TaskActor;
  activity: TaskActivity[];
  project: TaskProject | null;
  assignee: TaskAssignee | null;
  trelloCardId: string | null;
  trelloCardUrl: string | null;
}

export interface TaskFilters {
  text: string;
  projectId: string;
  assigneeBotId: string;
  status: string;
  type: string;
  priority: string;
  tag: string;
  overdue: boolean;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  text: "",
  projectId: "",
  assigneeBotId: "",
  status: "",
  type: "",
  priority: "",
  tag: "",
  overdue: false,
};

export function filterBoardTasks(tasks: TaskRecord[], filters: TaskFilters, now = Date.now()): TaskRecord[] {
  const needles = filters.text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tag = filters.tag.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.projectId && (filters.projectId === "none" ? task.projectId !== null : task.projectId !== filters.projectId)) return false;
    if (filters.assigneeBotId && (filters.assigneeBotId === "unassigned" ? task.assigneeBotId !== null : task.assigneeBotId !== filters.assigneeBotId)) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.type && task.type !== filters.type) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (tag && !task.tags.includes(tag)) return false;
    if (filters.overdue && !(task.dueAt !== null && task.dueAt < now && task.status !== "done")) return false;
    if (needles.length) {
      const haystack = [
        task.title,
        task.description,
        task.project?.name ?? "",
        task.project?.mention ?? "",
        task.assignee?.name ?? "",
        ...task.acceptanceCriteria,
        ...task.tags,
      ].join(" ").toLowerCase();
      if (!needles.every((needle) => haystack.includes(needle))) return false;
    }
    return true;
  }).sort((a, b) => a.position - b.position || b.updatedAt - a.updatedAt);
}

export function positionForDrop(
  tasks: TaskRecord[],
  status: TaskStatus,
  movingId: string,
  beforeId: string | null,
): number {
  const column = tasks
    .filter((task) => task.status === status && task.id !== movingId)
    .sort((a, b) => a.position - b.position);
  if (!beforeId) return (column.at(-1)?.position ?? 0) + 1024;
  const index = column.findIndex((task) => task.id === beforeId);
  if (index < 0) return (column.at(-1)?.position ?? 0) + 1024;
  const before = column[index].position;
  const previous = column[index - 1]?.position;
  return previous === undefined ? before - 1024 : previous + (before - previous) / 2;
}

export function activeTaskFilterCount(filters: TaskFilters): number {
  return Object.entries(filters).filter(([, value]) => typeof value === "boolean" ? value : Boolean(value)).length;
}
