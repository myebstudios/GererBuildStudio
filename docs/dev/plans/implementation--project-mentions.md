# Implementation plan: project mentions

## Objective

Make registered projects referable through stable hashtags such as `#gerer-build-studio` across the places where users give agents context:

- direct-chat and room composers;
- room bulletins (the room description/instructions);
- bot descriptions;
- persisted user-message display; and
- the Projects screen itself.

A mention will be more than styled text. The harness will resolve it against trusted registered project metadata, tell the agent the canonical folder path, and use that project as the turn working directory when exactly one available project unambiguously applies. The visible message remains exactly what the user typed.

Arbitrary hashtags, arbitrary client-supplied paths, Git operations, project deletion, per-project permissions, and attaching a project permanently to a room or bot through a separate selector are out of scope.

## Current state

- `electron/projects.mjs` stores project records in `projects.json` beneath Electron's user-data directory. Records have IDs and canonical paths but no human-typable stable identifier; duplicate folder basenames are currently allowed.
- `src/components/ProjectsScreen.tsx` owns its own project list state, so other renderer surfaces cannot reuse the registered project catalog.
- `src/components/Composer.tsx:10-104` already has a polished keyboard-accessible `@bot` picker. It is the correct interaction model for `#project`, but its parsing and candidate logic are currently bot-specific.
- `src/components/GroupView.tsx:129-213` edits the room bulletin in a plain textarea, and `src/components/SettingsPanel.tsx:125-153` does the same for a bot description.
- User bubbles render plain text in `src/components/ChatView.tsx:235-315` and `src/components/GroupView.tsx:50-90`, which preserves hashtags but offers no indication that a project was resolved.
- `server/index.ts:310-443` constructs direct-agent turns, including the persona and an optional `cwd`; `server/index.ts:480-571` builds room member turns from the member persona, room bulletin, and transcript. These are the authoritative points for resolving project context.
- `server/index.ts:283-309` already locates Electron user-data files across macOS, Windows, and Linux for local computer use. Project metadata can use the same platform-aware discovery without accepting paths from the renderer.

## Mention contract

1. Every project receives a persisted, lowercase mention slug containing letters, numbers, dots, underscores, or hyphens, for example `Gerer Build Studio` → `gerer-build-studio`.
2. Slugs are unique. Collisions receive deterministic numeric suffixes (`project`, `project-2`, `project-3`) and remain stable even if another project is later removed.
3. Existing records without a slug are migrated atomically on the next project-service read and written back without changing their IDs, names, paths, source, or timestamps.
4. A mention token is `#` followed by the exact slug. It must begin at the start of text or after whitespace/punctuation and end at the slug boundary. Matching is case-insensitive; unknown hashtags remain ordinary text.
5. The renderer inserts canonical lowercase slugs, while the harness independently re-resolves them from disk. The client never supplies a trusted filesystem path.

## Proposed changes

1. **Add stable project mention identity.**
   - Extend Electron project records and TypeScript declarations with `mention`.
   - Add deterministic slug generation and collision handling to `electron/projects.mjs`.
   - Migrate valid legacy records atomically when loaded. Keep malformed-file behavior unchanged: report the error and do not overwrite it.
   - Show and search `#mention` on every Projects card.

2. **Centralize renderer project state.**
   - Add `src/state/projects.tsx` with `ProjectsProvider`/`useProjects`, wrapping the application inside `StoreProvider`.
   - Load the desktop catalog once, expose loading/error/refresh state, and provide add-existing/create/clone/open operations that update shared state.
   - Refactor `ProjectsScreen` to consume this context while preserving its current empty, missing-folder, error, and browser-fallback behavior.

3. **Create reusable mention parsing and rendering.**
   - Add `src/lib/projectMentions.ts` for caret-query detection, exact token matching, and insertion helpers.
   - Add a compact reusable project suggestion list consistent with the existing `@bot` picker: folder icon, project name, `#slug`, path hint, mouse selection, ArrowUp/ArrowDown, Enter/Tab, and Escape.
   - Add `ProjectMentionText` to split plain text safely and render only known project tokens as inline buttons/chips. Clicking a valid mention opens that registered folder through the existing Electron bridge; missing mentions remain styled but disabled, and unknown hashtags remain text.

