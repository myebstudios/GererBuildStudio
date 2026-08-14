# Implementation plan: projects screen

## Objective

Add a full-width Projects destination to Gerer Build Studio where a user can:

1. register an existing local project folder;
2. create and register a new project folder under a chosen parent directory; or
3. clone a GitHub repository into an explicitly chosen destination path and register it.

The screen will match the current dark, compact interface and reuse existing layout, card, button, form, overlay, loading, and error patterns. Connecting a project to a bot, changing an agent's working directory, project deletion, repository management, and GitHub authentication management are explicitly out of scope for this first feature.

## Current state

- `src/App.tsx:15-76` chooses only between a room, bot chat, and the connecting/empty state. There is no first-class non-chat main view.
- `src/components/Sidebar.tsx:470-605` contains chat search and the bot/room list, with Plugins and profile/settings actions in the footer. Its existing selected-row, hover, icon, and typography patterns should be reused for Projects.
- `src/state/store.tsx:143-213` tracks the selected chat and open panels. The reducer already centralizes mutually exclusive panel behavior at `src/state/store.tsx:415-444`, making it the appropriate place to add the Projects-view flag and ensure panels close predictably.
- `electron/main.mjs:109-143` creates a context-isolated renderer and `electron/preload.cjs:1-49` exposes a deliberately narrow IPC bridge. Filesystem and Git operations must stay behind this boundary rather than exposing Node to React.
- `src/types/gbs.d.ts:4-33` describes the renderer bridge and must remain aligned with preload methods and returned project records.
- The current Vitest configuration only includes `server/**/*.test.ts`; focused tests for a standalone Electron project service will require adding an Electron test pattern without changing the existing serial server-test behavior.

## Proposed changes

1. **Introduce a Projects main-view state and navigation entry.**
   - Add `projectsOpen` plus a `toggleProjects` action in `src/state/store.tsx`.
   - Selecting a bot or room will close Projects. Opening Projects will close bot settings, computer settings, app settings, and the Plugins overlay.
   - Add a selected-state Projects row to the sidebar footer using the existing icon sizing, rounded row, typography, and `bg-raised` treatment.
   - Update `src/App.tsx` to render `ProjectsScreen` before the chat selection branches when Projects is active.

2. **Build a native-looking Projects screen.**
   - Create `src/components/ProjectsScreen.tsx` as the full main content area with a draggable titlebar-safe header, search/filter field, responsive project cards/list rows, an informative empty state, and a primary `Add project` action.
   - Reuse current Tailwind tokens (`bg-app`, `bg-panel`, `bg-card`, `bg-raised`, `border-hairline`, `text-ink`, `text-ink-secondary`, `text-accent`, `text-danger`) and the app's established modal/card geometry.
   - The Add Project overlay will present three clear methods: existing folder, new folder, and clone from GitHub. Each method will use existing input/button styles, maintain a single busy state, close on Escape/backdrop when safe, and surface inline actionable errors.
   - When the Electron bridge is unavailable in a normal browser tab, the screen will remain navigable but explain that local project management requires the desktop app instead of pretending operations succeeded.

3. **Add a narrow Electron projects bridge.**
   - Create `electron/projects.mjs` containing the filesystem/persistence/Git implementation, with its dependencies injected or parameterized enough for isolated tests.
   - Register handlers from `electron/main.mjs` for listing projects, choosing a directory, adding an existing directory, creating a new directory, cloning a repository, and opening a project folder.
   - Extend `electron/preload.cjs` with a `projects` namespace that invokes only those handlers; extend `src/types/gbs.d.ts` with exact request/result types.
   - Use Electron's directory picker for existing folders and parent/destination selection. Cancelled pickers will resolve as cancellation, not errors.

