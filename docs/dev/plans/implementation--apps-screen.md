# Implementation plan: Rename plugins to apps and dedicated App Store screen

## Objective

Rename "Plugins" to "Apps" across the UI, state, and navigation, and replace the small modal dialog with a dedicated, full-screen App Store experience (`AppsScreen.tsx`) where users can browse, search, filter by category, spotlight featured integrations, and manage OAuth connections for their AI bots.

## Current state

- Plugins currently live in `src/components/PluginsPanel.tsx` as a floating modal popup overlay (`state.pluginsOpen`).
- Sidebar has a "Plugins" button with a `Puzzle` icon that toggles `pluginsOpen`.
- `App.tsx` conditionally overlays `<PluginsPanel />` over the active chat or view.
- Connections API endpoints:
  - `GET /api/connectors/catalog` (returns `cards`, `source`, `configured`)
  - `GET /api/connectors?services=slug1,slug2` (returns connection status for services)
  - `POST /api/connectors/:slug/authorize` (initiates OAuth and returns authorization URL)
  - `DELETE /api/connectors/:slug` (disconnects service)

## Proposed changes

1. **State & Navigation (`src/state/store.tsx`)**:
   - Rename state property `pluginsOpen` to `appsOpen` (keeping backward-compatible action types if needed).
   - Add action `toggleApps` and update other screen toggles (`toggleAppSettings`, `toggleProjects`, `toggleTaskBoard`, `toggleSettings`, `toggleComputer`, `select`, `botAdded`) to close `appsOpen`.

2. **Dedicated App Store Screen (`src/components/AppsScreen.tsx`)**:
   - Create a full-screen view following the established patterns of `SettingsScreen`, `ProjectsScreen`, and `TaskBoardScreen`.
   - **Header**:
     - Title: "Apps & Integrations" (or "Apps").
     - Subtitle explaining agent tool capabilities.
     - Search bar with live search filtering.
     - Refresh connection status button.
     - Back button and `Esc` shortcut to return to conversation.
   - **Spotlight / Featured Row**:
     - Showcase popular integrations (GitHub, Slack, Notion, Google Workspace, Discord, Linear) with hero styling when viewing all apps.
   - **Category Filters**:
     - "All Apps", "Connected", "Developer Tools", "Productivity & Docs", "Communication", "Marketing & CRM", "Data & Cloud".
   - **App Store Grid**:
     - Structured responsive card layout (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`).
     - App icon (Logo -> Domain Favicon -> Monogram), App Title, Category chip, Status badge (Connected vs Available), Description blurb.
     - Connect / Disconnect / Launch OAuth actions with loading spinners.
   - **Empty / Error / Configuration States**:
     - Composio setup banner with link to Settings.
     - Empty search results state.
     - Error banners with retry actions.

3. **Sidebar Integration (`src/components/Sidebar.tsx`)**:
   - Update the footer navigation item from "Plugins" to "Apps" with a clean `LayoutGrid` / `Boxes` icon.
   - Highlight when `state.appsOpen` is active.

4. **App Shell (`src/App.tsx`)**:
   - Render `<AppsScreen />` as a first-class screen alongside `SettingsScreen`, `TaskBoardScreen`, `ProjectsScreen`, and chat views.
   - Remove `<PluginsPanel />` modal overlay.

5. **Tests**:
   - Update tests in `src/lib/store.test.ts` for `toggleApps` and `appsOpen`.
   - Ensure all 21 test suites pass with zero regressions.

## Verification

- `pnpm typecheck` passes with no TypeScript errors.
- `pnpm test` passes all tests.
- UI verification:
  - Sidebar shows "Apps".
  - Clicking "Apps" opens the full App Store screen.
  - Category filters, search input, Connect/Disconnect buttons, and Refresh work seamlessly.
  - Pressing `Esc` or clicking back returns to the previous chat or view.
  - Opening another view (Settings, Projects, Task Board, or a Chat) closes the App Store screen.

## Risks and rollback

- Low risk: The underlying backend API (`/api/connectors/*`) remains unchanged and compatible.
- Rollback: Revert component and store changes via git.

## Approval

Status: awaiting user approval
