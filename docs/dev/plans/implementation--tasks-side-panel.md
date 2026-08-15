# Implementation plan: per-agent and per-room Tasks side panel

## Objective

Give every bot chat and every room a "Tasks" side panel that shows the tasks relevant to that conversation, without leaving the chat:

- **Bot chat**: tasks where `TaskRecord.assigneeBotId === bot.id`.
- **Room**: the user can set a project on the room; the panel then shows tasks where `TaskRecord.projectId` matches that project.

Also bundled (already done, see below): the mobile preview panel no longer auto-opens on first load at wide window widths — it now only opens when the user has explicitly opened it before.

Out of scope: editing tasks from the panel (read-only list; clicking a task opens the full Task Board), multi-project rooms, and per-bot project assignment (only rooms get a project picker, per the request).

## Current state

- **Mobile preview auto-open (fixed already)**: `src/components/ChatView.tsx:594-597` and `src/components/GroupView.tsx:144-147` seeded `mobilePreviewOpen` from `window.matchMedia("(min-width: 1180px)").matches` whenever `localStorage` had no saved value — so it opened unprompted on any wide window. Changed to default `false` until the user has explicitly toggled it once (localStorage holds `"true"`/`"false"` after that). `activityOpen` (Activity panel) intentionally keeps the width-based default — not in scope.
- **Panel wiring precedent**: both `ChatView.tsx` and `GroupView.tsx` follow the same pattern for existing panels (Computer, Activity, Mobile Preview) — a local `useState` (or global `state.computerOpen` for Computer specifically), a header toggle button, and two renders of the panel component: a persistent rail (`hidden min-[1180px]:flex`) and a mobile overlay drawer (`absolute inset-y-0 right-0 z-30 ... max-w-[88vw]` with a backdrop button), e.g. `GroupView.tsx:353-377` (Activity) and `:379-396` (Mobile Preview). A new Tasks panel follows the identical shape.
- **Task data**: `TaskRecord` (`src/lib/taskBoard.ts:31-54`) already has `assigneeBotId: string | null` and `projectId: string | null` (plus denormalized `assignee`/`project`). `state.tasks: TaskRecord[]` (`src/state/store.tsx:175`) is hydrated once and kept live via `task.created`/`task.updated`/`task.deleted` SSE frames — no new fetch needed, the panel just filters this array reactively. `filterBoardTasks`/`EMPTY_TASK_FILTERS` (`taskBoard.ts:78-101`) already support `projectId`/`assigneeBotId` filters and can be reused directly.
- **Rooms have no project today**: `Group` (`src/state/store.tsx:66-81`) / `GroupRecord` (`server/store.ts:71-88`) have no `projectId` field. `store.patchGroup` (`server/store.ts:250`) only accepts `name | memberIds | bulletin | autoHandoffs | unread | busyBotId | queuedBotIds`. The `PATCH /api/groups/:id` route (`server/index.ts:1214-1233`) only forwards `name | bulletin | unread | autoHandoffs | memberIds`. `docs/dev/plans/implementation--project-mentions.md:15` explicitly scoped a persistent room↔project link OUT of that feature — this plan is what fills that gap.
- **Project catalog**: `state.taskProjects: TaskProject[]` (`store.tsx:176`) is already loaded and used for exactly this kind of picker — see the existing project `<select>` in `TaskBoardScreen.tsx:248` (`#{project.mention} · {project.name}`, with a "No project" empty option). Reuse verbatim for the room's project picker.
- **Bots have no project field and don't need one** — the per-bot panel filters by `assigneeBotId`, which already exists on tasks; no bot-side schema change required.

## Proposed changes

1. **Add `projectId` to rooms (server + client types).**
   - `server/store.ts`: add `projectId?: string | null` to `GroupRecord`; extend `patchGroup`'s allowed-keys union to include `"projectId"`.
   - `server/index.ts` `PATCH /api/groups/:id` (`:1214-1233`): accept `projectId` in the body (`string | null`), validate it's a string or null, forward to `store.patchGroup`.
   - `src/state/store.tsx`: add `projectId?: string | null` to `Group`; extend the `patchGroup` action's allowed patch keys to include `projectId` (mirrors how `bulletin`/`autoHandoffs` are already patchable from components).