4. **Persist and validate project records.**
   - Store records in `projects.json` beneath `app.getPath("userData")`, not in the repository or harness data directory.
   - Records will contain an ID, display name, canonical absolute path, source (`existing`, `created`, or `github`), optional repository URL, and added timestamp.
   - Resolve canonical paths before deduplication. Existing-folder registration requires a real directory. New-folder creation requires a safe single folder name and an existing parent. Project listing will preserve a record whose folder later disappears but mark it missing so the UI can explain the problem.
   - Write persistence atomically through a sibling temporary file and rename. Malformed persistence will fail with a clear error rather than overwriting unknown data.

5. **Clone GitHub repositories without a shell.**
   - Accept standard GitHub HTTPS and SSH repository URLs, derive a sensible default folder name, and let the user edit the complete destination path.
   - Validate that the destination parent exists and the destination does not already contain data.
   - Spawn `git` directly with an argv array and `shell: false`; never concatenate a command string. Capture bounded stderr for an actionable failure message.
   - Register the project only after Git exits successfully. If Git leaves a partial destination on failure, retain it and report its path rather than deleting user data automatically.

6. **Add verification and documentation.**
   - Add `electron/projects.test.mjs` covering project-file parsing, atomic persistence, canonical-path deduplication, safe folder-name validation, missing-folder reporting, GitHub URL parsing, and clone failure behavior with a fake process runner.
   - Extend `vite.config.ts` to include the focused Electron test without disturbing the existing server suite.
   - Update the README feature description and source map to mention Projects and local desktop requirements.

## Verification

Automated checks:

1. `npm exec -- tsc -b && npm exec -- tsc -p tsconfig.server.json` if `pnpm` remains unavailable, otherwise `pnpm typecheck`.
2. `npm exec -- vitest run` if `pnpm` remains unavailable, otherwise `pnpm test`.
3. `npm exec -- vite build` plus the server TypeScript build path represented by the project's normal `build` script.
4. Focused Electron project-service tests for persistence, validation, path deduplication, missing folders, and Git invocation.

Manual scenarios in the Electron app:

1. Open Projects from the sidebar and return to a bot/room without stale settings panels.
2. Cancel each folder picker and confirm no project is added and no error is shown.
3. Add an existing folder, restart the app, and confirm it persists without duplicates.
4. Create a folder under a selected parent and confirm it appears on disk and in the project list.
5. Clone a public GitHub repository into a custom destination, confirm the busy state, and verify the completed record.
6. Try invalid URLs, unsafe folder names, duplicate paths, occupied clone destinations, a missing `git` executable, and a failed clone; confirm errors are specific and no existing data is removed.
7. Remove or rename a registered folder outside the app and confirm it renders as missing after refresh/restart.
8. Check the layout at the app minimum size (900×600) and the default desktop size (1440×920), including keyboard focus, Escape behavior, overflow, and long paths.
9. Open the web-only Vite UI and confirm Projects presents a desktop-required state without runtime errors.

## Risks and rollback

- **Filesystem safety:** Creating and cloning write outside the app data directory. Mitigation: require explicit user-selected paths, validate parents/destinations, avoid implicit deletion, and never overwrite an existing non-empty location.
- **Command injection and credentials:** Repository URLs and paths are untrusted. Mitigation: spawn Git without a shell, pass all values as argv entries, accept only GitHub URL forms, and never persist credentials embedded in URLs.
- **Persistence corruption:** A crash during save could lose the project list. Mitigation: atomic temporary-file replacement and strict parsing that does not overwrite malformed state.
- **Cross-platform path differences:** macOS, Windows, and Linux normalize paths differently. Mitigation: use Node path/fs APIs, canonical filesystem paths, platform-neutral argv spawning, and no POSIX-only commands.
- **Renderer drift:** Preload and TypeScript declarations can diverge. Mitigation: keep one small `projects` namespace with matching method names and exercise it through type-check/build verification.

Rollback is a single scoped Git revert. The persisted `projects.json` contains only metadata and can safely remain unused by older builds; created and cloned project folders are user data and will never be removed by rollback.

## Approval

Status: approved by user on 2026-08-13
