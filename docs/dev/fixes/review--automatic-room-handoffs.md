---
status: review
created: 2026-08-14
updated: 2026-08-14
scope: automatic room handoffs
owner: codex
related: [review--room-approval-prompts.md, review--stalled-room-activities.md]
---

# Let users opt into automatic room handoffs

Agent-authored delegation messages currently look actionable but do not reliably start teammates: Markdown-formatted mentions are not recognized, and rooms expose no explicit control over whether agent-to-agent mentions should execute. Add a persisted, per-room choice that is off by default.

---

## 1. Room preference and controls

- [?] **Persist a per-room automatic-handoffs preference** — `server/store.ts:1`, `server/index.ts:1`, `src/state/store.tsx:1`. Default existing and new rooms to manual handoffs and accept only a validated boolean through the room patch API.
- [?] **Expose the choice in the Activity panel** — `src/components/RoomActivityPanel.tsx:1`. Add an accessible switch explaining that agent-authored mentions will automatically queue teammates when enabled.

## 2. Delegation behavior

- [?] **Recognize mentions surrounded by Markdown punctuation** — `server/store.ts:1`. Match `**@Agent**` and similar rendered forms while continuing to reject email addresses and mid-word `@` characters.
- [?] **Gate agent-authored handoffs on the room preference** — `server/index.ts:1`. Keep user-authored mentions executable, permit one bounded agent-to-agent hop only when enabled, and preserve deduplication and sequential room execution.

## 3. Verification

- [?] **Cover preference persistence and mention parsing** — `server/store.test.ts:1`, `server/comms.test.ts:1`. Verify defaults, round trips, Markdown mentions, email rejection, and deduplication.
- [?] **Cover manual and automatic room behavior** — `server/room-activity.test.ts:1`, `src/lib/store.test.ts:1`. Prove that agent mentions remain inert when disabled, queue teammates when enabled, and remain bounded to one hop.
