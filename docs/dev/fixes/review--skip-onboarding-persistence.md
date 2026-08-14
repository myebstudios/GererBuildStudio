---
status: review
created: 2026-08-14
updated: 2026-08-14
scope: onboarding persistence
owner: implementer
related: []
---

# Onboarding persistence and dismissibility

Ensure the first-run onboarding modal persists dismissals and completed profiles so users are not prompted on every launch, and allow "Maybe later" to dismiss immediately.

---

## 1. Onboarding dismissal and persistence

- [?] **Dismiss onboarding immediately on "Maybe later"** — `src/components/Onboarding.tsx:141`. Make "Maybe later" set `setEmailGateDone("skipped")` and close the onboarding modal via `onDone()`.
- [?] **Add skip option and persist progress across steps** — `src/components/Onboarding.tsx:55`. Set gate status when saving profile and provide a skip button on the engines step.
- [?] **Sync server-side profile to client gate state** — `src/App.tsx:90`. Avoid re-prompting if the server already has a saved user profile in config.
