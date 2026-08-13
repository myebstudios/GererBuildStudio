---
status: review
created: 2026-08-13
updated: 2026-08-13
scope: room approval prompts
owner: codex
related: []
---

# Show and resolve agent prompts in rooms

Room agents can enter a `Needs input` state while their approval card is omitted from the room transcript. Even if rendered, the existing response route targets the agent's private thread instead of the active room thread.

---

## Implementation

- [?] **Render room option cards with agent attribution** — `src/components/GroupView.tsx:1`, `src/components/OptionCard.tsx:1`. Show approval and question cards in the room transcript with accessible response controls.
- [?] **Route card state and responses through the room thread** — `src/state/store.tsx:1`, `server/index.ts:1`. Settle the room message optimistically and validate that the responding agent belongs to the requested room.
- [?] **Cover room prompt display state and response routing** — `src/lib/store.test.ts:1`, `server/room-activity.test.ts:1`. Verify room card updates and that an approval response resumes the waiting room turn.
