# Implementation plan: per-instance agent permission toggle

## Objective

Let the user control, from the app's Settings screen, whether each configured agent instance (Claude, Codex, Antigravity, Grok/ACP, …) auto-approves its own actions or asks for permission before editing files / running commands. Surfaced as one unified switch — **"Ask before actions"** vs **"Full auto"** — per instance, regardless of how each driver's CLI models permissions internally.

Out of scope: per-task or per-project overrides (instance-level only, per earlier decision), fine-grained per-tool-type permission rules, and the OS-level mic/screen permissions already handled in `Onboarding.tsx`.

## Current state

- Permission control already exists at the driver/config layer but has no write path:
  - `server/drivers/claude.ts:35-38,179-189` — `ClaudeConfig.permissionMode: "acceptEdits" | "auto" | "bypassPermissions"`, decoded with `"acceptEdits"` default. Applied at `server/drivers/claude.ts:241` as `--permission-mode`. When not `bypassPermissions`, a permission broker (`server/drivers/claude.ts:63-177`, MCP tool `mcp__gbs__approve`) intercepts asks and forwards them to the UI over `request.opened`/`request.resolved` runtime events; `bypassPermissions` skips the broker entirely (`server/drivers/claude.ts:288-290`).
  - `server/drivers/codex.ts:41-50,168,376-377` — `CodexConfig.fullAuto: boolean` (default `false`), toggles `sandbox`/`approvalPolicy` between `workspace-write`/`on-request` and `danger-full-access`/`never`.
  - `server/drivers/antigravity.ts:37,60-70,173-177` — `fullAuto: boolean`, defaults to `true` (documented reason: its headless harness needs it to produce output at all), maps to `--dangerously-skip-permissions` vs `--mode accept-edits`.
  - `server/drivers/acp/core.ts:35,76,232` — shared ACP driver (used by Grok and others), same `fullAuto: boolean` shape.
- `config` is decoded **once**, at `driver.create()` time, and closed over by `sendTurn` (e.g. `server/drivers/claude.ts:208-241`). Changing the stored config does not affect a live instance until it is recreated.
- `server/index.ts:929-937` already has exactly this recreate pattern — `reloadProviders()` calls `bus.detachAll()`, `registry.disposeAll()`, `registry.load(instanceConfigs(cfg))`, `bus.attach(...)` — used today by the `/api/config` PATCH handler (`server/index.ts:1476-1489`) whenever a provider-affecting key changes. It kills any in-flight turns; this is accepted/documented behavior for existing config edits.
- `server/config.ts:56-71` `saveConfig()` only merges `xai`, `composio`, `box`, `trello`, `profile` — **it silently drops an `instances` patch today**. This must be extended.
- `server/harness/registry.ts:89-115` `describe()` (the payload behind `GET /api/instances`) returns `instanceId`, `driverKind`, `displayName`, `snapshot`, `models` — no config/permission data, and `RegistryEntry` doesn't retain the decoded config after `create()`.
- `src/state/store.tsx:146-157` mirrors that same shape as `InstanceInfo`; instances are loaded via `api("/api/instances")` (`store.tsx:961-962`, refreshed at `1083-1084`).
- `src/components/SettingsScreen.tsx:309-400` `ModelsSection` renders one card per instance (name, driver kind, availability, models) — this is the natural place to add a control, but it is currently a purely read-only display fed by `state.instances`.

## Proposed changes

1. **Extend the driver contract with an optional, symmetric permission accessor.**
   - In `server/contracts.ts`, add to `ProviderDriver<C>`:
     ```ts
     getAutoApprove?(config: C): boolean;
     setAutoApprove?(config: C, autoApprove: boolean): C;
     ```
   - Implement both in `claude.ts` (`false` → `"acceptEdits"`, `true` → `"bypassPermissions"`; `getAutoApprove` treats the legacy `"auto"` alias same as `"acceptEdits"` → `false`), `codex.ts`, `antigravity.ts`, and `acp/core.ts` (all three: direct passthrough on `fullAuto`).
   - Drivers without a permission concept simply omit these — the UI treats `getAutoApprove === undefined` as "not configurable" and hides the control for that instance.

