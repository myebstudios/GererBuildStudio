# Implementation plan: Convex-backed sync for user settings and agent roster

## Objective

Let a user's **profile/settings** and **agent roster** (the "fleet" of configured
instances/bots, minus their chat history) follow them across devices/installs of
Gerer Build Studio, using Convex as the sync backend.

In scope:
- Cross-device sync of `AppConfig` (`server/config.ts`) — profile, provider
  keys/tokens, and the `instances` map — via a new Convex account.
- Cross-device sync of the agent roster: the non-conversational fields of
  `BotRecord` (`server/store.ts:92`) — name, title, description, color,
  mascot expression, model selection, computer setting, pinned/hidden flags.
- A minimal login (Convex Auth, email + passcode) — the app's first account
  concept.
- Client-side encryption of provider secrets before they leave the device;
  Convex only ever stores ciphertext for those fields. Encryption keys off
  a separate sync passphrase, not the login credential (see §3 — an
  email+passcode login has no stable client secret to derive a key from).

Explicitly out of scope:
- Any chat/thread/message data (`messages-<threadId>.json`, `GroupRecord`
  bulletins, room activity) — stays 100% local, never touches Convex.
- `resumeCursors`, `busy`, `unread`, `rewound` — per-device/per-session
  runtime state on `BotRecord`, not portable, never synced.
- Real-time collaboration between multiple people — this is one user
  syncing their own data across their own devices, not multiplayer.
- Migrating local storage away from `~/.gbs`. Local JSON files remain the
  source of truth when offline; Convex is a sync layer on top, not a
  replacement.

## Current state

- No account/auth system exists anywhere in the app today. Everything is
  local-only, keyed off `~/.gbs` (`server/config.ts:34`, `DATA_DIR`).
- `AppConfig` (`server/config.ts:12-28`) is a single JSON file holding
  provider secrets (`xai`, `composio`, `box`, `trello`), `profile`
  (name/email, not secret), and `instances: InstanceConfigMap` (the
  configured driver fleet — `server/contracts.ts:25-34`).
  - Read via `loadConfig()`, written via `saveConfig()` (`server/config.ts:42-80`),
    which merges per-key and never echoes secrets back to the client
    (per `AGENTS.md`: "Preserve the write-only treatment of API keys").
  - HTTP surface: `GET/PUT/PATCH /api/config` (`server/index.ts:1514-1517`),
    `GET/PATCH /api/instances/:id` (`server/index.ts:1479-1510`), which
    broadcasts an `instances` event over the existing websocket/event bus
    after a change.
- Agents ("bots") are `BotRecord` (`server/store.ts:92-116`), persisted
  in `bots.json` via `Store` (`server/store.ts:169-182`). Each record mixes:
  - **Portable identity/config**: `name`, `title`, `description`,
    `notifications`, `color`, `mascotExpression`, `modelSelection`,
    `computer`, `pinned`, `hidden`.
  - **Local/session-only state**: `id`, `threadId` (points at a
    machine-local `messages-<threadId>.json`), `resumeCursors` (provider
    session continuation, not portable across machines), `busy`,
    `rewound`, `unread`, `createdAt`.
- `GroupRecord` (`server/store.ts:71-85`, rooms) references bots by their
  local `id` via `memberIds`. Rooms are out of scope (§ Objective, chats
  stay local) and are not reconstructed across devices — a room built from
  synced agents on device B will not exist on device B until created
  there independently. Worth surfacing in the UI copy (§5) so it doesn't
  read as a bug.
- Client settings UI: `src/components/SettingsScreen.tsx`,
  `src/components/SettingsPanel.tsx` — these currently talk directly to
  `/api/config` and `/api/instances`.
- No existing dependency on Convex, no `convex/` directory, no network
  backend of any kind — this introduces the app's first cloud dependency.

## Proposed changes

### 1. Convex project setup

1. Add `convex` as a dependency; run `npx convex dev` to scaffold
   `convex/` (schema + functions) and `convex/_generated/`.
