import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  TaskConflictError,
  TaskStore,
  TaskValidationError,
  filterTasks,
  type TaskActor,
} from "./tasks.ts";

const roots: string[] = [];
const user: TaskActor = { kind: "user" };
const scout: Extract<TaskActor, { kind: "bot" }> = { kind: "bot", botId: "bot-scout", name: "Scout" };
const builder: Extract<TaskActor, { kind: "bot" }> = { kind: "bot", botId: "bot-builder", name: "Builder" };

function fixture(): { root: string; store: TaskStore } {
  const root = mkdtempSync(join(tmpdir(), "omb-tasks-"));
  roots.push(root);
  return { root, store: new TaskStore(root) };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("TaskStore", () => {
  it("normalizes, persists, and reloads structured tasks", () => {
    const { root, store } = fixture();
    const task = store.create({
      title: "  Ship the board  ",
      description: " Keep state live. ",
      acceptanceCriteria: [" Works after restart "],
      status: "todo",
      type: "feature",
      priority: "high",
      tags: ["UI", "ui", " Agents "],
      projectId: "project-one",
      dueAt: "2026-09-01",
    }, user);

    expect(task).toMatchObject({
      title: "Ship the board",
      description: "Keep state live.",
      acceptanceCriteria: ["Works after restart"],
      tags: ["ui", "agents"],
      revision: 1,
      createdBy: user,
    });
    expect(new TaskStore(root).get(task.id)).toEqual(task);
    expect(JSON.parse(readFileSync(join(root, "tasks.json"), "utf8"))).toHaveLength(1);
  });

  it("rejects malformed persistence without overwriting it", () => {
    const { root } = fixture();
    const file = join(root, "tasks.json");
    writeFileSync(file, JSON.stringify([{ id: "broken" }]));
    expect(() => new TaskStore(root)).toThrow(TaskValidationError);
    expect(readFileSync(file, "utf8")).toContain("broken");
  });

  it("validates bounded input", () => {
    const { store } = fixture();
    expect(() => store.create({ title: " " }, user)).toThrow("Title is required");
    expect(() => store.create({ title: "x", type: "other" as any }, user)).toThrow("type is invalid");
    expect(() => store.create({ title: "x", tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }, user)).toThrow("20 items");
  });

  it("requires the latest revision and returns current state on conflicts", () => {
    const { store } = fixture();
    const created = store.create({ title: "Original" }, user);
    const updated = store.update(created.id, created.revision, { title: "New title" }, scout);
    expect(updated.revision).toBe(2);
    expect(updated.updatedBy).toEqual(scout);
    try {
      store.update(created.id, created.revision, { priority: "urgent" }, user);
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(TaskConflictError);
      expect((error as TaskConflictError).latest.title).toBe("New title");
    }
  });

  it("allows exactly one agent to claim unassigned work", () => {
    const { store } = fixture();
    const created = store.create({ title: "Claim me" }, user);
    const claimed = store.claim(created.id, created.revision, scout);
    expect(claimed).toMatchObject({ assigneeBotId: scout.botId, status: "doing", revision: 2 });
    expect(store.claim(created.id, claimed.revision, scout)).toEqual(claimed);
    expect(() => store.claim(created.id, claimed.revision, builder)).toThrow(TaskConflictError);
  });

  it("delegates, moves, records activity, and deletes by revision", () => {
    const { store } = fixture();
    const created = store.create({ title: "Coordinate" }, scout);
    const delegated = store.delegate(created.id, created.revision, builder.botId, builder.name, scout);
    const moved = store.update(delegated.id, delegated.revision, { status: "review" }, builder);
    expect(moved.activity.map((entry) => entry.action)).toEqual(["created", "delegated", "moved"]);
    expect(moved.activity[1].detail).toContain("Builder");
    expect(() => store.delete(moved.id, delegated.revision)).toThrow(TaskConflictError);
    expect(store.delete(moved.id, moved.revision).id).toBe(moved.id);
    expect(store.list()).toEqual([]);
  });

  it("composes task filters and keeps board ordering", () => {
    const { store } = fixture();
    const overdue = store.create({
      title: "Fix login race",
      description: "Reproduce authentication timeout",
      type: "bug",
      priority: "urgent",
      tags: ["auth"],
      projectId: "p1",
      dueAt: 1,
    }, user);
    store.create({ title: "Write guide", type: "documentation", tags: ["docs"], projectId: "p2" }, user);
    const claimed = store.claim(overdue.id, overdue.revision, scout);

    expect(filterTasks(store.tasks, {
      text: "authentication",
      projectId: "p1",
      assigneeBotId: scout.botId,
      status: "doing",
      type: "bug",
      priority: "urgent",
      tag: "AUTH",
      overdue: true,
    }, Date.now())).toEqual([claimed]);
    expect(store.list({ assigneeBotId: null })).toHaveLength(1);
  });
});
