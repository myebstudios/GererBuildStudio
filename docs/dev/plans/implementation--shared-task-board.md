# Implementation plan: shared task board

## Objective

Add a first-class, live Kanban board that is shared by the user and every bot in the local Gerer Build Studio harness. Users will be able to create, edit, assign, move, filter, and delete tasks. Agents will be able to discover suitable work, create tasks, claim unassigned work, update progress, and delegate work to another bot through authenticated MCP tools.

The initial board will use the existing workflow statuses (`todo`, `doing`, `review`, and `done`) and support structured project, assignee, task type, priority, tag, due-date, and free-text filtering. It will not autonomously wake bots, schedule background turns, execute a task merely because it was assigned, synchronize with GitHub/Trello/Linear, or replace the repository-maintenance Markdown board under `docs/dev/fixes/`.

## Current state

- `src/App.tsx:15-81` selects between Projects, rooms, direct chats, and overlays. `src/components/Sidebar.tsx:719-740` already provides the visual and behavioral pattern for a first-class Projects destination.
- `src/state/store.tsx:143-213` owns server-backed application state and mutually exclusive navigation flags. It loads initial state through HTTP and folds the app's single `/api/events` SSE stream at `src/state/store.tsx:845-985`; a task board must use that same transport.
- `server/index.ts:40-75` creates one harness-owned store and the authenticated peer-agent integration. Its public HTTP router and SSE broadcaster are the correct shared boundary for task commands and live updates.
- `server/store.ts:180-230` persists local harness data beneath the configured data directory, but it has no task domain or conflict/version semantics.
- `server/projects.ts:25-116` safely reads the desktop project registry and resolves stable project IDs, mentions, availability, and canonical paths. Task project references should use this registry rather than accepting arbitrary filesystem paths.
- `server/drivers/agents-proxy.ts:17-104` currently exposes only `list_bots` and `ask_bot` through the authenticated, harness-owned MCP surface. This is the natural agent interface for task discovery and delegation.
- `server/drivers/agents-proxy.test.ts:1-151` contract-tests the MCP proxy with a local HTTP stub. `server/index.test.ts` and the isolated-data setup in `server/testing/` provide the required server integration pattern.
- The repository-native Markdown board is an engineering workflow and source of project history. The product task board must use separate runtime persistence and must not read or rewrite `docs/dev/fixes/`.

## Proposed changes

1. **Create a validated task domain and atomic local persistence.**
   - Add `server/tasks.ts` with a `TaskStore` whose data directory is injected for tests and points to the harness data directory in production.
   - A task will contain an ID, title, Markdown-capable description, acceptance criteria, `todo | doing | review | done` status, `feature | bug | research | documentation | maintenance` type, `low | normal | high | urgent` priority, normalized tags, optional due date, optional registered project ID, optional assignee bot ID, column position, created/updated timestamps, actor attribution, a revision number, and an append-only activity trail for creation, edits, moves, claims, and delegation.
   - Project and bot references will remain ID-based. API responses will enrich them with current display metadata; missing projects or deleted/hidden bots will remain visible as unavailable references instead of silently changing historical tasks.
   - Validate input lengths, enum values, dates, tags, project IDs, bot IDs, and status transitions at the server boundary. Persist `tasks.json` with a sibling temporary file plus rename so a partial write cannot corrupt the last good board. Malformed saved data will produce a clear startup/read error and will not be overwritten.
   - All updates will require the caller's last-seen revision. A stale edit or competing claim returns a conflict containing the latest task. Claiming will be one synchronous compare-and-update operation in the harness, so two agents cannot both win an unassigned task.

2. **Expose public task APIs and live board events.**
   - Add public routes for listing board data, creating a task, patching editable fields or status/position, atomically claiming a task, delegating/assigning it, and deleting it.
   - Return sanitized project choices (ID, name, mention, and availability) without exposing filesystem paths to the browser response. Reuse the already-loaded bot roster for agent labels and filters.
   - Broadcast `task.created`, `task.updated`, and `task.deleted` SSE frames only after persistence succeeds. Errors use the existing JSON error shape; validation is `400`, missing references are `404`, and revision/claim conflicts are `409` with the latest record.
   - User-authored commands will be attributed to `user`; internal agent calls will derive the actor from the authenticated proxy's `OMB_BOT_ID`, never from an untrusted actor field in a request body.

3. **Integrate task state into the existing React transport and navigation.**
   - Add task types, initial loading, reducer actions, optimistic command handling, conflict replacement, and SSE folding to `src/state/store.tsx` (or a small pure helper imported there). No additional `EventSource` or renderer-side persistence will be introduced.
   - Add a mutually exclusive Task Board destination to the sidebar and shell. Selecting a conversation or Projects closes it; opening it closes conflicting settings, Plugins, Projects, and computer panels using the current navigation rules.
   - Keep failed writes recoverable: preserve the server's latest record on conflicts, surface an actionable message, and avoid leaving an optimistic card in a state the server rejected.

