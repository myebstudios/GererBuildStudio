export type SyncStatusState = "signed_out" | "syncing" | "synced" | "offline_error";

export interface SyncStatusContract {
  state: SyncStatusState;
  lastSyncedAt?: number | null;
  errorMessage?: string | null;
  connectedDevicesCount?: number;
}
