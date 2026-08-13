import { describe, expect, it } from "vitest";

import { initialState, reducer, type Bot, type Group } from "../state/store";
import type { TaskRecord } from "./taskBoard";

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

describe("room approval cards", () => {
  it("settles the card in the room transcript", () => {
    const room = group("room", "room-thread");
    room.messages = [{
      id: "approval-message",
      role: "bot",
      kind: "options",
      at: 1,
      from: { botId: "agent", name: "Agent", color: "purple" },
      card: {
        title: "Approval needed",
        subtitle: "Run the preview server?",
        options: ["Allow", "Deny"],
        requestId: "request-one",
      },
    }];
    const state = { ...initialState, bots: [bot("agent", "agent-thread")], groups: [room] };

    const next = reducer(state, {
      type: "answerCard",
      botId: "agent",
      threadId: room.threadId,
      messageId: "approval-message",
      answer: "Allow",
    });

    expect(next.groups[0].messages[0].card?.answered).toBe("Allow");
    expect(next.bots[0]).toBe(state.bots[0]);
  });
});

describe("shared task board state", () => {
  const task = (revision: number): TaskRecord => ({
    id: "task-one",
    title: `Task revision ${revision}`,
    description: "",
    acceptanceCriteria: [],
    status: "todo",
    type: "feature",
    priority: "normal",
    tags: [],
    dueAt: null,
    projectId: null,
    assigneeBotId: null,
    position: 1024,
    revision,
    createdAt: 1,
    updatedAt: revision,
    createdBy: { kind: "user" },
    updatedBy: { kind: "user" },
    activity: [],
    project: null,
    assignee: null,
  });

  it("hydrates, folds live updates, and removes deleted tasks", () => {
    const hydrated = reducer(initialState, {
      type: "hydrateTasks",
      tasks: [task(1)],
      projects: [{ id: "p1", name: "One", mention: "one", available: true }],
    });
    expect(hydrated.tasksLoaded).toBe(true);
    const updated = reducer(hydrated, { type: "taskUpserted", task: task(2) });
    expect(updated.tasks).toEqual([task(2)]);
    expect(reducer(updated, { type: "taskDeleted", taskId: "task-one" }).tasks).toEqual([]);
  });

  it("keeps task and project destinations mutually exclusive with chats", () => {
    const openBoard = reducer(initialState, { type: "toggleTaskBoard", open: true });
    expect(openBoard).toMatchObject({ taskBoardOpen: true, projectsOpen: false });
    const openProjects = reducer(openBoard, { type: "toggleProjects", open: true });
    expect(openProjects).toMatchObject({ taskBoardOpen: false, projectsOpen: true });
    const withBot = { ...openProjects, bots: [bot("one", "thread-1")] };
    expect(reducer(withBot, { type: "select", id: "one" })).toMatchObject({ taskBoardOpen: false, projectsOpen: false });
  });
});
