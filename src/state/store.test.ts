import { describe, expect, it } from "vitest";

import { initialState, reducer, type Bot, type Group } from "./store";

const message = (id: string) => ({
  id,
  role: "user" as const,
  kind: "text" as const,
  text: id,
  at: 1,
  parentId: null,
});

const bot = (id: string, threadId: string): Bot => ({
  id,
  threadId,
  name: id,
  title: "",
  description: "",
  notifications: true,
  color: "green",
  unread: true,
  modelSelection: { instanceId: "test", model: "test" },
  messages: [message(`${id}-message`)],
  activeLeafId: `${id}-message`,
});

const group = (id: string, threadId: string): Group => ({
  id,
  threadId,
  name: id,
  memberIds: [],
  bulletin: "",
  unread: true,
  createdAt: 1,
  messages: [message(`${id}-message`)],
});

describe("threadCleared state", () => {
  it("clears one direct transcript and its active branch", () => {
    const first = bot("first", "thread-1");
    const second = bot("second", "thread-2");
    const state = { ...initialState, bots: [first, second] };

    const next = reducer(state, { type: "threadCleared", threadId: first.threadId });

    expect(next.bots[0]).toMatchObject({ messages: [], activeLeafId: null, unread: false });
    expect(next.bots[1]).toBe(second);
  });

  it("clears one room transcript without changing other rooms", () => {
    const first = group("first", "thread-1");
    const second = group("second", "thread-2");
    const state = { ...initialState, groups: [first, second] };

    const next = reducer(state, { type: "threadCleared", threadId: first.threadId });

    expect(next.groups[0]).toMatchObject({ messages: [], unread: false });
    expect(next.groups[1]).toBe(second);
  });
});
