// Two-way sync between the shared task board and linked Trello boards.
// Push runs synchronously-ish (fire-and-forget from route handlers) right
// after a local task mutation. Pull runs on a poller plus an explicit
// "Sync now" request, comparing content (not just timestamps) so a pull
// immediately after a push is always a no-op — no echo loop.
import * as trello from "./trello.ts";
import type { TrelloCredentials } from "./trello.ts";
import type { TrelloLinkStore } from "./trelloLinks.ts";
import type { TaskRecord, TaskStatus, TaskStore } from "./tasks.ts";

export interface TrelloSyncDeps {
  taskStore: TaskStore;
  trelloLinks: TrelloLinkStore;
  credentials: () => TrelloCredentials | null;
  /** Called whenever a task changes as a side effect of sync (new card
   * pushed a fresh id/url, or a pull applied a Trello-side edit) so the
   * caller can broadcast it over SSE like any other task update. */
  onTaskChanged?: (task: TaskRecord) => void;
  log?: (message: string) => void;
}

export class TrelloSync {
  private readonly deps: TrelloSyncDeps;

  constructor(deps: TrelloSyncDeps) {
    this.deps = deps;
  }

  private log(message: string): void {
    (this.deps.log ?? ((m: string) => console.error(m)))(message);
  }

  /** Creates or updates the Trello card mirroring `taskId`, if its project
   * is linked. Safe to call after every task mutation — a no-op when the
   * project isn't linked, and idempotent when nothing actually changed. */
  async pushTask(taskId: string): Promise<void> {
    const creds = this.deps.credentials();
    if (!creds) return;
    const task = this.deps.taskStore.get(taskId);
    if (!task || !task.projectId) return;
    const link = this.deps.trelloLinks.get(task.projectId);
    if (!link) return;
    const listId = link.lists[task.status];
    try {
      if (task.trelloCardId) {
        await trello.updateCard(creds, task.trelloCardId, { name: task.title, desc: task.description, idList: listId, closed: false });
        return;
      }
      await this.createCardFor(creds, task, listId);
    } catch (error) {
      if (error instanceof trello.TrelloError && error.status === 404 && task.trelloCardId) {
        // the card was deleted/archived on Trello's side out from under us
        await this.createCardFor(creds, task, listId).catch((e) => this.log(`Trello push failed for task ${taskId}: ${message(e)}`));
        return;
      }
      this.log(`Trello push failed for task ${taskId}: ${message(error)}`);
    }
  }

  private async createCardFor(creds: TrelloCredentials, task: TaskRecord, listId: string): Promise<void> {
    const card = await trello.createCard(creds, { listId, name: task.title, desc: task.description });
    const updated = this.deps.taskStore.linkTrelloCard(task.id, card.id, card.url);
    this.deps.onTaskChanged?.(updated);
  }

  /** Archives the Trello card for a task that was just deleted locally.
   * Pass the deleted record (TaskStore.delete already returns it). */
  async archiveTask(task: Pick<TaskRecord, "projectId" | "trelloCardId">): Promise<void> {
    const creds = this.deps.credentials();
    if (!creds || !task.projectId || !task.trelloCardId) return;
    if (!this.deps.trelloLinks.get(task.projectId)) return;
    try {
      await trello.updateCard(creds, task.trelloCardId, { closed: true });
    } catch (error) {
      this.log(`Trello archive failed: ${message(error)}`);
    }
  }

  /** Pulls one linked project's board and reconciles it into local tasks.
   * New cards become new tasks; existing linked cards apply Trello's
   * content only when it actually differs from the local task, so a pull
   * right after this module's own push is always a no-op. Cards missing
   * from the board are left alone — pull never deletes a local task. */
  async pullProject(projectId: string): Promise<void> {
    const creds = this.deps.credentials();
    if (!creds) return;
    const link = this.deps.trelloLinks.get(projectId);
    if (!link) return;
    let cards: trello.TrelloCard[];
    try {
      cards = await trello.listBoardCards(creds, link.boardId);
    } catch (error) {
      this.log(`Trello pull failed for project ${projectId}: ${message(error)}`);
      return;
    }
    const statusByListId = new Map<string, TaskStatus>(
      (Object.entries(link.lists) as Array<[TaskStatus, string]>).map(([status, listId]) => [listId, status]),
    );
    const existingByCardId = new Map(
      this.deps.taskStore.list({ projectId }).filter((task) => task.trelloCardId).map((task) => [task.trelloCardId as string, task]),
    );

    for (const card of cards) {
      const status = statusByListId.get(card.idList);
      if (!status) continue; // a list we don't track (extra list the user added on Trello)
      try {
        const existing = existingByCardId.get(card.id);
        if (!existing) {
          if (card.closed || !card.name.trim()) continue; // don't resurrect archived/blank cards as new tasks
          const created = this.deps.taskStore.create({ title: card.name, description: card.desc, status, projectId }, { kind: "sync", source: "trello" });
          const linked = this.deps.taskStore.linkTrelloCard(created.id, card.id, card.url);
          this.deps.onTaskChanged?.(linked);
          continue;
        }
        const changed = existing.title !== card.name || existing.description !== card.desc || existing.status !== status;
        if (!changed) continue;
        const cardTime = Date.parse(card.dateLastActivity) || 0;
        if (cardTime <= existing.updatedAt) continue; // local is at least as fresh
        const updated = this.deps.taskStore.update(
          existing.id,
          existing.revision,
          { title: card.name, description: card.desc, status },
          { kind: "sync", source: "trello" },
        );
        this.deps.onTaskChanged?.(updated);
      } catch (error) {
        this.log(`Trello pull skipped card ${card.id}: ${message(error)}`);
      }
    }
  }

  async pullAll(): Promise<void> {
    for (const link of this.deps.trelloLinks.list()) {
      await this.pullProject(link.projectId);
    }
  }

  /** Starts the background poller; returns a function that stops it. */
  startPolling(intervalMs = 45_000): () => void {
    const timer = setInterval(() => {
      void this.pullAll();
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
