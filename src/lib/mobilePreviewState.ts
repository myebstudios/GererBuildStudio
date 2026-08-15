const STATE_KEY = "mobile-preview-last-state";

export interface PersistedMobilePreviewState {
  input: string;
  presetId: string;
}

export function getPersistedMobilePreviewState(): PersistedMobilePreviewState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.input !== "string" || typeof parsed?.presetId !== "string") return null;
    return { input: parsed.input, presetId: parsed.presetId };
  } catch {
    return null;
  }
}

export function setPersistedMobilePreviewState(state: PersistedMobilePreviewState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}
