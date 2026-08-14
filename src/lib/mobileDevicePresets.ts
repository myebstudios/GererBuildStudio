export interface MobileDevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  dpr: number;
}

// CSS px dimensions and device pixel ratio, documented so the frame sizes
// aren't magic numbers. DPR is reference-only in v1 (not applied via
// zoomFactor) — see docs/dev/plans/implementation--mobile-preview-panel.md.
export const MOBILE_DEVICE_PRESETS: MobileDevicePreset[] = [
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667, dpr: 2 },
  { id: "iphone-14-pro", label: "iPhone 14 Pro", width: 393, height: 852, dpr: 3 },
  { id: "pixel-7", label: "Pixel 7", width: 412, height: 915, dpr: 2.6 },
];

export const DEFAULT_MOBILE_DEVICE_PRESET_ID = MOBILE_DEVICE_PRESETS[0].id;
