import { CloudOff, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useStore } from "@/state/store";
import { cn } from "@/lib/cn";
import type { SyncStatusState, SyncStatusContract } from "@/lib/syncState";

export interface SyncStatusButtonProps {
  status?: SyncStatusContract;
  className?: string;
}

export function SyncStatusButton({ status, className }: SyncStatusButtonProps) {
  const { dispatch } = useStore();
  const currentState: SyncStatusState = status?.state ?? "signed_out";

  const getStatusInfo = (st: SyncStatusState) => {
    switch (st) {
      case "synced":
        return {
          icon: <CheckCircle2 size={16} className="text-success shrink-0" />,
          label: "Sync Active",
          tooltip: "Sync status: All changes synced to cloud. Click to open Sync settings.",
          dotColor: "bg-success",
        };
      case "syncing":
        return {
          icon: <RefreshCw size={16} className="animate-spin text-accent shrink-0" />,
          label: "Syncing…",
          tooltip: "Sync status: Syncing with cloud servers… Click to open Sync settings.",
          dotColor: "bg-accent",
        };
      case "offline_error":
        return {
          icon: <AlertCircle size={16} className="text-danger shrink-0" />,
          label: "Sync Alert",
          tooltip: `Sync status: ${status?.errorMessage || "Offline / Sync error"}. Click to open Sync settings.`,
          dotColor: "bg-danger",
        };
      case "signed_out":
      default:
        return {
          icon: <CloudOff size={16} className="text-ink-secondary shrink-0" />,
          label: "Local Only",
          tooltip: "Sync status: Local storage only (Signed out). Click to set up cloud sync.",
          dotColor: "bg-ink-secondary",
        };
    }
  };

  const info = getStatusInfo(currentState);

  const handleClick = () => {
    dispatch({ type: "toggleAppSettings", open: true, tab: "sync" });
  };

  return (
    <button
      onClick={handleClick}
      title={info.tooltip}
      aria-label={info.tooltip}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-hairline/40 bg-raised/50 px-2 py-1.5 text-left text-[12px] font-medium text-ink hover:bg-raised transition-colors shrink-0",
        className
      )}
    >
      {info.icon}
      <span className="truncate hidden sm:inline text-[11px] text-ink-secondary">{info.label}</span>
      <span className={cn("size-1.5 rounded-full shrink-0", info.dotColor)} />
    </button>
  );
}