2. **Build a shared `TasksPanel` component** (`src/components/TasksPanel.tsx`), modeled on `RoomActivityPanel.tsx`'s shell (`<aside className="... w-[320px] ... border-l ...">`, header with icon/title/count + close button):
   - Props: `tasks: TaskRecord[]` (already filtered by the caller), `emptyLabel: string`, `onClose?: () => void`, `className?: string`, and for rooms only, the project-picker bits (see #3).
   - Body: a compact, read-only list — status icon (reuse `STATUS_ICONS`/`STATUS_LABELS` color mapping from `TaskBoardScreen.tsx:40-52`), title, priority pill (reuse `PRIORITY_STYLES`), due date (overdue in `text-danger`, matching `TaskCard`'s existing overdue treatment), tags. No drag/status-change affordances — this is a glance view, not another kanban.
   - Clicking a task opens the Task Board pre-filtered to it (dispatch `{ type: "toggleTaskBoard", open: true }`; if `TaskBoardScreen` doesn't already support "jump to task", add a minimal `openTaskId` piece of state so the click at least opens the board — deep-linking to the exact card is a nice-to-have, not required for this plan).
   - Empty state: distinct copy for "no tasks assigned to you yet" (bot) vs "no project set for this room" / "no tasks in this project yet" (room).

3. **Room project picker.**
   - Small control in the room header or the bulletin area (next to the existing bulletin's "Add room instructions…" affordance) — a `<select>` using the exact `state.taskProjects` pattern already in `TaskBoardScreen.tsx:248` ("No project" + `#mention · name`).
   - On change, `dispatch({ type: "patchGroup", groupId: group.id, patch: { projectId: value || null } })`, matching the existing `saveBulletin` dispatch pattern (`GroupView.tsx:168-173`).
   - Shown inside the new Tasks panel header when no project is set (call to action), and as a small persistent label/edit affordance when one is set — avoids adding more buttons to the already-busy room header row.

4. **Wire the panel into `ChatView.tsx` and `GroupView.tsx`.**
   - Same triple: header toggle button (icon `ListChecks` or similar, distinct from `Activity`'s `ListTodo`... note `RoomActivityPanel` already uses the `ListTodo` icon for "Activity", so the Tasks button needs a different icon to avoid visual collision — e.g. `ClipboardList`), a `tasksOpen` local `useState` persisted to `localStorage` (`"chat-tasks-open"` / `"room-tasks-open"`, defaulting to `false` like the just-fixed mobile preview — no auto-open surprise for a brand-new panel either), and the rail/drawer dual render.
   - `ChatView.tsx`: `tasks = state.tasks.filter((t) => t.assigneeBotId === bot.id)`.
   - `GroupView.tsx`: `tasks = group.projectId ? state.tasks.filter((t) => t.projectId === group.projectId) : []`.
   - Badge count on the toggle button mirrors the `Activity`/count-badge treatment already used (`GroupView.tsx:213-217`).

## Verification

- `pnpm typecheck`, `pnpm build`.
- Server test for the extended `PATCH /api/groups/:id`: sets/clears `projectId`, rejects a non-string/non-null value, persists across a reload (`GroupRecord` round-trip).
- Manual, in a real browser against live data (not the user's active session — an isolated scratch server/data-dir, as done for the last two features): open a bot with assigned tasks → panel lists them; open a room, set a project via the picker, confirm the panel populates with that project's tasks and updates live when a task's status changes elsewhere (Task Board or another agent); confirm the panel does NOT auto-open on first load at any window width; confirm the mobile preview panel no longer auto-opens either, at both chat and room levels.

## Risks and rollback

- **Room project is single-valued**: a room can only ever surface one project's tasks. Acceptable per current scope (rooms already treat `#project` mentions as a single shared workspace convention, per the bulletin placeholder text "share its workspace").
- **`GroupRecord.projectId` is new persisted state**: purely additive (optional field), so existing `groups.json` records round-trip unaffected; rollback is a scoped revert.
- **Panel bloat**: bot/room headers already carry Computer/Activity/Preview buttons; adding a fourth risks crowding on narrow windows. Mitigation: the same `hidden sm:inline` label-collapse already used by the other buttons, and the drawer-at-narrow-width pattern keeps the layout intact below 1180px.

## Approval

Status: awaiting user approval
