// Exercises TrelloSync against real TaskStore/TrelloLinkStore instances
// (isolated tmp dirs, same as tasks.test.ts) with only the network boundary
// mocked — the most faithful way to prove push/pull/no-echo behavior
// without hitting the real Trello API.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskStore, type TaskActor, type TaskRecord } from "./tasks.ts";
import { TrelloLinkStore } from "./trelloLinks.ts";
import { TrelloSync } from "./trelloSync.ts";

const roots: string[] = [];
const user: TaskActor = { kind: "user" };
const LISTS = { todo: "l-todo", doing: "l-doing", review: "l-review", done: "l-done" };
const CREDS = { key: "app-key", token: "user-token" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gbs-trello-sync-"));
  roots.push(root);
  const taskStore = new TaskStore(root);
  const trelloLinks = new TrelloLinkStore(root);
  const changed: TaskRecord[] = [];
  const sync = new TrelloSync({
    taskStore,
    trelloLinks,
    credentials: () => CREDS,
    onTaskChanged: (task) => changed.push(task),
    log: () => {}, // silence expected failure-path logging in tests
  });
  return { taskStore, trelloLinks, sync, changed };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("TrelloSync.pushTask", () => {
  it("is a no-op when the task's project isn't linked", async () => {
    const { taskStore, sync } = fixture();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const task = taskStore.create({ title: "Unlinked", projectId: "project-1" }, user);

    await sync.pushTask(task.id);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(taskStore.get(task.id)?.trelloCardId).toBeNull();
  });

  it("creates a card on first push and links it back onto the task", async () => {
    const { taskStore, trelloLinks, sync, changed } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "https://trello.com/b/b1", lists: LISTS, linkedAt: 1 });
    const task = taskStore.create({ title: "Ship the board", projectId: "project-1" }, user);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      id: "card-1", name: "Ship the board", desc: "", idList: "l-todo", closed: false,
      shortLink: "abc", url: "https://trello.com/c/abc", dateLastActivity: new Date().toISOString(),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sync.pushTask(task.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ idList: "l-todo", name: "Ship the board" });
    const updated = taskStore.get(task.id)!;
    expect(updated.trelloCardId).toBe("card-1");
    expect(updated.trelloCardUrl).toBe("https://trello.com/c/abc");
    expect(changed).toEqual([updated]);
  });

  it("updates the existing card's name and list instead of creating a new one", async () => {
    const { taskStore, trelloLinks, sync } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    const created = taskStore.create({ title: "Ship the board", projectId: "project-1" }, user);
    const linked = taskStore.linkTrelloCard(created.id, "card-1", "https://trello.com/c/abc");
    const moved = taskStore.update(linked.id, linked.revision, { status: "doing" }, user);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "card-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await sync.pushTask(moved.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/1/cards/card-1");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ idList: "l-doing" });
  });

  it("recreates the card when Trello reports it 404s (deleted out from under us)", async () => {
    const { taskStore, trelloLinks, sync } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    const created = taskStore.create({ title: "Ship the board", projectId: "project-1" }, user);
    taskStore.linkTrelloCard(created.id, "gone-card", "https://trello.com/c/gone");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("archived", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(200, {
        id: "new-card", name: "Ship the board", desc: "", idList: "l-todo", closed: false,
        shortLink: "new", url: "https://trello.com/c/new", dateLastActivity: new Date().toISOString(),
      }));
    vi.stubGlobal("fetch", fetchMock);

    await sync.pushTask(created.id);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(taskStore.get(created.id)?.trelloCardId).toBe("new-card");
  });
});

describe("TrelloSync.archiveTask", () => {
  it("closes the linked card, and no-ops without a card or link", async () => {
    const { trelloLinks, sync } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "card-1", closed: true }));
    vi.stubGlobal("fetch", fetchMock);

    await sync.archiveTask({ projectId: "project-1", trelloCardId: "card-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ closed: true });

    fetchMock.mockClear();
    await sync.archiveTask({ projectId: "project-1", trelloCardId: null });
    await sync.archiveTask({ projectId: null, trelloCardId: "card-1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TrelloSync.pullProject", () => {
  it("creates a local task for a new open card in a tracked list", async () => {
    const { taskStore, trelloLinks, sync, changed } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, [
      { id: "card-1", name: "Added on Trello", desc: "from the board", idList: "l-doing", closed: false, shortLink: "abc", url: "https://trello.com/c/abc", dateLastActivity: new Date().toISOString() },
    ])));

    await sync.pullProject("project-1");

    const tasks = taskStore.list({ projectId: "project-1" });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: "Added on Trello", status: "doing", trelloCardId: "card-1", createdBy: { kind: "sync", source: "trello" } });
    expect(changed).toHaveLength(1);
  });

  it("ignores closed cards, blank cards, and cards in untracked lists", async () => {
    const { taskStore, trelloLinks, sync } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, [
      { id: "closed", name: "Archived", desc: "", idList: "l-todo", closed: true, shortLink: "a", url: "u", dateLastActivity: new Date().toISOString() },
      { id: "blank", name: "  ", desc: "", idList: "l-todo", closed: false, shortLink: "b", url: "u", dateLastActivity: new Date().toISOString() },
      { id: "extra-list", name: "On a list we don't track", desc: "", idList: "l-someone-added", closed: false, shortLink: "c", url: "u", dateLastActivity: new Date().toISOString() },
    ])));

    await sync.pullProject("project-1");

    expect(taskStore.list({ projectId: "project-1" })).toHaveLength(0);
  });

  it("applies a newer Trello-side edit and attributes it to sync", async () => {
    const { taskStore, trelloLinks, sync } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    const created = taskStore.create({ title: "Original title", projectId: "project-1" }, user);
    taskStore.linkTrelloCard(created.id, "card-1", "https://trello.com/c/abc");
    const future = new Date(Date.now() + 60_000).toISOString();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, [
      { id: "card-1", name: "Renamed on Trello", desc: "", idList: "l-todo", closed: false, shortLink: "abc", url: "u", dateLastActivity: future },
    ])));

    await sync.pullProject("project-1");

    const updated = taskStore.get(created.id)!;
    expect(updated.title).toBe("Renamed on Trello");
    expect(updated.updatedBy).toEqual({ kind: "sync", source: "trello" });
  });

  it("never lets an older or unchanged Trello card overwrite a fresher local edit (no echo loop)", async () => {
    const { taskStore, trelloLinks, sync } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    const created = taskStore.create({ title: "Local edit wins", projectId: "project-1" }, user);
    const linked = taskStore.linkTrelloCard(created.id, "card-1", "https://trello.com/c/abc");
    // simulate: we just pushed this exact state to Trello (card now matches local content)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, [
      { id: "card-1", name: linked.title, desc: linked.description, idList: "l-todo", closed: false, shortLink: "abc", url: "u", dateLastActivity: new Date().toISOString() },
    ])));

    await sync.pullProject("project-1");

    expect(taskStore.get(created.id)?.revision).toBe(linked.revision); // untouched — content already matched
  });

  it("is a no-op for an unlinked project and logs (not throws) on a network failure", async () => {
    const { sync } = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(sync.pullProject("not-linked")).resolves.toBeUndefined();

    const { trelloLinks, sync: sync2 } = fixture();
    trelloLinks.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u", lists: LISTS, linkedAt: 1 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(sync2.pullProject("project-1")).resolves.toBeUndefined();
  });
});
