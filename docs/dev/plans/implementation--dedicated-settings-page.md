# Implementation plan: Dedicated Settings Page

## Objective

Migrate the application-level settings (`AppSettingsPanel`), which currently opens as a slide-over panel on the right side of the screen, into a dedicated full-screen page (`SettingsScreen`). The new page will serve as a first-class screen (alongside `ProjectsScreen` and `TaskBoardScreen`) with structured navigation tabs, modern design cards, system diagnostics, and seamless integration with the sidebar.

Bot-specific settings (`SettingsPanel` for bot name, persona, bot-selected model, avatar customization) and context-specific computer controls (`ComputerPanel`) remain contextual side panels for the active bot.

## Current state

1. **Overlay Panel**: `src/components/AppSettingsPanel.tsx` is an `<aside className="w-[400px]">` rendered conditionally at the root of `src/App.tsx` over the active view.
2. **Main Views**: `src/App.tsx` handles view switching between `<TaskBoardScreen />`, `<ProjectsScreen />`, `<GroupView />`, and `<ChatView />`.
3. **Sidebar**: `src/components/Sidebar.tsx` has footer buttons for Task Board, Projects, Plugins, and User Profile / Settings (`dispatch({ type: "toggleAppSettings" })`). Unlike Task Board and Projects, the settings footer buttons do not indicate active state when opened.
4. **State Transitions**: `src/state/store.tsx` handles `toggleAppSettings` by closing other screens, but `select` (clicking a bot or room) or `botAdded` does not explicitly reset `appSettingsOpen`.
5. **Config Keys**: `src/components/ApiKeys.tsx` manages Composio and Box keys via `PUT /api/config`. The server also supports `xai`, but `ApiKeys.tsx` currently only declares types for `composio`, `composioApi`, and `box`.

## Proposed changes

### 1. Dedicated `SettingsScreen` Component (`src/components/SettingsScreen.tsx`)
Create a modern full-screen component with:
- **Header**: Back button, settings icon, title "Settings", subtitle, and window drag region for Electron.
- **Navigation Tabs**:
  1. **Profile & Account**: Name, email, avatar preview, with autosave to `/api/config`.
  2. **Connections & API Keys**: Composio Connect Key (`ck_...`), Composio API Key (`ak_...`), Box Token (`box.ascii.dev`), and xAI API Key with status indicators (Connected / Not configured), inline help, and clear/save actions.
  3. **Models & Providers**: Live status of local agent CLIs and drivers (`state.instances`), showing which providers are available (Claude, Codex, Grok, Antigravity, Box Cloud) and setup instructions for unauthenticated CLIs.
  4. **App Updates & System Diagnostics**: Electron app updater with status/actions (Check for updates, Download, Restart & install), app version info, local harness connection status (`127.0.0.1:8899`), data directory (`~/.gbs`), and keyboard shortcuts reference.

### 2. Update `ApiKeys.tsx` (`src/components/ApiKeys.tsx`)
Add `xai` section support to `SECTIONS`:
```ts
export type ConfigSection = "composio" | "composioApi" | "box" | "xai";
```
mapping to `{ xai: { key: v } }` and checking `c.xai?.configured`.

### 3. Shell Layout & Store Integration
- **`src/App.tsx`**: Render `<SettingsScreen />` in the main view slot when `state.appSettingsOpen` is true. Remove the side panel overlay for app settings.
- **`src/state/store.tsx`**: Ensure `select` and `botAdded` actions reset `appSettingsOpen: false` so clicking a bot or creating a new bot returns to chat view smoothly.
- **`src/components/Sidebar.tsx`**: Style the footer profile button with `state.appSettingsOpen ? "bg-raised" : "hover:bg-raised/50"` and the gear icon with active accent when settings are open.
- **`src/components/PluginsPanel.tsx`**: Update any links opening settings to work seamlessly with the new screen.

## Verification

1. **Automated Verification**:
   - `pnpm typecheck`
   - `pnpm test`
2. **Manual & Interactive Scenarios**:
   - Click the profile / settings gear in the sidebar: verify full-page `SettingsScreen` opens and sidebar highlights it as active.
   - Switch between all 4 tabs (Profile, Connections, Models & Providers, System & Updates).
   - Edit profile name/email and verify persistence on blur.
   - Test saving and clearing an API key.
   - Click a bot or room in the sidebar: verify smooth transition back to the chat view.
   - Use the Back button on SettingsScreen to return to the active chat/room.

## Risks and rollback

- **Low risk**: This change replaces the side-drawer presentation of app-level settings with a full main-view screen.
- **Rollback**: Restore `src/App.tsx` and `src/components/AppSettingsPanel.tsx` from git.

## Approval

Status: implemented (ready for review)
