---
status: review
created: 2026-08-13
updated: 2026-08-13
scope: projects screen
owner: codex
related: []
---

# Add project workspace management

Add a first-class Projects screen where users can register an existing folder, create a new project folder, or clone a GitHub repository into a chosen location. This task covers project discovery and management only; assigning bots to projects or changing agent working directories is out of scope.

---

## 1. Navigation and interface

- [?] **Add a Projects destination to the application shell and sidebar** — `src/App.tsx:1`, `src/components/Sidebar.tsx:1`, `src/state/store.tsx:140`. Preserve existing chat navigation and close conflicting panels when Projects is selected.
- [?] **Build the Projects screen using the existing visual system** — `src/components/ProjectsScreen.tsx:1`. Reuse the app palette, typography, cards, buttons, overlays, empty states, and interaction patterns.

## 2. Project operations

- [?] **Expose a narrow Electron project-management bridge** — `electron/main.mjs:1`, `electron/preload.cjs:1`, `src/types/gbs.d.ts:1`. Support listing projects, choosing folders, creating directories, and cloning without exposing unrestricted Node access to the renderer.
- [?] **Persist and validate registered projects safely** — `electron/projects.mjs:1`. Deduplicate canonical paths, reject invalid input, preserve existing folders, and store project metadata under Electron's user-data directory.
- [?] **Implement existing-folder, new-folder, and GitHub-clone flows** — `src/components/ProjectsScreen.tsx:1`. Provide progress, cancellation-safe dialogs, actionable errors, and immediate project-list refreshes.

## 3. Verification

- [?] **Add focused automated coverage and verify the desktop build** — `electron/projects.test.mjs:1`, `src/components/ProjectsScreen.tsx:1`. Cover validation and persistence boundaries, then run type-checks, tests, and the production build.
