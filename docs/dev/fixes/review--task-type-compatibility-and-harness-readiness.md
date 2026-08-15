---
status: review
created: 2026-08-15
updated: 2026-08-15
scope: task type compatibility and harness readiness
owner: antigravity
related: [review--automatic-desktop-dev-launcher.md, review--shared-task-board.md]
---

# Task type compatibility and harness readiness

Support generic `task` type items across the server TaskStore, MCP comms proxy schema, and UI task board, preventing server boot validation crashes when loading tasks created with `type: "task"`, and ensure `dev:desktop` waits for the harness server to become ready before launching Electron.

---

## 1. Task store type normalization and schema alignment

- [?] **Add task type to TASK_TYPES in task store** — `server/tasks.ts:7`. Include `task` in `TASK_TYPES` so persisted tasks with generic type do not fail validation on startup.
- [?] **Align frontend TaskType definitions** — `src/lib/taskBoard.ts:2`. Add `task` to shared `TASK_TYPES` array.
- [?] **Update MCP agents-proxy task schemas** — `server/drivers/agents-proxy.ts:55`. Include `task` in enum definitions for `list_tasks`, `create_task`, and `update_task`.
- [?] **Add unit test for task type persistence** — `server/tasks.test.ts:57`. Verify all task types including `task` persist and reload correctly.

## 2. Dev desktop launcher readiness

- [?] **Wait for harness server health before Electron launch** — `scripts/dev-desktop.mjs:55`. Add `waitForHarness` and child process exit handlers to ensure the backend server is ready prior to opening the desktop shell.
