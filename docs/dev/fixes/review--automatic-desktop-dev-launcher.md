---
status: review
created: 2026-08-14
updated: 2026-08-14
scope: automatic desktop development launcher
owner: antigravity
related: []
---

# Automatic desktop development launcher

Orchestrate the Vite dev server, the harness backend server, and the Electron desktop shell from a single `pnpm dev:desktop` command, automatically launching background services if they are not already running, waiting for the UI to be ready before opening the window, and cleaning up spawned child processes when Electron exits.

---

## 1. Desktop dev runner and Electron startup resilience

- [?] **Add cross-platform desktop development launcher script** — `scripts/dev-desktop.mjs:1`. Detect existing Vite and harness server instances, spawn any missing services, wait for readiness, run Electron, and clean up spawned processes on shutdown.
- [?] **Update desktop dev script in package.json** — `package.json:14`. Point `dev:desktop` to `node scripts/dev-desktop.mjs`.
- [?] **Add dev URL retry/polling in Electron main process** — `electron/main.mjs:110`. Retry loading `DEV_URL` gracefully while the Vite dev server initializes.
