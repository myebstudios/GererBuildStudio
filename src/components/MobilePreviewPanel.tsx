import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WebviewTag } from "electron";
import { AlertTriangle, Camera, ChevronDown, Clock, Loader2, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { validateMobilePreviewUrl } from "@/lib/mobilePreviewUrl";
import { DEFAULT_MOBILE_DEVICE_PRESET_ID, MOBILE_DEVICE_PRESETS } from "@/lib/mobileDevicePresets";
import { addMobilePreviewUrlToHistory, getMobilePreviewUrlHistory } from "@/lib/mobilePreviewHistory";
import { getPersistedMobilePreviewState, setPersistedMobilePreviewState } from "@/lib/mobilePreviewState";
import type { Attachment } from "@/state/store";

const LOAD_TIMEOUT_MS = 15_000;
const FRAME_PADDING = 16;

type PreviewState = "empty" | "confirm" | "loading" | "loaded" | "error";

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return Math.ceil((base64.length * 3) / 4);
}

export function MobilePreviewPanel({
  onClose,
  onScreenshot,
  className,
}: {
  onClose?: () => void;
  onScreenshot?: (attachment: Attachment) => void;
  className?: string;
}) {
  const persisted = useRef(getPersistedMobilePreviewState());
  const [input, setInput] = useState(() => persisted.current?.input ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [isLocalOrPrivate, setIsLocalOrPrivate] = useState(false);
  const [pendingLocalUrl, setPendingLocalUrl] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(persisted.current?.presetId ?? DEFAULT_MOBILE_DEVICE_PRESET_ID);
  const [state, setState] = useState<PreviewState>("empty");
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [urlHistory, setUrlHistory] = useState<string[]>(() => getMobilePreviewUrlHistory());
  const [screenshotMenuOpen, setScreenshotMenuOpen] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const webviewRef = useRef<WebviewTag | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const frameAreaRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);
  const screenshotErrorTimerRef = useRef<number | null>(null);

  const preset = MOBILE_DEVICE_PRESETS.find((item) => item.id === presetId) ?? MOBILE_DEVICE_PRESETS[0];

  function clearTimer() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function navigateTo(validatedUrl: string) {
    setUrl(validatedUrl);
    setError(null);
    setState("loading");
    clearTimer();
    setUrlHistory(addMobilePreviewUrlToHistory(validatedUrl));
    timeoutRef.current = window.setTimeout(() => {
      setState((current) => {
        if (current !== "loading") return current;
        setError("This page is taking too long to respond.");
        return "error";
      });
    }, LOAD_TIMEOUT_MS);
  }

  function loadUrl(raw: string) {
    const result = validateMobilePreviewUrl(raw);
    if (!result.ok || !result.url) {
      setState("error");
      setError(result.error ?? "Invalid URL.");
      return;
    }
    setIsLocalOrPrivate(result.isLocalOrPrivate);
    if (result.isLocalOrPrivate) {
      setPendingLocalUrl(result.url);
      setState("confirm");
      return;
    }
    navigateTo(result.url);
  }

  // Restore the last URL/device on first mount so the panel doesn't come up
  // empty after being closed, switched away from, or the app restarted.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (persisted.current?.input) loadUrl(persisted.current.input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPersistedMobilePreviewState({ input, presetId });
  }, [input, presetId]);

  useEffect(() => {
    const node = webviewRef.current;
    if (!node || !url) return;
    const handleFinish = () => {
      clearTimer();
      setState("loaded");
    };
    const handleFail = (event: Electron.DidFailLoadEvent) => {
      if (event.errorCode === -3) return; // aborted by a newer navigation, not a real failure
      clearTimer();
      setError("Couldn't load this page — it may block embedding or the address may be unreachable.");
      setState("error");
    };
    node.addEventListener("did-finish-load", handleFinish);
    node.addEventListener("did-fail-load", handleFail as EventListener);
    return () => {
      node.removeEventListener("did-finish-load", handleFinish);
      node.removeEventListener("did-fail-load", handleFail as EventListener);
    };
  }, [url]);

  useEffect(
    () => () => {
      clearTimer();
      if (screenshotErrorTimerRef.current !== null) window.clearTimeout(screenshotErrorTimerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const node = frameAreaRef.current;
    if (!node) return;
    const recompute = () => {
      const availableWidth = node.clientWidth - FRAME_PADDING * 2;
      const availableHeight = node.clientHeight - FRAME_PADDING * 2;
      const next = Math.min(1, availableWidth / preset.width, availableHeight / preset.height);
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(node);
    return () => observer.disconnect();
  }, [preset.width, preset.height, state]);

  const filteredHistory = urlHistory.filter((item) => !input.trim() || item.toLowerCase().includes(input.trim().toLowerCase())).slice(0, 8);

  function pickHistoryUrl(item: string) {
    setInput(item);
    setHistoryOpen(false);
    loadUrl(item);
  }

  async function takeScreenshot(fullPage: boolean) {
    setScreenshotMenuOpen(false);
    const node = webviewRef.current;
    if (!node || !window.gbs?.previewScreenshot) {
      setScreenshotError("Screenshots are available in the desktop app.");
      return;
    }
    setScreenshotBusy(true);
    setScreenshotError(null);
    try {
      const webContentsId = node.getWebContentsId();
      const dataUrl = await window.gbs.previewScreenshot({ webContentsId, fullPage });
      if (!dataUrl) throw new Error("empty");
      const attachment: Attachment = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `att_${Date.now()}`,
        name: `screenshot-${fullPage ? "full-page" : "visible"}-${Date.now()}.png`,
        mimeType: "image/png",
        size: estimateDataUrlBytes(dataUrl),
        dataUrl,
      };
      onScreenshot?.(attachment);
    } catch {
      setScreenshotError("Couldn't capture a screenshot.");
      screenshotErrorTimerRef.current = window.setTimeout(() => setScreenshotError(null), 4000);
    } finally {
      setScreenshotBusy(false);
    }
  }

  return (
    <aside className={cn("flex h-full w-[400px] shrink-0 flex-col border-l border-hairline/40 bg-panel", className)} aria-label="Mobile preview">
      <div className="shrink-0 border-b border-hairline/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="shrink-0 text-accent" />
          <form
            className="relative flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              setHistoryOpen(false);
              loadUrl(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => setHistoryOpen(true)}
              onBlur={() => window.setTimeout(() => setHistoryOpen(false), 120)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setHistoryOpen(false);
              }}
              placeholder="Enter a URL to preview"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-md border border-hairline/40 bg-inset px-2 py-1 text-[12px] text-ink placeholder:text-ink-secondary/70 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {historyOpen && filteredHistory.length > 0 && (
              <ul
                role="listbox"
                aria-label="Recent preview URLs"
                className="absolute left-0 right-9 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-hairline/40 bg-raised py-1 shadow-lg"
              >
                {filteredHistory.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      // mousedown fires before the input's blur, so the click
                      // lands before onBlur closes the list out from under it
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pickHistoryUrl(item);
                      }}
                      className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11.5px] text-ink-secondary hover:bg-raised-hover hover:text-ink"
                    >
                      <Clock size={11} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="submit" className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white">
              Go
            </button>
          </form>
          {state === "loaded" && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setScreenshotMenuOpen((open) => !open)}
                disabled={screenshotBusy}
                aria-label="Take a screenshot"
                aria-expanded={screenshotMenuOpen}
                title="Screenshot"
                className="flex items-center gap-0.5 rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-50"
              >
                {screenshotBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                <ChevronDown size={10} />
              </button>
              {screenshotMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Dismiss screenshot menu"
                    className="fixed inset-0 z-20 cursor-default"
                    onClick={() => setScreenshotMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-md border border-hairline/40 bg-raised py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => takeScreenshot(false)}
                      className="block w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-raised-hover"
                    >
                      Visible area
                    </button>
                    <button
                      type="button"
                      onClick={() => takeScreenshot(true)}
                      className="block w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-raised-hover"
                    >
                      Full page
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close mobile preview panel" className="shrink-0 rounded-md p-1 text-ink-secondary hover:bg-raised hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {MOBILE_DEVICE_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPresetId(item.id)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                item.id === presetId ? "bg-accent/10 text-accent" : "bg-inset text-ink-secondary hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
          {isLocalOrPrivate && (state === "loading" || state === "loaded") && (
            <span className="ml-auto flex items-center gap-1 text-[10.5px] text-warning">
              <AlertTriangle size={11} /> local/internal
            </span>
          )}
        </div>
        {screenshotError && <div className="mt-1.5 text-[10.5px] text-danger">{screenshotError}</div>}
      </div>

      <div ref={frameAreaRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {state === "empty" && (
          <div className="flex flex-col items-center justify-center px-5 text-center text-[12px] leading-5 text-ink-secondary">
            <Smartphone size={20} className="mb-3 text-ink-secondary/60" />
            Enter a URL to preview it on a mobile device.
          </div>
        )}

        {state === "confirm" && pendingLocalUrl && (
          <div className="flex flex-col items-center justify-center px-5 text-center text-[12px] leading-5 text-ink-secondary">
            <AlertTriangle size={20} className="mb-3 text-warning" />
            <p className="text-ink">
              <span className="font-medium">{pendingLocalUrl}</span> is a local or internal address.
            </p>
            <p className="mt-1">Loading it in this preview may expose it to the embedded page.</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setState("empty");
                  setPendingLocalUrl(null);
                }}
                className="rounded-md border border-hairline/40 px-3 py-1.5 text-[12px] font-medium text-ink-secondary hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pendingLocalUrl;
                  setPendingLocalUrl(null);
                  if (target) navigateTo(target);
                }}
                className="rounded-md bg-warning px-3 py-1.5 text-[12px] font-medium text-white"
              >
                Continue anyway
              </button>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center justify-center px-5 text-center text-[12px] leading-5 text-ink-secondary">
            <AlertTriangle size={20} className="mb-3 text-danger/70" />
            {error}
          </div>
        )}

        {(state === "loading" || state === "loaded") && url && (
          <div className="flex flex-col items-center">
            <div
              className="relative overflow-hidden"
              style={{
                width: preset.width * scale,
                height: preset.height * scale,
              }}
            >
              <div
                className="absolute left-0 top-0 overflow-hidden rounded-[28px] border-[6px] border-raised bg-inset shadow-lg"
                style={{
                  width: preset.width,
                  height: preset.height,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              >
                {state === "loading" && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel/80">
                    <Loader2 size={20} className="animate-spin text-accent" />
                  </div>
                )}
                <webview
                  ref={(node) => {
                    webviewRef.current = node as WebviewTag | null;
                  }}
                  src={url}
                  nodeintegration={false}
                  allowpopups={false}
                  className="size-full"
                />
              </div>
            </div>
            <div className="mt-2 text-[11px] text-ink-secondary">
              {preset.label} · {preset.width}×{preset.height}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
