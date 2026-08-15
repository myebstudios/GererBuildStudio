# Implementation plan: `%task` mentions

## Objective

Let the user reference a specific task inline in a chat message (bot or room) using `%task-slug`, mirroring the existing `#project` mention system: composer autocomplete, a clickable chip in the rendered message, and — like `#project` gives an agent its cwd — a `%task` mention tells the responding agent the referenced task's title, status, and description as trusted context.

Scope: the chat composer (`Composer.tsx`, used by both bot and room chat) only. Out of scope for this pass: the room bulletin editor and bot description field (`ProjectMentionTextarea.tsx`'s other two call sites) — they keep `#project`-only for now; and bot-authored message text does not get mention-chip rendering (matching current `#project` behavior — `ChatMarkdown.tsx` has no mention rendering today; only user-authored bubbles do).

## Current state

- **`@bot` mentions**: parsed locally in `Composer.tsx` (`mentionQueryAt`, no shared lib), inserted as literal `@Name `, matched server-side by `mentionedBots()` (`server/store.ts:135-153`) via longest-name match. Not chip-rendered anywhere — plain text.
- **`#project` mentions** (the pattern to mirror):
  - `src/lib/projectMentions.ts`: `projectMentionQueryAt` (trigger detection), `insertProjectMention` (literal `#mention ` splice), `projectMentionMatches` (regex `/#[a-z0-9][a-z0-9._-]*/gi` + lookup against known projects for rendering).
  - `Composer.tsx`: a local `mentionKind: "bot" | "project"` picks whichever trigger (`@` or `#`) is closest to the caret (`Composer.tsx:59-61`), branches the popup UI and arrow/enter/tab/escape handling.
  - `ProjectMentionText.tsx`: renders `#mention` matches as clickable chips (`bg-accent/12 text-accent`); used in `ChatView.tsx:294,491` (user message bubbles) and `GroupView.tsx:89,317` (room bulletin + transcript).
  - `ProjectMentionTextarea.tsx`: generic `#`-only textarea wrapper, used in `SettingsPanel.tsx:144` (bot description) and `GroupView.tsx:284` (bulletin) — NOT `Composer.tsx`, which has its own inline logic.
  - Server: `server/projects.ts` `mentionedProjects(text, projects)` (reverse-matches text → projects) and `resolveProjectContext(sources, projects)` (builds a system-prompt block + `cwd` for the first source with a match), called at `server/index.ts:468` (1:1 turns) and `:669` (room turns) with `[text, bot.description]` / `[latestUserText, group.bulletin, bot.description]` as sources.
- **`TaskRecord` has no slug today.** `server/tasks.ts:29-49` — only `id` (UUID), `title`, etc. `TaskProject.mention` (client, `taskBoard.ts:18-23`) belongs to the *project*, not the task, and is irrelevant here. A task mention slug must be newly introduced, generated once at creation (stable — does not change if the title is later edited, matching how a project's `mention` is a fixed registry field, not derived live).
- **`readRegisteredProjects()`** (`server/projects.ts:47-70`) is the closest precedent for slug validation/dedup: `MENTION_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/`, and a `Set` used to detect collisions (there: collision invalidates the whole registry, since it's hand-edited JSON — task slugs will instead auto-suffix on collision, since they're program-generated at task-creation time, not hand-authored).
- `TaskStore.create()` (`server/tasks.ts:314-349`) is the single place tasks are constructed; `taskView()` (`server/index.ts:892-912`) spreads `...task` into the client payload, so a new `TaskRecord.mention` field needs no extra wiring there.

## Proposed changes

1. **Add a stable `mention` slug to `TaskRecord`.**
   - `server/tasks.ts`: add `mention: string` to `TaskRecord`. Add a `slugify(title)` helper (lowercase, non-`[a-z0-9]` runs → `-`, trim leading/trailing `-`, cap length e.g. 40 chars, fall back to `"task"` if the title slugifies to empty).
   - In `TaskStore.create()`, generate the mention from the slugified title, then dedupe against `this.tasks` by appending `-2`, `-3`, … on collision (same idea as `readRegisteredProjects`'s collision set, but auto-resolving instead of rejecting).
   - `validateSavedTask()`: accept an existing `mention` field (string, matching the same pattern as `MENTION_PATTERN`); for legacy saved tasks that predate this field, backfill lazily the same way (slugify title + dedupe against already-loaded tasks) the first time the file loads, then persist so it's stable from then on.
   - Task mentions are **not** regenerated when a title is edited later — same stability guarantee as project mentions, so an old `%slug` reference in chat history keeps resolving to the same task.

2. **Server-side matching + agent context.**
   - `server/tasks.ts` (or a new small `server/taskMentions.ts` if it reads cleaner): `mentionedTasks(text, tasks): TaskRecord[]`, mirroring `mentionedProjects` — regex `/%[a-z0-9][a-z0-9._-]*/gi`, requires non-identifier char before `%` (so emails/percentages like `50%off` don't false-match), lookup by lowercase `mention`.
   - `resolveTaskContext(sources, tasks)`, mirroring `resolveProjectContext`: for the first source containing a `%task` match, build a system-prompt block per matched task — title, status, priority, description (truncated), assignee — and return `{ tasks: matched, system }`.
   - Wire into both turn-context assembly points in `server/index.ts` (`:468` and `:669`), alongside the existing `resolveProjectContext` calls, appending its `system` text to the same turn's system prompt. Sources: same ordering as the project version (`[text, bot.description]` / `[latestUserText, group.bulletin, bot.description]`), reading from `taskStore.list()` (already in scope at both call sites).

3. **Client mention lib + rendering.**
   - `src/lib/taskMentions.ts`: `taskMentionQueryAt`, `insertTaskMention`, `taskMentionMatches` — same shapes as `projectMentions.ts`, `%` trigger, matched against `state.tasks` by `task.mention`.
   - Generalize message-bubble rendering: rather than bolt a second independent regex pass onto `ProjectMentionText.tsx` (risk of two passes clobbering each other's replacements when a `#project` and `%task` mention sit in the same line), merge both match sets into one ordered list of chip/plain-text segments before rendering — smallest change is a new combined `renderMentions(text, projects, tasks)` used by `ProjectMentionText.tsx` (kept as the component name for minimal churn, or renamed `MentionText.tsx` — file rename is cosmetic, call sites (`ChatView.tsx:294,491`, `GroupView.tsx:89,317`) get the extra `tasks` prop). Task chips render distinctly (e.g. a different color token than project's `accent`, e.g. `warning` or a dedicated tone) and, on click, dispatch `{ type: "toggleTaskBoard", open: true }` (matching `TasksPanel`'s existing click-to-open behavior — deep-linking to the exact task is the same future nice-to-have noted in the Tasks-panel plan, not required here).
   - `Composer.tsx`: extend the local `mentionKind` union to `"bot" | "project" | "task"`. Add `taskMentionQueryAt` alongside the existing two, extend the "closest trigger wins" precedence check, add a task candidate list (filter `state.tasks` by `mention`/`title` substring, capped like the existing lists), a picker UI branch (reuse `ProjectSuggestionList`'s visual style or a small dedicated list — tasks show title + status, not a project's name/path), and `pickTaskMention` inserting `%{mention} `.

## Verification

- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Server tests: slug generation + dedup on `TaskStore.create()` (two tasks titled the same → `-2` suffix); legacy-task mention backfill on load; `mentionedTasks`/`resolveTaskContext` unit tests mirroring `server/projects.test.ts`'s structure for the project version.
- Client tests: `src/lib/taskMentions.test.ts` mirroring `projectMentions.test.ts` (trigger detection, insertion, match regex incl. the "don't match `50%off`" case).
- Manual, in a real browser against an isolated scratch server (not the user's live session, as with prior features): type `%` in a bot chat, confirm the picker appears and filters by title; select a task, send the message, confirm it renders as a clickable chip; click it, confirm the Task Board opens; confirm the agent's reply reflects awareness of the referenced task's status/description (a reasonable prompt like "what's the status of %slug-name?").

## Risks and rollback

- **Collision-prone slugs**: many similarly-titled tasks could produce long `-N` suffixes. Acceptable — same tradeoff projects already accept implicitly, just auto-resolved instead of rejected.
- **Legacy task backfill on load**: purely additive (new field, generated once, persisted); a scoped revert leaves `mention` present but unused, no data loss.
- **False-positive matches**: `%` appears in real text (percentages, discounts). Mitigated the same way `#` is today — requiring a preceding non-identifier character, and matches only resolve against *known* task mentions (unknown `%something` stays plain text, not an error).
- **Merged chip rendering**: touches all four existing `#project` render call sites. Mitigation: `projectMentionMatches`/`taskMentionMatches` stay independent, well-tested functions; only the final segment-merging logic in the renderer is new, verified by the existing `projectMentions.test.ts` cases continuing to pass unchanged plus new combined-text test cases.

Rollback is a scoped Git revert; `TaskRecord.mention` is additive and the rest of the change is UI/prompt-assembly only.

## Approval

Status: approved by user on 2026-08-15
