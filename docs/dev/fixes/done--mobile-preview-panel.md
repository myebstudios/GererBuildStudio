---
status: done
created: 2026-08-14
updated: 2026-08-14
scope: mobile device preview panel (v1)
owner: SoSo
related: [implementation--mobile-preview-panel.md]
---

# Mobile device preview panel (v1)

Add a sidebar-toggled panel that renders an arbitrary URL inside fixed mobile device-frame viewports (iPhone SE, iPhone 14 Pro, Pixel 7 reference), so a user can sanity-check a page on a few common phone sizes without leaving the app. Follows the existing `RoomActivityPanel` toggle pattern. Multi-device sync, inspector, and screenshots are out of scope for v1 — see `docs/dev/plans/implementation--mobile-preview-panel.md` for the full plan and hardening checklist.

---

## 1. Webview surface + hardening

- [x] **Enable `webviewTag` and enforce guest `webPreferences` in main** — `electron/main.mjs`. Set `webviewTag: true`; added a `will-attach-webview` handler that overwrites guest `webPreferences` (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, no `preload`) regardless of renderer request.
- [x] **Block guest navigation/popups** — `electron/main.mjs`. `did-attach-webview` denies `setWindowOpenHandler` and blocks non-`http(s)` `will-navigate` on the attached guest.

## 2. URL validation

- [x] **Scheme allowlist + local-address detection** — `src/lib/mobilePreviewUrl.ts`. Allows only `http:`/`https:`; rejects `javascript:`/`file:`/`data:`/`chrome:` etc. before navigation; flags `localhost`/private-IP hosts.
- [x] **Local/internal-address confirm gate** — `src/components/MobilePreviewPanel.tsx`. Per Angel's review, a passive banner wasn't sufficient; local/private-IP results now stop at a `confirm` state (Cancel / Continue anyway) before `navigateTo()` ever fires — no webview `src` is set until the user explicitly confirms. In-page navigation to a private host after initial load is still not re-checked (documented as v1 scope in the plan's risk section).

## 3. Device presets

- [x] **Document preset constants** — `src/lib/mobileDevicePresets.ts`. iPhone SE 375×667@2x, iPhone 14 Pro 393×852@3x, Pixel 7 412×915@2.6x.

## 4. Panel + sidebar integration

- [x] **`MobilePreviewPanel` component** — `src/components/MobilePreviewPanel.tsx`. URL input, device pill row, webview preview area, empty/confirm/loading/loaded/error(+timeout) states, local-address confirm gate. Device frame scales down (via `ResizeObserver` + CSS `transform: scale`) to fit the available panel height instead of overflowing, and the header (URL bar + presets) is condensed to a single compact block to leave more vertical room for the frame.
- [x] **Sidebar toggle** — `src/components/GroupView.tsx`. `mobilePreviewOpen` local state + `localStorage` (`room-mobile-preview-open`), header toggle button, dual wide/narrow render alongside `RoomActivityPanel`.

## 5. Verification

- [x] **Typecheck** — `pnpm typecheck` passes (verified locally).
- [x] **Manual hardening pass** — per plan's Verification section (no Node access from guest devtools, `javascript:`/`file:` rejected client-side, no popped windows). @Angel verified: scheme allowlist rejects non-http(s), main-process `will-attach-webview`/`will-navigate` guards enforced server-side, confirm gate closes the local-address blocking item. Signed off in review.
