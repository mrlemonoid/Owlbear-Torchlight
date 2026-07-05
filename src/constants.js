export const ID = "com.mrlemonoid.flickering-light";
export const MARKER_KEY = `${ID}/marker`;
export const LOCAL_KEY = `${ID}/local`;
export const SCHEMA_VERSION = 3;

export const TORCH_STYLE_OPTIONS = [
  { value: "classic", label: "Classic Torch" },
  { value: "brazier", label: "Brazier / Guarded" },
  { value: "caged", label: "Caged Torch" },
  { value: "wild", label: "Wild Flame" },
];

export const BEAM_STYLE_OPTIONS = [
  { value: "clean", label: "Clean Beam" },
  { value: "barred", label: "Barred Window" },
  { value: "grated", label: "Grated Window" },
  { value: "cage", label: "Cage / Prison Bars" },
];

export const DEFAULT_TORCH_SETTINGS = {
  sourceType: "torch",
  torchStyle: "classic",
  beamStyle: "clean",
  radius: 320,
  sourceRadius: 50,
  intensity: 0.50,
  flicker: 0.60,
  speed: 1.50,
  irregularity: 0.35,
  markerOpacity: 0.01,
  visualGlow: true,
  fogLight: false,
  color: { x: 1.0, y: 0.502, z: 0.0 },
  hotspotColor: { x: 1.0, y: 0.91, z: 0.62 },
  torchBars: 8,
};

export const DEFAULT_BEAM_SETTINGS = {
  sourceType: "beam",
  torchStyle: "classic",
  beamStyle: "clean",
  beamLength: 420,
  beamWidth: 190,
  intensity: 0.85,
  flicker: 0.0,
  speed: 1.0,
  irregularity: 0.18,
  markerOpacity: 0.20,
  visualGlow: true,
  fogLight: false,
  color: { x: 1.0, y: 0.72, z: 0.34 },
  hotspotColor: { x: 1.0, y: 0.94, z: 0.78 },
  beamBars: 5,
};

export const DEFAULT_SETTINGS = DEFAULT_TORCH_SETTINGS;

export function clamp(value, min, max) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function defaultsForSourceType(sourceType = "torch") {
  return sourceType === "beam" ? DEFAULT_BEAM_SETTINGS : DEFAULT_TORCH_SETTINGS;
}

export function normalizeTorchStyle(value) {
  return ["classic", "brazier", "caged", "wild"].includes(value) ? value : "classic";
}

export function normalizeBeamStyle(value) {
  return ["clean", "barred", "grated", "cage"].includes(value) ? value : "clean";
}

export function mergeSettings(settings = {}) {
  const sourceType = settings.sourceType === "beam" ? "beam" : "torch";
  const defaults = defaultsForSourceType(sourceType);

  return {
    ...defaults,
    ...settings,
    sourceType,
    torchStyle: normalizeTorchStyle(settings.torchStyle ?? defaults.torchStyle),
    beamStyle: normalizeBeamStyle(settings.beamStyle ?? defaults.beamStyle),
    radius: clamp(settings.radius ?? defaults.radius ?? DEFAULT_TORCH_SETTINGS.radius, 40, 1400),
    sourceRadius: clamp(settings.sourceRadius ?? defaults.sourceRadius ?? DEFAULT_TORCH_SETTINGS.sourceRadius, 1, 400),
    beamLength: clamp(settings.beamLength ?? defaults.beamLength ?? DEFAULT_BEAM_SETTINGS.beamLength, 60, 1800),
    beamWidth: clamp(settings.beamWidth ?? defaults.beamWidth ?? DEFAULT_BEAM_SETTINGS.beamWidth, 20, 1800),
    intensity: clamp(settings.intensity ?? defaults.intensity, 0, 2),
    flicker: clamp01(settings.flicker ?? defaults.flicker),
    speed: clamp(settings.speed ?? defaults.speed, 0.1, 4),
    irregularity: clamp(settings.irregularity ?? defaults.irregularity, 0, 1),
    torchBars: clamp(settings.torchBars ?? defaults.torchBars ?? DEFAULT_TORCH_SETTINGS.torchBars, 2, 24),
    beamBars: clamp(settings.beamBars ?? defaults.beamBars ?? DEFAULT_BEAM_SETTINGS.beamBars, 2, 20),
    markerOpacity: clamp01(settings.markerOpacity ?? defaults.markerOpacity),
    visualGlow: settings.visualGlow ?? defaults.visualGlow,
    fogLight: settings.fogLight ?? defaults.fogLight,
    color: {
      ...defaults.color,
      ...(settings.color ?? {}),
    },
    hotspotColor: {
      ...defaults.hotspotColor,
      ...(settings.hotspotColor ?? {}),
    },
  };
}

export function makeMarkerMetadata(settings = {}) {
  const merged = mergeSettings(settings);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: merged.sourceType === "beam" ? "door-window-light" : "flickering-light",
    seed: Math.floor(Math.random() * 1000000),
    startedAt: Date.now(),
    settings: merged,
  };
}

export function getMarkerSettings(item) {
  const meta = item?.metadata?.[MARKER_KEY];
  const sourceType =
    meta?.settings?.sourceType ??
    (meta?.kind === "door-window-light" ? "beam" : "torch");
  return mergeSettings({ sourceType, ...(meta?.settings ?? {}) });
}

export function colorToHex(color = DEFAULT_SETTINGS.color) {
  const r = Math.round(clamp01(color.x) * 255).toString(16).padStart(2, "0");
  const g = Math.round(clamp01(color.y) * 255).toString(16).padStart(2, "0");
  const b = Math.round(clamp01(color.z) * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function hexToColor(hex) {
  const clean = String(hex ?? "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { ...DEFAULT_SETTINGS.color };
  return {
    x: parseInt(clean.slice(0, 2), 16) / 255,
    y: parseInt(clean.slice(2, 4), 16) / 255,
    z: parseInt(clean.slice(4, 6), 16) / 255,
  };
}
