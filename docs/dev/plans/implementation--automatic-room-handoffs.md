# Automatic Room Handoffs — Implementation Plan

## Outcome

Give the user an explicit per-room choice between manual coordination and automatic agent handoffs. Automatic handoffs are disabled by default. When enabled, a room agent can queue teammates by mentioning them in its response, including mentions formatted by Markdown such as `**@SoSo**`.

## Product behavior

- Add an `Auto handoffs` switch to the room Activity panel.
- Persist the switch on the room so its choice survives restarts and is synchronized across clients.
- Keep direct user-authored `@Agent` mentions executable regardless of the switch.
- When the switch is off, agent-authored mentions render normally but do not start another turn.
- When the switch is on, agent-authored mentions queue matching room members sequentially.
- Retain the existing one-hop ceiling, sender exclusion, deduplication, queue ordering, timeout handling, and Stop controls.

## Data and API changes

Extend `GroupRecord` and the client `Group` shape with `autoHandoffs: boolean`. Normalize older persisted rooms to `false`, set new rooms to `false`, include the field in room payloads, and allow it through the existing `PATCH /api/groups/:id` route only when the input is a boolean.

## Mention parsing

Update `mentionedBots` so valid mention boundaries include whitespace, start-of-text, and common Markdown punctuation. Preserve the current safeguards against email addresses and embedded identifiers. Continue longest-name matching and stable deduplication.

## Scheduler changes

The initial response list remains derived from the user's room message. After a member turn completes, inspect its response for teammate mentions only when `group.autoHandoffs` is true. Queue those teammates using the existing sequential scheduler and carry the current `spoken` set and hop counter so a response cannot create recursive chains.

Read the latest room record before deciding whether to chain, allowing the user to disable automation while a turn is running.

## UI changes

Place the switch below the Activity heading with concise helper text. Use a native button with `role="switch"` and `aria-checked`, dispatching the existing room patch action. The control remains available while work is active so the user can prevent the next handoff without stopping the current agent.

## Verification

- Unit-test legacy/new room defaults and persistence.
- Unit-test plain and Markdown-formatted mentions, longest-name matching, deduplication, email rejection, and mid-word rejection.
- Extend the real harness room test to prove disabled agent mentions do not queue and enabled mentions do.
- Test reducer folding of the room preference.
- Run the full test suite, type-check, production build, and a real-browser check of the switch and resulting queue.

## Boundaries

This does not create autonomous background workers, remove permission prompts, allow unbounded agent recursion, or cause task-board assignments to execute without a room handoff.
