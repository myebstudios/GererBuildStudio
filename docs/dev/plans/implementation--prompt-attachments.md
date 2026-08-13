# Implementation plan: prompt attachments

## Objective

Enable users to attach images and files (documents, source code, data files, PDFs, etc.) to prompt messages in both 1:1 bot chats and group rooms. Users can attach files via a paperclip button, file drag-and-drop onto the composer, and clipboard paste (e.g. pasted screenshots or copied files). Staged attachments show clean, removable preview chips before sending. Attached media persists in message transcripts, renders beautifully in conversation bubbles with image viewing and file inspection/downloading, and is passed to bot drivers with disk-backed workspace saving and structured prompt context so agents can read, inspect, and reason about attached files.

Cloud-hosted remote object storage and video streaming are out of scope.

## Current state

- `server/contracts.ts:89-120`: `SendTurnInput` currently only accepts string `text`, `model`, `resumeCursor`, `transcript`, and `integrations`. There is no structured attachment field in the adapter contract.
- `server/store.ts:41-63`: `Message` interface holds `id`, `role`, `kind`, `text`, `card`, `tool`, `png`, `mime`, `at`, `parentId`, `from`, `reactions`, and `comm`. Attachments are not represented.
- `server/index.ts:1076-1215`: Message sending and editing endpoints (`/api/bots/:id/messages`, `/api/groups/:id/messages`, `/api/bots/:id/messages/:id/edit`) require `body.text` to be non-empty and discard any attachments.
- `server/index.ts:331-450`: `startTurn` and `startGroupTurn` construct turn prompts and transcripts purely from text strings without creating disk files for user attachments or providing file references to provider drivers.
- `src/state/store.tsx:31-70`, `177-210`: The client store and actions (`send`, `sendGroup`, `editMessage`) do not accept or retain attachments on user messages.
- `src/components/Composer.tsx:24-345`: The composer provides text input, @bot/@project mentions, and voice dictation, but has no file attachment button, drop zone, clipboard paste handler, or staged attachment preview tray.
- `src/components/ChatView.tsx:230-300` & `src/components/GroupView.tsx:60-96`: Chat bubble renderers only display `message.text` and do not render attached images or file cards.

## Proposed changes

### 1. Attachment data model & message persistence
- Define `Attachment` contract in `server/contracts.ts`, `server/store.ts`, and `src/state/store.tsx`:
  ```ts
  export interface Attachment {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    /** Base64 data URL (e.g. data:image/png;base64,... or data:application/octet-stream;base64,...) */
    dataUrl?: string;
    /** Extracted UTF-8 text for text/code/markup files */
    textContent?: string;
    /** Saved local path on disk in the thread's workspace */
    path?: string;
  }
  ```
- Update `Message` interface across server and client to include `attachments?: Attachment[]`.
- Update `server/store.ts` (`appendMessage`, `branchMessage`, `messagesFor`, `clearThread`) to persist and retrieve `attachments` in `messages-<threadId>.json`.

### 2. Disk persistence & turn context integration
- In `server/index.ts`:
  - When a message with attachments is dispatched (`startTurn` and `startGroupTurn`), decode and write the attachment payloads to `DATA_DIR/workspaces/<threadTag>/attachments/<sanitizedFileName>`.
  - For image files and binary documents, record the saved absolute file path on the attachment object.
  - In `turnText`, generate a structured `[Attached files]` section informing the model of the filenames, file sizes, local workspace paths, and text content (for text/code attachments), so any agent (Claude, Antigravity, Grok, Codex, ACP) can read or inspect the files immediately via file tools or direct prompt context.
  - Update `SendTurnInput` in `server/contracts.ts` to include `attachments?: Attachment[]`.
  - Update message routes to permit messages where `text` is empty if `attachments` are provided.

