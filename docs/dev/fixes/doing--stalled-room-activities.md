---
status: review
created: 2026-08-13
updated: 2026-08-13
scope: stalled room activities
owner: codex
related: [review--room-approval-prompts.md]
---

# Settle and stop room activities

Room turns currently leave their provider process alive when the scheduler ceiling expires. Their runtime entry therefore remains in `Needs input`, while the room itself is no longer marked busy and exposes no stop control.

---

## Implementation

- [?] **Cancel timed-out provider turns before releasing the room** — `server/index.ts:1`. Keep activity ownership until cancellation settles and report a bounded timeout instead of abandoning the live provider turn.
- [?] **Add per-agent activity cancellation** — `server/index.ts:1`, `src/state/store.tsx:1`, `src/components/RoomActivityPanel.tsx:1`. Let users cancel a queued or active room activity from its card without discarding unrelated queued work.
- [?] **Verify cancellation and activity settlement** — `server/room-activity.test.ts:1`, `src/lib/roomActivity.test.ts:1`. Cover active cancellation, queued removal, and terminal state folding without real user data or sleeps.
