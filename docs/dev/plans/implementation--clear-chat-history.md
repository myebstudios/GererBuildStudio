# Implementation plan: clear chat history

## Objective

Let a user clear the history of one direct chat or room while keeping the bot, room membership, and room settings intact. The action will erase the persisted transcript and thread-specific diagnostic logs, reset continuation state that could make a future provider turn remember erased context, and update all connected app windows.

Bulk clearing, retention schedules, recovery/undo, and deleting bots or rooms are out of scope.

## Current state

- `server/store.ts:110-460` stores message trees per thread and separately persists bot continuation cursors. It can save, branch, and delete threads, but cannot replace an existing thread with a known-empty state.
- `server/index.ts:820-970` exposes deletion routes for rooms and bots. Those routes remove the whole entity, its transcript, and event/native diagnostic logs; there is no endpoint that keeps the entity while clearing only its conversation.
- `server/index.ts:130-230` broadcasts canonical server-sent events to connected windows. There is no event representing a cleared thread.
- `src/state/store.tsx:150-950` owns bot and room transcripts, sends API mutations, and reconciles SSE frames. It can delete entities but cannot clear a selected transcript or cancel associated transient display state.
- `src/components/Sidebar.tsx:199-420` provides existing right-click menus for rooms and direct chats, including destructive delete actions. There is no clear-history action or reusable confirmation flow.
- `src/state/roomActivity.tsx` holds transient per-room activity independently from transcript state, so a room clear must explicitly discard that thread's recent activity.

## Proposed changes

1. **Add a complete thread erase operation to the store.**
   - Add a method that persists `{ messages: [], activeLeafId: null }` for an existing thread.
   - Keep the thread ID stable so the bot or room and all references to it remain valid.
   - Add restart-level coverage proving cleared content and branch state do not return.

2. **Add an ownership-aware clear-history API.**
   - Add `DELETE /api/threads/:threadId/messages` and resolve the thread only through an owning bot or room; return not found for arbitrary thread IDs.
   - Reject the request with a conflict response while a direct bot is busy, or while a room has an active or queued responder. This avoids transcript/runtime races and orphaned tool results.
   - For direct chats, clear `resumeCursors` and the rewind flag so the next provider turn starts without a native session that still contains erased history.
   - Remove the thread's event and native NDJSON logs using the same best-effort semantics as entity deletion.
   - Broadcast a `thread.cleared` SSE frame only after the durable mutation succeeds.

3. **Reconcile local and remote client state.**
   - Add a request action that waits for API success before committing the destructive local state change, surfacing failures through the existing error path.
   - Add one reducer transition that clears messages and active-leaf state for the matching bot or room without touching other conversations.
   - Handle `thread.cleared` SSE frames idempotently so other windows update immediately.
   - Drop pending streamed text, screen/tool display state tied to the erased transcript where applicable, and the selected room's recent activity entries.

4. **Add an accessible confirmation flow to conversation menus.**
   - Add `Clear chat history` to both direct-chat and room context menus using existing menu styling and danger colors.
   - Disable the command while the selected conversation is active or queued and explain why through accessible text/title treatment.
   - Open an app-styled modal that names the bot or room, states that the entity remains, and warns that the history cannot be recovered.
   - Support cancel, Escape, backdrop dismissal, an explicitly labelled destructive confirm button, sensible initial focus, and focus restoration to the invoking control.

5. **Verify destructive and synchronized behavior.**
   - Store tests: empty messages, null active leaf, stable thread ownership, persistence after reload, and unrelated threads unchanged.
   - API tests: direct and room success, unknown thread rejection, active/queued conflict handling, cursor reset, log removal, and clear-event broadcast.
   - Client tests: direct and room reducer behavior, idempotent SSE handling, unrelated state preservation, and room-activity reset.
   - Run `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, and Electron entry-point syntax checks.
   - Exercise both menu/dialog flows in a real browser at 900×600 and 1440×920, including keyboard cancellation, busy disabled state, empty-chat rendering after confirmation, persistence across reload, and zero console errors.

## Risks and rollback

- **Irreversible user action:** clearing removes persisted transcript and logs. Mitigation: a named confirmation dialog, explicit irreversible copy, and no optimistic erase before server success.
- **Provider remembers erased content:** a native continuation cursor could retain prior context even after local messages are gone. Mitigation: reset all direct-chat cursors and rewind state in the same server mutation.
- **In-flight events repopulate the transcript:** a busy turn could finish after a clear. Mitigation: block clear while direct or room work is active or queued, and test the conflict path.
- **Partial deletion:** transcript persistence and diagnostic log deletion use different files. Mitigation: make the transcript mutation authoritative, clear continuation state synchronously, and treat already-absent diagnostic logs as success.
- **Cross-window drift:** one window could retain stale messages. Mitigation: broadcast a canonical post-commit event and handle it idempotently in every client.

Rollback is a scoped Git revert. No data migration or persisted schema change is introduced. History cleared by a user cannot be restored by rolling back the feature, which the confirmation text will state.

## Approval

Status: awaiting user approval