### 3. Composer UX: file picker, drag-and-drop, paste, & preview tray
- In `src/components/Composer.tsx`:
  - Add an attachment trigger button (Paperclip icon) with accessible labels and tooltips.
  - Hidden file input `<input type="file" multiple ... />` allowing all file types (images, PDFs, source code, text, CSVs, etc.).
  - Implement clipboard `onPaste` listener on the textarea to automatically stage pasted image files (e.g. screenshots from clipboard) or copied files.
  - Implement drag-and-drop handlers (`onDragOver`, `onDragLeave`, `onDrop`) with visual highlight when dragging files over the composer.
  - Render a staged attachments tray above the input box:
    - Display thumbnail preview for images (`image/*`).
    - Display file icon, filename, and formatted file size (e.g., "14.2 KB") for non-image files.
    - Display a remove button (`X`) on each staged attachment.
  - Allow sending when either text OR at least one attachment is present.
  - Preserve staged attachments when queuing a message while a bot is busy.

### 4. Chat history rendering & sidebar previews
- In `src/components/ChatView.tsx` & `src/components/GroupView.tsx`:
  - Render attachments attached to user messages:
    - Images: responsive image preview grid with click-to-enlarge modal/lightbox.
    - Non-image files: clickable attachment card showing file icon, filename, size, and download/open action using the file's dataUrl.
- In `src/components/Sidebar.tsx`:
  - Format latest message snippet to show `[Image: filename]` or `[File: filename]` when message text is empty or prefixed.

### 5. Client store and action updates
- In `src/state/store.tsx`:
  - Update `send`, `sendGroup`, and `editMessage` actions to accept `attachments?: Attachment[]`.
  - Forward attachments in JSON payloads to `/api/bots/:id/messages`, `/api/groups/:id/messages`, and `/api/bots/:id/messages/:id/edit`.
  - Include attachments in `messageAdded` and `messagePatched` reducers.

## Verification

### Automated tests
1. `server/store.test.ts`:
   - Store and retrieve user messages with attachments.
   - Message branching preserving attachments across fork versions.
   - Thread clearing cleanly removing attached messages.
2. `server/index.test.ts` (or new `server/attachments.test.ts`):
   - POST `/api/bots/:id/messages` with attachments and empty text (202 accepted).
   - POST `/api/bots/:id/messages` with both text and image attachments.
   - Verify attachments are written to workspace disk directory.
   - POST `/api/groups/:id/messages` with attachments.
   - POST `/api/bots/:id/messages/:id/edit` with updated attachments.
3. Run `corepack pnpm typecheck` and `corepack pnpm test`.
4. Run `corepack pnpm build` to verify client and server builds.

### Manual checks
1. Open app and attach an image (PNG/JPEG) via the paperclip button. Verify preview thumbnail in composer, send, and check image rendering in chat.
2. Drag and drop a file (e.g., `.ts` code file or `.pdf`) onto the composer. Verify file chip displays with name and size.
3. Paste a screenshot from the clipboard into the composer. Verify preview card appears.
4. Remove an attachment using the (X) button before sending.
5. Send a prompt containing both text and attachments; verify agent receives attachment path and prompt context.
6. Verify room chat supports attachments from user with member attribution and reactions.

## Risks and rollback

- **Large attachment payloads in JSON:** Sending large files in base64 could increase payload size.
  - *Mitigation:* Limit single file size to a sensible maximum (e.g., 20 MB) with clear UI validation feedback.
- **Disk pollution:** Storing attachments on disk for every turn.
  - *Mitigation:* Place attachments in per-thread workspace folders `DATA_DIR/workspaces/<tag>/attachments` which are already scoped by thread and cleaned up when thread/bot is deleted.
- **Backwards compatibility:** Existing `messages-<threadId>.json` files without `attachments` property.
  - *Mitigation:* Make `attachments` optional (`attachments?: Attachment[]`), defaulting gracefully to empty arrays.

Rollback: Reverting the Git commit cleanly restores previous message schema and composer without requiring database migrations.

## Approval

Status: awaiting user approval
