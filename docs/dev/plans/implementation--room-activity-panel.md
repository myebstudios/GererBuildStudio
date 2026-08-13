# Implementation plan: live room activity panel

## Objective

Add a right-side room workstream that lets a user understand, at a glance, what every room agent is doing. The panel will be driven by canonical provider runtime events and server queue state—not by interpreting agent prose—so statuses remain accurate during long turns and tool-heavy work.

The panel covers room agents only. It reports the processes the harness can truthfully observe: agent turns, provider tool calls (including command titles where supplied), permission/question waits, errors, and the room's sequential responder queue. It will not claim to enumerate arbitrary child operating-system processes that a provider does not expose.

## Current state

- `server/contracts.ts:25-72` already normalizes `turn.started`, `item.started`, `item.completed`, `request.opened`, `request.resolved`, `runtime.error`, and `turn.completed` events.
- `server/index.ts:139-220` broadcasts those runtime events and folds tool calls into persisted activity messages. Room messages receive `from.botId`, but the raw `runtime` SSE frame does not identify the room speaker.
- `server/index.ts:590-630` runs mentioned room responders sequentially through an in-memory promise queue. Only `busyBotId` is exposed, so agents waiting behind the current speaker are invisible.
- `src/state/store.tsx:580-920` isolates high-frequency streaming text in its own context, but otherwise discards runtime lifecycle events after handling deltas and turn completion.
- `src/components/GroupView.tsx` renders a single-column room. Activity chips are interleaved in the transcript, requiring users to scroll and mentally group them by agent.
- The supplied reference screenshot shows adequate horizontal room space for a persistent right rail on wide displays, while the existing 900px minimum-size target requires a non-persistent drawer.

## Activity contract

Each room member has one derived status:

1. `waiting`: no active or queued work;
2. `queued`: scheduled to respond, with a one-based queue position;
3. `running`: turn started or the server marks the member active;
4. `approval`: a permission or question request is open;
5. `failed`: the latest runtime error or failed turn/tool has not been superseded by a newer turn; or
6. `completed`: a turn just settled successfully, shown as a recent outcome before returning visually to idle.

Each activity entry contains a stable event/item/request key, agent ID, kind, title, state, start/update timestamps, and optional outcome. Tool titles are rendered as plain text and truncated safely. History is bounded per room and per agent to prevent a long-running app session from growing without limit.

## Proposed changes

1. **Add trusted actor and queue metadata server-side.**
   - Change room `runtime` frames to include the active `botId`, using the server's `groupSpeakers` map. Direct-chat frames may include their bot ID for consistency.
   - Add transient `queuedBotIds` to the room record and API shape. Exclude it from persistence just like `busyBotId`.
   - When a user message resolves responders, append them to the ordered room queue. Remove an agent when its turn starts and clear scheduled agents on completion/error.
   - Make interruption clear the active turn and remaining queue deterministically. Preserve the current sequential speaking contract.
   - Ensure chained `@mentions` join the queue before their turn so the panel never misses them.

2. **Create an isolated client activity context.**
   - Add `src/state/roomActivity.tsx` with a reducer and `RoomActivityProvider`/hook.
   - Fold lifecycle events by `threadId` and trusted `botId`; reconcile `queuedBotIds` and `busyBotId` from group frames.
   - Match `item.started`/`item.completed` by `itemId`, permission open/resolve by `requestId`, and turn start/complete by `turnId`.
   - Use a small interval only while activities are running to display elapsed time; runtime events themselves remain event-driven.
   - Keep this state outside the main store reducer, following the existing streaming-context pattern, so timer/event updates do not rerender the entire app.

3. **Build the room activity panel.**
   - Add `RoomActivityPanel` using existing panel/card colors, hairline borders, mascot avatars, typography, spinners, success/warning/danger colors, and Lucide icons.
   - Header: `Activity`, live/idle summary, and close control when used as a drawer.
   - Member cards: avatar/name, status pill, elapsed time or queue position, current tool/process title, approval summary, and the latest bounded completed/failed entries.
   - Use attributed persisted `group.messages` to show recent tool history after a reload, deduplicating entries already represented by live state.
   - Empty state explains that agent turns and tools will appear there.

4. **Integrate responsive room layout.**
   - Refactor `GroupView` into a flexible chat column plus activity rail.
   - Show the rail by default at wide desktop widths (target `min-width: 1180px`) with an approximately 320px width.
   - Add an Activity button with an active-count badge in the room header. At compact widths it opens a right-side overlay drawer; at wide widths it toggles the rail without covering chat.
   - Persist the user's open/closed preference locally, while defaulting to open on wide screens.
   - Keep the composer, bulletin, transcript scroll/follow behavior, Windows drag regions, minimum width, and current member header interactions intact.

5. **Test the real lifecycle.**
   - Server unit/integration tests: trusted actor attribution, initial responders, queue ordering, chained responders, successful clearing, interruption, failure, and restart non-persistence.
   - Reducer tests: out-of-order/duplicate events, multiple agents, tool completion, approval resolution, failure recovery, bounded history, and missing actor IDs.
   - Full existing type-check, Vitest, build, and Electron syntax gates.
   - Playwright smoke scenarios at 900×600 and 1440×920: open/close behavior, queue and running cards, long command truncation, approval/failure colors, independent panel/transcript scrolling, no overlap, keyboard focus, and zero console errors.

## Risks and rollback

- **Incorrect ownership:** a room shares one thread ID, so client-side inference can assign work to the wrong agent. Mitigation: the server adds its trusted active speaker to every runtime frame.
- **Queue drift:** promise-chain failures or interruptions can leave stale queued IDs. Mitigation: queue mutations are centralized and every terminal path clears or advances them; integration tests cover each path.
- **Misleading “process” claims:** provider events do not expose every OS child PID. Mitigation: label observed tool calls/actions accurately and document the visibility boundary.
- **High-frequency rerenders:** elapsed timers and runtime events could degrade chat streaming. Mitigation: an isolated activity context, bounded histories, memoized cards, and a timer active only while work runs.
- **Narrow-layout regression:** a fixed rail could crush the transcript. Mitigation: persistent rail only at the wide breakpoint and an overlay drawer below it.
- **Transcript duplication:** tools remain visible in chat and the panel. Mitigation: the transcript remains the chronological record; the panel is deliberately grouped by agent and bounded to current/recent work.

Rollback is a scoped Git revert. The new room queue fields are transient and additive, and persisted messages remain unchanged.

## Approval

Status: awaiting user approval
