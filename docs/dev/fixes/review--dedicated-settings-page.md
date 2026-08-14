---
status: review
created: 2026-08-14
updated: 2026-08-14
scope: Dedicated settings page
owner: antigravity
related: []
---

# Dedicated Settings Page

Migrate the application-level settings from an overlay side panel (`AppSettingsPanel`) into a first-class, dedicated full-screen page (`SettingsScreen`), with categorized navigation (Profile, Connections & API Keys, Models & Providers, System & Updates), active sidebar state, and responsive layout.

---

## 1. Plan and Core Component

- [?] **Technical Plan** — `docs/dev/plans/implementation--dedicated-settings-page.md`. Define full design, sections, state interactions, and verification steps.
- [?] **Create dedicated `SettingsScreen` component** — `src/components/SettingsScreen.tsx:1`. Build a full-screen settings interface with tabbed navigation (Profile, Connections, Models & Providers, System & Updates), rich cards, status badges, diagnostics, and keyboard shortcuts.
- [?] **Update ApiKeys component** — `src/components/ApiKeys.tsx:1`. Add xAI support to the config sections dictionary.

## 2. Navigation and Shell Integration

- [?] **Render SettingsScreen as main view** — `src/App.tsx:58`. Render `SettingsScreen` when `state.appSettingsOpen` is true in the main view slot alongside `ProjectsScreen` and `TaskBoardScreen`.
- [?] **Update store reducer for view switching** — `src/state/store.tsx:332`. Ensure selecting a bot, group, or adding a bot cleanly resets `appSettingsOpen: false`.
- [?] **Update Sidebar active styling** — `src/components/Sidebar.tsx:770`. Add active indicator styling to the sidebar profile and settings button when on the settings page.

## 3. Verification

- [?] **Automated verification** — Run `pnpm typecheck` and `pnpm test`.
- [?] **Visual and functional verification** — Verify profile saving, API key saving/clearing, provider detection, update checking, and navigation between chat, projects, task board, and settings.