4. **Enable mentions where users provide agent context.**
   - Extend `Composer` so `@` and `#` share one mutually exclusive picker and the same keyboard behavior. Queued messages retain their plain canonical mention tokens.
   - Add a mention-aware textarea wrapper to the room bulletin and bot description fields without changing their save-on-blur/debounce behavior.
   - Render mentions in direct user bubbles, room user bubbles, and the collapsed room bulletin preview while preserving whitespace, message editing, copy behavior, reactions, and long-message collapsing.
   - Update relevant placeholders/help text to teach `#` without adding a separate onboarding step.

5. **Resolve trusted project context in the harness.**
   - Add `server/projects.ts` to locate and validate the Electron `projects.json` file. Support an explicit `GBS_PROJECTS_FILE` only for isolated tests; otherwise use the platform-aware Gerer Build Studio user-data candidates already used by the harness.
   - Resolve mention slugs independently for every turn and verify whether each canonical path is still an existing directory.
   - Add a concise system section listing referenced projects and paths. Missing project folders are explicitly marked unavailable; unknown hashtags are ignored.
   - Never include project paths in the persisted visible message and never accept a path from the message API body.

6. **Apply deterministic context precedence.**
   - Direct chats: references in the latest user message take precedence for `cwd`; if there are none, references in the bot description act as the bot's default project context.
   - Rooms: references in the latest user message take precedence, then the room bulletin, then the responding bot's description.
   - All known references from the applicable message/instructions are described to the agent, but `cwd` is set only when the highest-priority source resolves to exactly one available project. Multiple or missing references leave `cwd` unchanged and rely on explicit paths in the system context.
   - Existing `@bot` routing remains independent: a message may combine `@Scout` and `#gerer-build-studio`.

7. **Add verification and documentation.**
   - Extend Electron service tests for slug creation, collisions, and legacy migration.
   - Add `server/projects.test.ts` for path discovery, strict parsing, token boundaries, case handling, missing directories, deduplication, and precedence helpers.
   - Add focused server turn tests proving that trusted references affect `system`/`cwd` while unknown hashtags and client text cannot inject paths.
   - Update README guidance with `#project` and `@bot` examples.

## Verification

Automated checks:

1. Full TypeScript checks for renderer and server.
2. Full Vitest suite, including the Electron migration tests and server resolver/turn tests.
3. Production Vite/server build.
4. Syntax checks for changed Electron `.mjs`/`.cjs` files.

Manual scenarios:

1. Create two projects with the same basename and confirm unique, stable mention slugs survive restart.
2. Type `#` in a direct chat, filter candidates, navigate by keyboard, insert a mention, combine it with `@Bot`, and send.
3. Repeat in a room message, room bulletin, and bot description; confirm blur, Escape, Enter, and Cmd/Ctrl+Enter behavior remain intact.
4. Confirm known project tokens render as chips, open the correct folder, wrap on narrow bubbles, and remain ordinary editable/copyable text underneath.
5. Confirm unknown hashtags such as `#general` remain plain text and do not add agent context.
6. Confirm one referenced project sets the agent working directory; multiple projects provide paths without choosing one; missing folders are reported as unavailable.
7. Confirm room precedence: latest message → bulletin → bot description.
8. Check direct and room layouts at 900×600 and 1440×920, including long paths and the combined `@`/`#` picker.
9. Confirm the normal browser build shows no project candidates and does not crash.

## Risks and rollback

- **Hashtag false positives:** Natural hashtags could be mistaken for projects. Mitigation: exact matching against registered stable slugs and strict token boundaries; unknown tags remain untouched.
- **Duplicate project names:** Basename matching is ambiguous. Mitigation: unique persisted slugs with deterministic suffixes.
- **Path injection:** A message could try to smuggle a filesystem path. Mitigation: the harness trusts only its locally read project registry and ignores client-provided paths.
- **Unexpected working directories:** Multiple references could choose the wrong project. Mitigation: explicit precedence and `cwd` only for exactly one available project at the highest-priority source.
- **Legacy data migration:** Rewriting records could corrupt a user's list. Mitigation: validate first, preserve all existing fields, write atomically, and cover migration with a byte-level fixture test.
- **Picker interaction regressions:** Adding `#` could break `@` or Enter-to-send. Mitigation: one active trigger at the caret, shared keyboard handling, and manual combined-flow verification.

Rollback is a scoped Git revert. Older builds ignore the additive `mention` field. Visible messages and descriptions remain ordinary strings, so they continue to work without mention-aware rendering or resolution.

## Approval

Status: approved by user on 2026-08-13