4. **Build the user-facing Kanban board.**
   - Create `src/components/TaskBoardScreen.tsx` with four horizontally scrollable columns at compact widths, task counts, a clear empty state, a create/edit detail modal, delete confirmation, and cards that expose project, assignee, type, priority, tags, due state, and recent activity without overcrowding the board.
   - Support moving and reordering cards with pointer drag-and-drop plus an accessible status/position control as a keyboard and touch fallback. Assignment and project choices come from the live bot roster and registered project metadata.
   - Add a compact filter bar for text, project, agent (including unassigned/unavailable), status, type, priority, tags, and overdue state. Filters compose with AND semantics, active filters are visibly removable, and a single action clears them.
   - Reuse existing palette, typography, modal, focus, button, loading, error, and responsive patterns. The board remains usable in the web UI because task persistence is server-backed, even though local project folder management itself remains desktop-only.

5. **Extend the agent MCP task surface.**
   - Add `list_tasks`, `create_task`, `claim_task`, `update_task`, and `delegate_task` schemas to `server/drivers/agents-proxy.ts`.
   - `list_tasks` accepts project, assignee, status, type, priority, tag, overdue, and text filters and returns IDs, revisions, task details, current assignment, and the registered project's canonical path when available to that local agent.
   - `claim_task` only claims an unassigned non-complete task and moves it to `doing`; a task already owned by the caller is idempotent. `delegate_task` validates the target through the visible bot roster and records both actors in activity. `update_task` allows content/progress changes but not deletion or actor spoofing.
   - Tool results will explain revision or ownership conflicts and return the latest task so an agent can reconsider rather than overwriting another actor's work.
   - Add a short system-prompt nudge beside the existing delegation guidance so capable providers know the shared board exists; tools still run only during an agent turn and do not create a background worker.

6. **Test and document the complete workflow.**
   - Add focused `TaskStore` tests for strict reads, atomic writes, normalization, ordering, filtering, activity attribution, stale revisions, simultaneous claims, missing references, and persistence across a new store instance.
   - Extend server integration tests for public CRUD, internal authorization/actor derivation, SSE task frames, conflicts, and isolated test homes. Tests will wait on returned responses or observable SSE events rather than fixed sleeps and will never touch the real user data directory.
   - Extend the agents-proxy contract stub for every new task tool, input validation, authentication, rendered task/project context, and conflict responses.
   - Add pure client tests for filter composition, ordering, reducer SSE folding, optimistic reconciliation, and conflict replacement. Run the full type-check, test suite, and production build.
   - Update `README.md` with the Task Board destination, the task lifecycle, filter fields, agent claiming/delegation behavior, persistence location, and the explicit requirement that a user-initiated turn is still needed for a bot to act.

## Verification

Automated checks:

1. `pnpm typecheck`.
2. `pnpm test`.
3. `pnpm build`.
4. Focused task-domain, server-route, agent-proxy, and client reducer/filter tests.

Manual scenarios at both 900×600 and 1440×920:

1. Open Task Board from the sidebar, switch among Projects, rooms, and direct chats, and confirm no stale overlay remains.
2. Create tasks with and without a project, assignee, due date, criteria, and tags; edit each field and confirm it survives reload and server restart.
3. Combine text, project, agent, status, type, priority, tag, and overdue filters; clear them and confirm the full board returns.
4. Move and reorder cards with a pointer, then repeat status movement using only the keyboard-accessible fallback.
5. Open two clients, edit the same task, and confirm the second stale write is rejected and refreshed to the latest record without data loss.
6. Have two agents attempt to claim one task and verify one winner, one explanatory conflict, correct attribution, and a live update in the open UI.
7. Ask one agent to create a task, delegate it to another agent, and update it through `doing` and `review`; confirm the user can inspect the activity trail.
8. Delete or hide an assigned bot and remove or move a referenced project; confirm the task remains visible with an unavailable-reference label and can be reassigned.
9. Exercise validation, server disconnect, malformed persistence fixture, delete confirmation, long titles/descriptions, many tags, empty columns, overflow, focus order, Escape behavior, and zero browser console errors.

## Risks and rollback

- **Competing agents overwrite work:** Revision checks and an atomic claim operation prevent silent last-write-wins behavior. Conflict responses always include current state.
- **Agents mutate tasks outside their authority:** The internal routes derive identity from the per-process environment and shared bearer token. Agents cannot spoof history actors or delete tasks; delegation targets are validated against the harness roster.
- **Persistence corruption or unbounded content:** Atomic replacement preserves the last complete file. Strict field/count/length limits and bounded activity entries keep storage predictable, while malformed existing data is left untouched for recovery.
- **Stale project or bot references:** IDs are retained for history and enriched at read time. Missing references remain visible and filterable until a user reassigns them.
- **Board UI becomes too dense:** Cards show compact metadata while full description, criteria, and activity live in the detail modal. Horizontal column scrolling protects compact desktop layouts.
- **Task assignment is mistaken for execution:** The UI and documentation will state that assignment records intent; a user turn (or a future scheduler) is still required to run an agent.
- **Regression in the single-stream client:** Task events extend the existing reducer and SSE switch, with focused folding/reconnect tests; no second transport is added.

Rollback is a scoped Git revert. Older builds will ignore `tasks.json`; rollback will not delete it, so task data remains available if the feature is restored. No project directories, conversations, or repository board files are modified by runtime task operations.

## Approval

Status: awaiting user approval
