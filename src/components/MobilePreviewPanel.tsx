import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WebviewTag } from "electron";
import { AlertTriangle, Loader2, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { validateMobilePreviewUrl } from "@/lib/mobilePreviewUrl";
import { DEFAULT_MOBILE_DEVICE_PRESET_ID, MOBILE_DEVICE_PRESETS } from "@/lib/mobileDevicePresets";

const LOAD_TIMEOUT_MS = 15_000;
const FRAME_PADDING = 16;

type PreviewState = "empty" | "confirm" | "loading" | "loaded" | "error";

export function MobilePreviewPanel({ onClose, className }: { onClose?: () => void; className?: string }) {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [isLocalOrPrivate, setIsLocalOrPrivate] = useState(false);
  const [pendingLocalUrl, setPendingLocalUrl] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(DEFAULT_MOBILE_DEVICE_PRESET_ID);
  const [state, setState] = useState<PreviewState>("empty");
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const webviewRef = useRef<WebviewTag | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const frameAreaRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => () => clearTimer(), []);

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

  return (
    <aside className={cn("flex h-full w-[400px] shrink-0 flex-col border-l border-hairline/40 bg-panel", className)} aria-label="Mobile preview">
      <div className="shrink-0 border-b border-hairline/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="shrink-0 text-accent" />
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              loadUrl(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Enter a URL to preview"
              className="min-w-0 flex-1 rounded-md border border-hairline/40 bg-inset px-2 py-1 text-[12px] text-ink placeholder:text-ink-secondary/70 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button type="submit" className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white">
              Go
            </button>
          </form>
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
