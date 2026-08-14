import { useEffect, useRef, useState } from "react";
import type { WebviewTag } from "electron";
import { AlertTriangle, Loader2, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { validateMobilePreviewUrl } from "@/lib/mobilePreviewUrl";
import { DEFAULT_MOBILE_DEVICE_PRESET_ID, MOBILE_DEVICE_PRESETS } from "@/lib/mobileDevicePresets";

const LOAD_TIMEOUT_MS = 15_000;

type PreviewState = "empty" | "loading" | "loaded" | "error";

export function MobilePreviewPanel({ onClose, className }: { onClose?: () => void; className?: string }) {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [isLocalOrPrivate, setIsLocalOrPrivate] = useState(false);
  const [presetId, setPresetId] = useState(DEFAULT_MOBILE_DEVICE_PRESET_ID);
  const [state, setState] = useState<PreviewState>("empty");
  const [error, setError] = useState<string | null>(null);
  const webviewRef = useRef<WebviewTag | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const preset = MOBILE_DEVICE_PRESETS.find((item) => item.id === presetId) ?? MOBILE_DEVICE_PRESETS[0];

  function clearTimer() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function loadUrl(raw: string) {
    const result = validateMobilePreviewUrl(raw);
    if (!result.ok || !result.url) {
      setState("error");
      setError(result.error ?? "Invalid URL.");
      return;
    }
    setIsLocalOrPrivate(result.isLocalOrPrivate);
    setUrl(result.url);
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

  return (
    <aside className={cn("flex h-full w-[400px] shrink-0 flex-col border-l border-hairline/40 bg-panel", className)} aria-label="Mobile preview">
      <div className="shrink-0 border-b border-hairline/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Smartphone size={16} className="text-accent" /> Mobile preview
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close mobile preview panel" className="rounded-md p-1.5 text-ink-secondary hover:bg-raised hover:text-ink">
              <X size={16} />
            </button>
          )}
        </div>
        <form
          className="mt-3 flex items-center gap-2"
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
            className="min-w-0 flex-1 rounded-lg border border-hairline/40 bg-inset px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-secondary/70 focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button type="submit" className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white">
            Go
          </button>
        </form>
        <div className="mt-2.5 flex items-center gap-1.5">
          {MOBILE_DEVICE_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPresetId(item.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                item.id === presetId ? "bg-accent/10 text-accent" : "bg-inset text-ink-secondary hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {isLocalOrPrivate && state !== "empty" && (
          <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] leading-4 text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Previewing a local or internal address.
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {state === "empty" && (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center text-[12px] leading-5 text-ink-secondary">
            <Smartphone size={20} className="mb-3 text-ink-secondary/60" />
            Enter a URL to preview it on a mobile device.
          </div>
        )}

        {state === "error" && (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center text-[12px] leading-5 text-ink-secondary">
            <AlertTriangle size={20} className="mb-3 text-danger/70" />
            {error}
          </div>
        )}

        {(state === "loading" || state === "loaded") && url && (
          <div className="mx-auto flex flex-col items-center">
            <div
              className="relative overflow-hidden rounded-[28px] border-[6px] border-raised bg-inset shadow-lg"
              style={{ width: preset.width, height: preset.height }}
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
            <div className="mt-2 text-[11px] text-ink-secondary">
              {preset.label} · {preset.width}×{preset.height}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
