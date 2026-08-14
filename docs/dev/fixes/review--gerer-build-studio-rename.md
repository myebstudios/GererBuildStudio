---
status: review
created: 2026-08-13
updated: 2026-08-14
scope: Gerer Build Studio product rename
owner: codex
related: []
---

# Complete the Gerer Build Studio product rename

Replace the former product name and its abbreviations throughout the repository with a single Gerer Build Studio identity. Cover user-facing copy, runtime identifiers, persistence paths, build metadata, tests, documentation, and project tooling without renaming the mouse-themed visual component vocabulary.

---

## 1. Canonical identity and packaging

- [?] **Rename product and package metadata** — `package.json:1`, `electron-builder.yml:1`, `index.html:1`, `public/app-icon.svg:1`. Use `Gerer Build Studio` for display and `gerer-build-studio` for machine identifiers and artifacts.
- [?] **Rename repository and release references** — `README.md:1`, `CONTRIBUTING.md:1`, `electron-builder.yml:1`. Point documented GitHub paths and updater metadata at the Gerer Build Studio names.

## 2. Runtime namespaces and persistence

- [?] **Replace internal abbreviations and public bridge names** — `electron/preload.cjs:1`, `src/types/gbs.d.ts:1`, `src/components/Composer.tsx:1`. Rename `window.ogb`, the declaration file, environment prefixes, local-storage keys, temporary paths, sockets, and MCP server identifiers to `gbs`/`GBS` equivalents.
- [?] **Move application data and logs to the new identity** — `server/config.ts:1`, `electron/main.mjs:1`, `server/projects.ts:1`. Use Gerer Build Studio directories consistently and define an explicit, tested migration policy.
- [?] **Rename agent-facing and system-facing identity** — `server/index.ts:1`, `server/permission-proxy.ts:1`, `server/drivers/:1`. Replace prompt text, health identifiers, process labels, computer setup names, and error messages.

## 3. User interface and documentation

- [?] **Replace all visible legacy branding** — `src/components/Onboarding.tsx:1`, `src/components/ProjectsScreen.tsx:1`, `src/components/UpdateBanner.tsx:1`. Ensure onboarding, updater, projects, errors, and titles use Gerer Build Studio.
- [?] **Update repository guidance and history documents** — `AGENTS.md:1`, `CLAUDE.md:1`, `README.md:1`, `CONTRIBUTING.md:1`, `SECURITY.md:1`, `docs/:1`. Remove stale examples and paths while keeping board history structurally intact.
- [?] **Rename the Trello project identity** — `.env.example:1`, `docs/dev/fixes/TRELLO.md:1`. Update the configured board name and the existing remote board to `Gerer Build Studio Tasks`.

## 4. Verification

- [?] **Prove the old identity is absent and behavior remains intact** — repository-wide search, TypeScript checks, full tests, production build, Electron syntax checks, and desktop-sized visual smoke tests.
