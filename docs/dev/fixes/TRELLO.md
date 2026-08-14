# Trello synchronization

The optional sync mirrors status-prefixed Markdown tasks from `docs/dev/fixes/` to Trello. Local files remain the source of truth.

## Setup

1. Create or choose a Trello Power-Up/API key at <https://trello.com/power-ups/admin>.
2. Use Trello's token authorization flow for that key with read/write access.
3. Copy `.env.example` to `.env.local` and replace the placeholder values:

```bash
TRELLO_API_KEY=your_api_key
TRELLO_TOKEN=your_token
TRELLO_BOARD_NAME="Gerer Build Studio Tasks"
```

Never commit `.env.local`, the token, or a real secret. Keep `.env.example` limited to placeholders.

4. Run `pnpm trello:sync`.

## Behavior

The script creates or reuses `Todo`, `Doing`, `Review`, and `Done` lists. It maps status-prefixed files to cards and task checkboxes to a `Line Items` checklist. Trello only supports binary checklist completion, so the detailed state is retained in each checklist item's `[Todo]`, `[Doing]`, `[Review]`, or `[Done]` label.

Cards managed by the script contain an `<!-- ai-workflow-scope: ... -->` marker. If a managed local task disappears, its Trello card is archived. Unmarked cards and manually managed lists are not archived or deleted.

Do not edit synchronized task content in Trello; the next sync may overwrite it. Use Trello for visibility and keep edits in Markdown.

## When synchronization fails

- `Missing TRELLO_API_KEY or TRELLO_TOKEN`: configure `.env.local`.
- `401` or `invalid token`: regenerate the token and confirm it belongs to the configured key.
- Board not found: the script creates the board named by `TRELLO_BOARD_NAME`; confirm spelling if a duplicate appears.
- Network/API error: leave the local Markdown change intact, report that remote sync is pending, and retry later.