2. Add `convex/schema.ts` with two tables:
   - `settings`: one row per user — `profile` (name/email),
     `providerSecrets` (ciphertext blob + nonce, see §3), `instances`
     (the non-secret parts of `InstanceConfigMap`: `driver`, `displayName`,
     `accentColor`, `enabled`; `updatedAt`. `environment` stays local-only
     since it's where resolved secrets get injected, per
     `server/config.ts:110-116`. `config: unknown` (`server/contracts.ts:31`)
     is driver-specific and its contents aren't guaranteed non-sensitive —
     treat it like a secret (folded into `providerSecrets`'s ciphertext,
     keyed by instanceId) rather than syncing it in the clear by default.
   - `agents`: one row per synced agent — `ownerId`, a stable
     `agentKey` (new, sync-scoped id, distinct from the local `BotRecord.id`
     which stays a local pointer), `name`, `title`, `description`,
     `notifications`, `color`, `mascotExpression`, `modelSelection`,
     `computer`, `pinned`, `hidden`, `updatedAt`, `deleted` (tombstone flag —
     needed so a delete on one device propagates instead of resurrecting on
     the next pull).
   Both tables scoped by `ownerId` (Convex Auth subject), with an index on
   `ownerId`. `BotRecord` gains a new optional local field, `syncKey`, so
   the harness can map a local bot to its Convex `agentKey` across restarts
   without inferring it from name matching.
3. Wire Convex Auth (email + passcode / magic-link provider) for
   sign-in/account identity only — it does not supply the encryption key
   (see §3). Add a minimal login screen gating only the new "Sync" entry
   point — the app must remain fully usable with zero setup for users who
   never opt in.

### 2. Harness-side sync module

New `server/convexSync.ts`:
- Holds a Convex client, created only after the user supplies credentials
  (stored locally, e.g. `~/.gbs/sync.json`, separate from `config.json` so
  sync opt-in doesn't touch the existing config file shape).
- `pushSettings(cfg: AppConfig)`, `pushAgents(bots: BotRecord[])`: map
  local shapes to Convex table shapes, stripping non-portable fields
  (§ Objective) and encrypting secrets (§3) before sending.
- `pullSettings()`, `pullAgents()`: inverse mapping, merged into local
  state (§4 conflict handling).
- A `startSync()` that subscribes to Convex's live queries and applies
  incoming changes to `Store`/`AppConfig` on this device, and a
  `stopSync()`/disconnect path for logout.
- Triggered from the existing mutation paths: `saveConfig()` callers and
  `Store`'s bot-mutating methods call into `convexSync` (fire-and-forget,
  never block the local write — Convex sync is best-effort).

### 3. Client-side encryption of secrets

- **The encryption key is derived from a separate sync passphrase, not
  the Convex Auth login.** Email+passcode (OTP) sign-in proves identity
  to Convex but never produces a stable secret the client holds and
  Convex doesn't — there is nothing to derive a reproducible key from on
  a second device. So: on first enabling sync, the user sets a sync
  passphrase (distinct from their login); the key is derived from it
  client-side (e.g. Argon2id/PBKDF2 → AES-GCM key) and never transmitted.
  Signing into a new device prompts for the same passphrase before any
  secret can be decrypted — settings/agents (non-secret parts) still sync
  without it, but `providerSecrets` stays encrypted and unreadable until
  entered.
- **No recovery if the passphrase is lost**: state this plainly in the UI
  at setup time. Losing it means re-entering provider keys on that device
  (not a data-loss event — just falls back to local-only secrets), not
  losing sync entirely.
- Convex functions treat the encrypted blob as opaque bytes — no
  server-side decryption, no plaintext secrets or driver `config` ever
  committed to Convex's database.
- Decryption happens client/harness-side immediately after pull, before
  merging into `AppConfig`.
- This is the highest-risk piece of the plan (§ Risks) and should be
  built and reviewed before anything else, with a fallback of "sync
  everything except secrets" if the encryption design doesn't hold up to
  scrutiny in time.

### 4. Sync semantics

- **Trigger**: push on every local write (debounced), pull on: app start,
  reconnect, and via Convex live-query push-to-client when another device
  writes.
- **Conflict resolution**: last-write-wins on `updatedAt`, per-record
  (per agent, and per top-level key within settings — e.g. a profile edit
  on device A and an instance edit on device B don't clobber each other).
  No merge UI in v1; documented as a known limitation.
- **First sync / adoption**: when a device with existing local
  `bots.json`/`config.json` logs in for the first time, existing local
  agents get assigned a fresh `agentKey` and are pushed up as the initial
  state (upload-wins for the very first sync, since there's nothing to
  merge against yet).
- **Deletes**: agent deletion sets `deleted: true` (tombstone) rather than
  removing the row, so other devices remove their local copy instead of
  re-creating it on next pull. Tombstones can be hard-deleted after all
  known devices have acknowledged (out of scope for v1 — just leave
  tombstones; low volume, not worth GC machinery yet).

### 5. UI changes

- `SettingsScreen.tsx` gets a new "Sync" section: sign in/out, sync status
  (last synced, connected devices count if easily available), and a clear
  statement of what does and doesn't sync (no chat history — this needs to
  be visible, not just documented, since it's a surprising boundary).
- Agent list UI gets a small sync indicator per agent (synced vs.
  local-only), since agents created before sync was enabled, or while
  offline, are local-only until the next successful push.

## Verification

- Unit tests (`server/convexSync.test.ts`) using a fake Convex client
  (per `AGENTS.md`'s testing conventions — fakes in `server/testing/`,
  wait for events not sleeps):
  - push/pull round-trip preserves all portable `BotRecord`/`AppConfig`
    fields and drops all non-portable ones.
  - last-write-wins resolves correctly on `updatedAt` ties and conflicts.
  - tombstoned agents don't resurrect on pull.
  - secrets never appear in plaintext in anything sent to the fake client.
- Manual scenarios:
  - Fresh device, sign in, confirm existing cloud agents/settings appear
    and existing chats are untouched/absent from any sync payload.
  - Two devices signed into the same account: edit an agent on device A,
    confirm it appears on device B without a restart (live query).
  - Go offline, edit locally, come back online, confirm the edit pushes
    and doesn't get clobbered by a stale pull.
  - Sign out: confirm local data is retained (not wiped) and sync simply
    stops.
  - Inspect the raw Convex dashboard data for a test account and confirm
    provider secrets and driver `config` are ciphertext, not plaintext.
  - New device, sign in, skip/forget the sync passphrase: confirm
    settings/agents still sync while `providerSecrets` stays encrypted
    and the UI clearly explains why keys aren't populated.
  - Enter the correct sync passphrase on a second device: confirm
    provider secrets decrypt and match device A.

## Risks and rollback

- **Secrets in a third-party cloud DB**: even encrypted, this raises the
  stakes of a bug in the encryption path. Mitigate by building/testing §3
  in isolation first, and keeping the "settings sync without secrets"
  fallback available as a shipping option if encryption isn't ready.
- **Lost sync passphrase**: unrecoverable by design (Convex never sees
  it). Scoped narrowly — only `providerSecrets`/driver `config` are
  affected; profile, instance identity, and agents remain synced and
  usable. Communicate this tradeoff at setup, not just in this doc.
- **First real account system**: adds login/session-expiry/logout edge
  cases the app has never had to handle. Keep sync fully optional and
  isolated — a user who never touches "Sync" in Settings should see zero
  behavior change.
- **New network dependency for a local-first app**: sync failures must
  degrade to "stays local," never to a blocked write or crash. All
  `convexSync` calls are fire-and-forget from the local write path.
- **Rollback**: sync is additive — disabling it (feature flag or simply
  not calling `convexSync` from the write paths) returns the app to its
  current fully-local behavior with no data loss, since local JSON files
  remain authoritative throughout.

## Approval

Status: awaiting user approval
