import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { TrelloLinkStore } from "./trelloLinks.ts";

const roots: string[] = [];
const LISTS = { todo: "l-todo", doing: "l-doing", review: "l-review", done: "l-done" };

function fixture(): { root: string; store: TrelloLinkStore } {
  const root = mkdtempSync(join(tmpdir(), "gbs-trello-links-"));
  roots.push(root);
  return { root, store: new TrelloLinkStore(root) };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("TrelloLinkStore", () => {
  it("starts empty and persists a new link across a fresh instance", () => {
    const { root, store } = fixture();
    expect(store.list()).toEqual([]);

    const link = store.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "https://trello.com/b/b1", lists: LISTS, linkedAt: 1 });

    expect(link).toMatchObject({ projectId: "project-1", boardId: "b1" });
    expect(store.get("project-1")).toEqual(link);
    expect(new TrelloLinkStore(root).get("project-1")).toEqual(link);
  });

  it("overwrites a link when re-set and removes it on unlink", () => {
    const { store } = fixture();
    store.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u1", lists: LISTS, linkedAt: 1 });
    const relinked = store.set("project-1", { boardId: "b2", boardName: "Studio v2", boardUrl: "u2", lists: LISTS, linkedAt: 2 });

    expect(store.get("project-1")).toMatchObject({ boardId: "b2" });
    expect(store.unlink("project-1")).toBe(true);
    expect(store.unlink("project-1")).toBe(false);
    expect(store.get("project-1")).toBeUndefined();
    expect(relinked.boardId).toBe("b2");
  });

  it("picks up an externally edited file and ignores a malformed one", () => {
    const { root, store } = fixture();
    store.set("project-1", { boardId: "b1", boardName: "Studio", boardUrl: "u1", lists: LISTS, linkedAt: 1 });
    const file = join(root, "trello-links.json");

    writeFileSync(file, JSON.stringify({ "project-2": { boardId: "b2", boardName: "Other", boardUrl: "u2", lists: LISTS, linkedAt: 2 } }));
    expect(store.list().map((link) => link.projectId)).toEqual(["project-2"]);

    writeFileSync(file, "not json");
    expect(store.list().map((link) => link.projectId)).toEqual(["project-2"]); // keeps last-good state
    expect(readFileSync(file, "utf8")).toBe("not json"); // never overwritten by a read
  });
});