2. **Retain decoded config on the registry entry and expose it in `describe()`.**
   - `server/harness/registry.ts`: store the decoded `config` (and the source driver) on `RegistryEntry` when a live instance is created, so it can be read back without re-decoding.
   - `describe()` adds `autoApprove: boolean | null` per instance: `driver.getAutoApprove?.(entry.config) ?? null`. Shadow (unavailable/misconfigured) instances report `null`.
   - `src/state/store.tsx` `InstanceInfo` gains `autoApprove: boolean | null`.

3. **Add a write path: `PATCH /api/instances/:instanceId`.**
   - `server/config.ts` `saveConfig()`: add an `instances` branch that deep-merges by `instanceId`, patching only the given key(s) (here: `config`) and preserving `driver`/`displayName`/`environment`/`enabled` already on disk.
   - `server/index.ts`: new route reads `{ autoApprove: boolean }` from the body, looks up the instance's current driver + decoded config (via the registry entry added in step 2, falling back to `driver.defaultConfig()` for a shadow instance), calls `driver.setAutoApprove(config, autoApprove)`, persists it through `saveConfig({ instances: { [instanceId]: { config: nextConfig } } })`, updates in-memory `cfg`, and calls the existing `reloadProviders()`.
   - Return the refreshed `describe()` payload and `broadcast()` an `instances` event, mirroring the existing `/api/config` PATCH handler's shape (`server/index.ts:1476-1489`).
   - Reject with 400 if the target driver has no `setAutoApprove` (not configurable) or the instance doesn't exist.

4. **Settings UI: add the toggle to `ModelsSection`.**
   - In `src/components/SettingsScreen.tsx`, add a switch (existing toggle primitive if one exists in the design system; otherwise a small inline control matching current card styling) next to each instance card, visible only when `inst.autoApprove !== null`.
   - Label the two states plainly: "Ask before actions" (off) / "Full auto" (on) — per the unified-toggle decision, no driver-specific vocabulary in the UI.
   - On change, optimistically flip local state, `PATCH /api/instances/${instanceId}` with `{ autoApprove }`, and reconcile from the response; on failure, revert and surface the existing error-toast path (`showError`, used elsewhere in `store.tsx`, e.g. line 942).
   - While a reload is in flight, disable the toggle for that instance to prevent a double-submit racing `reloadProviders()`.

5. **Documentation/config note.**
   - Note in `server/config.ts`'s header comment that `instances.<id>.config` is now also written by the app itself, not just hand-edited.

## Verification

- Server unit tests (new, alongside existing driver tests) for each driver's `getAutoApprove`/`setAutoApprove` round-trip, including the Claude `"auto"` alias case.
- `server/config.ts` test: `saveConfig({ instances: {...} })` merges without clobbering sibling instance fields or other top-level config keys.
- Integration test (using the existing fakes in `server/testing/`, e.g. `fake-claude-cli.ts`) for `PATCH /api/instances/:id`: happy path persists + reloads + next turn launches the CLI with the expected flag; 400 on unknown instance; 400 on a driver without permission support.
- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Manual: `pnpm dev` + `pnpm dev:server`, toggle a Claude instance in Settings → Models, start a turn that touches the filesystem, confirm no permission prompt appears in "Full auto" and one appears (and is answerable) in "Ask before actions"; confirm the toggle survives a page reload (persisted) and an in-flight turn is not silently left in a broken half-reloaded state.

## Risks and rollback

- **In-flight turns killed on toggle.** `reloadProviders()` tears down every instance, not just the one edited. Mitigation: this is pre-existing, accepted behavior for the same reason on `/api/config` PATCH today; document it in the toggle's UI copy/tooltip if turns are active. A future refinement could scope reload to a single instance, but that's out of scope here.
- **Silent no-op today.** `saveConfig` currently drops unrecognized keys instead of erroring, so an `instances` patch before this change would appear to succeed but do nothing — confirmed by reading the code, not yet by a failing test; add the regression test in Verification.
- **Driver drift.** New drivers that don't implement `getAutoApprove`/`setAutoApprove` degrade safely — the UI hides the control and the API 400s rather than guessing.
- **Config compatibility.** Written config values are the same shape `decodeConfig` already accepts, so older/newer builds round-trip per the registry's existing shadow-snapshot fallback (`server/harness/registry.ts` header comment).

Rollback is a scoped Git revert; the only persisted-state change is the `config` sub-object of existing `instances` entries, which remains valid input to the unmodified `decodeConfig` functions even if the toggle code is reverted.

## Approval

Status: approved by user on 2026-08-15
