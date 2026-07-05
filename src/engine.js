import OBR, { buildEffect, buildLight, buildShape, isEffect, isLight, isShape } from "@owlbear-rodeo/sdk";
import {
  DEFAULT_BEAM_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_TORCH_SETTINGS,
  LOCAL_KEY,
  MARKER_KEY,
  getMarkerSettings,
  makeMarkerMetadata,
  mergeSettings,
  colorToHex,
  clamp,
} from "./constants.js";

const GLOW_SKSL = `
uniform vec2 size;
uniform vec3 color;
uniform float intensity;
uniform float flicker;
uniform float warmth;
uniform float coreSize;

half4 main(float2 coord) {
  vec2 uv = coord / size;
  vec2 p = (uv - vec2(0.5, 0.5)) * 2.0;
  float d = length(p);

  float coreRadius = clamp(coreSize, 0.04, 0.62);
  float outer = 1.0 - smoothstep(0.62, 1.0, d);
  float mid = 1.0 - smoothstep(max(0.12, coreRadius * 0.75), 0.72, d);
  float core = 1.0 - smoothstep(0.02, coreRadius, d);
  float feather = 1.0 - smoothstep(0.92, 1.0, d);

  float alpha = (outer * 0.24 + mid * 0.18 + core * 0.22) * intensity * flicker * feather;
  alpha = clamp(alpha, 0.0, 0.86);

  vec3 hotCore = vec3(1.0, 0.88, 0.48);
  vec3 finalColor = mix(color, hotCore, core * warmth);

  return half4(finalColor * alpha, alpha);
}
`;

const BEAM_SKSL = `
uniform vec2 size;
uniform vec3 color;
uniform float intensity;
uniform float flicker;
uniform float spread;

half4 main(float2 coord) {
  vec2 uv = coord / size;

  float y = uv.y;
  float x = abs(uv.x - 0.5) * 2.0;

  float halfWidth = mix(0.12, clamp(spread, 0.28, 1.0), y);
  float edge = 1.0 - smoothstep(halfWidth * 0.72, halfWidth, x);

  float startFade = smoothstep(0.00, 0.08, y);
  float endFade = 1.0 - smoothstep(0.66, 1.0, y);
  float sideFeather = 1.0 - smoothstep(0.82, 1.0, x);

  float stripeA = 0.84 + 0.16 * sin((uv.x * 9.0) + (uv.y * 2.0));
  float stripeB = 0.90 + 0.10 * sin((uv.x * 17.0) - (uv.y * 4.5));
  float texture = stripeA * stripeB;

  float core = 1.0 - smoothstep(0.0, 0.34, x);
  float alpha = edge * startFade * endFade * sideFeather * texture * intensity * flicker;
  alpha = clamp(alpha * 0.52, 0.0, 0.72);

  vec3 warm = mix(color, vec3(1.0, 0.88, 0.52), core * 0.28);
  return half4(warm * alpha, alpha);
}
`;

const markerBoundsCache = new Map();

function markerCenter(marker) {
  return markerBoundsCache.get(marker.id)?.center ?? marker?.position ?? { x: 0, y: 0 };
}

export function isFlickerMarker(item) {
  const kind = item?.metadata?.[MARKER_KEY]?.kind;
  return Boolean(isShape(item) && (kind === "flickering-light" || kind === "door-window-light"));
}

function markerSourceType(marker) {
  return getMarkerSettings(marker).sourceType === "beam" ? "beam" : "torch";
}

function isOurLocal(item) {
  return Boolean(item?.metadata?.[LOCAL_KEY]);
}

function localKind(item) {
  return item?.metadata?.[LOCAL_KEY]?.kind;
}

function targetId(item) {
  return item?.metadata?.[LOCAL_KEY]?.targetId;
}

function markerDimensions(marker) {
  const settings = getMarkerSettings(marker);
  const scaleX = Math.abs(marker?.scale?.x ?? 1) || 1;
  const scaleY = Math.abs(marker?.scale?.y ?? 1) || 1;
  const fallbackWidth = settings.sourceType === "beam" ? settings.beamWidth : settings.radius * 2;
  const fallbackHeight = settings.sourceType === "beam" ? settings.beamLength : settings.radius * 2;
  const width = Math.max(20, Number(marker?.width ?? fallbackWidth) * scaleX);
  const height = Math.max(20, Number(marker?.height ?? fallbackHeight) * scaleY);
  const radius = Math.max(width, height) / 2;
  return { width, height, radius };
}

function effectPositionFromMarker(marker, width, height) {
  const center = markerCenter(marker);
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
  };
}

function flickerValue(marker, now = Date.now()) {
  const meta = marker?.metadata?.[MARKER_KEY] ?? {};
  const settings = getMarkerSettings(marker);
  const seed = Number(meta.seed ?? 1);
  const startedAt = Number(meta.startedAt ?? now);
  const t = ((now - startedAt) / 1000) * settings.speed;

  const slow = Math.sin(t * 1.55 + seed * 0.011) * 0.34;
  const breath = Math.sin(t * 2.70 + seed * 0.019) * 0.24;
  const ember = Math.sin(t * 5.90 + seed * 0.031) * 0.15;
  const micro = Math.sin(t * 9.40 + seed * 0.047) * 0.07;
  const drift = Math.sin(t * 0.43 + seed * 0.007) * 0.20;
  const noise = slow + breath + ember + micro + drift;

  return clamp(1 + noise * settings.flicker * 0.38, 0.80, 1.22);
}

function localKey(targetId, kind) {
  return `${targetId}:${kind}`;
}

function mapLocalItems(localItems) {
  const map = new Map();
  for (const item of localItems) {
    const id = targetId(item);
    const kind = localKind(item);
    if (id && kind && !map.has(localKey(id, kind))) map.set(localKey(id, kind), item);
  }
  return map;
}

function makeTorchUniforms(marker, now = Date.now()) {
  const settings = getMarkerSettings(marker);
  const { radius } = markerDimensions(marker);
  const flicker = flickerValue(marker, now);
  return [
    { name: "color", value: settings.color },
    { name: "intensity", value: clamp(settings.intensity, 0, 2) },
    { name: "flicker", value: flicker },
    { name: "warmth", value: 0.62 },
    { name: "coreSize", value: clamp(settings.sourceRadius / Math.max(radius, 1), 0.04, 0.62) },
  ];
}

function makeBeamUniforms(marker, now = Date.now()) {
  const settings = getMarkerSettings(marker);
  const { width } = markerDimensions(marker);
  const flicker = flickerValue(marker, now);
  return [
    { name: "color", value: settings.color },
    { name: "intensity", value: clamp(settings.intensity, 0, 2) },
    { name: "flicker", value: flicker },
    { name: "spread", value: clamp(width / Math.max(settings.beamWidth, 1) * 0.68, 0.28, 1.0) },
  ];
}

function buildLocalGlow(marker, now = Date.now()) {
  const type = markerSourceType(marker);
  const { width, height } = markerDimensions(marker);
  const flicker = flickerValue(marker, now);
  const wobble = type === "torch" ? (1 + (flicker - 1) * 0.06) : 1;
  const effectWidth = width * wobble;
  const effectHeight = height * wobble;

  const effect = buildEffect()
    .name(`${type === "beam" ? "Door/Window Light" : "Flickering Light"} Glow - ${marker.name ?? "Light"}`)
    .effectType("STANDALONE")
    .width(effectWidth)
    .height(effectHeight)
    .position(effectPositionFromMarker(marker, effectWidth, effectHeight))
    .rotation(marker.rotation ?? 0)
    .layer("PROP")
    .zIndex(999998)
    .sksl(type === "beam" ? BEAM_SKSL : GLOW_SKSL)
    .uniforms(type === "beam" ? makeBeamUniforms(marker, now) : makeTorchUniforms(marker, now))
    .blendMode("SCREEN")
    .locked(true)
    .disableHit(true)
    .build();

  effect.metadata = {
    ...(effect.metadata ?? {}),
    [LOCAL_KEY]: {
      kind: "glow",
      targetId: marker.id,
    },
  };

  return effect;
}

function buildLocalLight(marker, now = Date.now()) {
  const settings = getMarkerSettings(marker);
  const { radius } = markerDimensions(marker);
  const flicker = flickerValue(marker, now);
  const light = buildLight()
    .name(`Flickering Light Fog - ${marker.name ?? "Torch"}`)
    .position(markerCenter(marker))
    .rotation(marker.rotation ?? 0)
    .sourceRadius(Math.max(1, settings.sourceRadius * flicker))
    .attenuationRadius(Math.max(20, radius * flicker))
    .falloff(clamp(0.98 - settings.intensity * 0.22, 0.38, 1.05))
    .lightType("PRIMARY")
    .layer("FOG")
    .zIndex(999999)
    .locked(true)
    .disableHit(true)
    .build();

  light.metadata = {
    ...(light.metadata ?? {}),
    [LOCAL_KEY]: {
      kind: "light",
      targetId: marker.id,
    },
  };

  return light;
}

function updateLocalDraft(item, marker, now = Date.now()) {
  const settings = getMarkerSettings(marker);
  const type = markerSourceType(marker);
  const kind = localKind(item);
  const { width, height, radius } = markerDimensions(marker);
  const flicker = flickerValue(marker, now);

  item.visible = marker.visible !== false;
  item.position = { ...markerCenter(marker) };
  item.rotation = marker.rotation ?? 0;
  item.locked = true;
  item.disableHit = true;
  item.zIndex = 999999;

  if (kind === "glow" && isEffect(item)) {
    const wobble = type === "torch" ? (1 + (flicker - 1) * 0.06) : 1;
    item.name = `${type === "beam" ? "Door/Window Light" : "Flickering Light"} Glow - ${marker.name ?? "Light"}`;
    item.layer = "PROP";
    item.effectType = "STANDALONE";
    item.zIndex = 999998;
    item.width = width * wobble;
    item.height = height * wobble;
    item.position = effectPositionFromMarker(marker, item.width, item.height);
    item.rotation = marker.rotation ?? 0;
    item.sksl = type === "beam" ? BEAM_SKSL : GLOW_SKSL;
    item.blendMode = "SCREEN";
    item.uniforms = type === "beam" ? makeBeamUniforms(marker, now) : makeTorchUniforms(marker, now);
  }

  if (kind === "light" && isLight(item)) {
    item.position = { ...markerCenter(marker) };
    item.name = `Flickering Light Fog - ${marker.name ?? "Torch"}`;
    item.layer = "FOG";
    item.lightType = "PRIMARY";
    item.sourceRadius = Math.max(1, settings.sourceRadius * flicker);
    item.attenuationRadius = Math.max(20, radius * flicker);
    item.falloff = clamp(0.98 - settings.intensity * 0.22, 0.38, 1.05);
    item.innerAngle = 360;
    item.outerAngle = 360;
  }
}

export async function clearLocalLights() {
  const localItems = await OBR.scene.local.getItems(isOurLocal);
  if (localItems.length) {
    await OBR.scene.local.deleteItems(localItems.map((item) => item.id));
  }
}

async function safeDeleteItems(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (!unique.length) return;
  try {
    await OBR.scene.local.deleteItems(unique);
  } catch (error) {
    console.warn("Flickering Light: local delete failed", error);
  }
}

async function safeAddItem(item) {
  try {
    await OBR.scene.local.addItems([item]);
  } catch (error) {
    console.warn(`Flickering Light: could not add local ${localKind(item) ?? item.type}`, error);
  }
}

async function safeUpdateItem(existingItem, marker, now) {
  try {
    await OBR.scene.local.updateItems([existingItem.id], (items) => {
      if (items[0]) updateLocalDraft(items[0], marker, now);
    }, true);
  } catch (error) {
    console.warn(`Flickering Light: could not update local ${localKind(existingItem) ?? existingItem.type}`, error);
  }
}

async function upsertLocal(existingItem, buildItem, marker, now) {
  if (existingItem) await safeUpdateItem(existingItem, marker, now);
  else await safeAddItem(buildItem(marker, now));
}

export async function syncLocalLights() {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    await clearLocalLights();
    return;
  }

  const now = Date.now();
  const [markers, localItems] = await Promise.all([
    OBR.scene.items.getItems(isFlickerMarker),
    OBR.scene.local.getItems(isOurLocal),
  ]);

  const activeMarkers = markers.filter((marker) => marker.visible !== false);

  markerBoundsCache.clear();
  for (const marker of activeMarkers) {
    try {
      markerBoundsCache.set(marker.id, await OBR.scene.items.getItemBounds([marker.id]));
    } catch (error) {
      console.warn("Flickering Light: could not read marker bounds", error);
    }
  }

  const markerIds = new Set(activeMarkers.map((marker) => marker.id));
  const existing = mapLocalItems(localItems);
  const obsoleteIds = [];

  const seenLocalKeys = new Set();
  for (const item of localItems) {
    const id = targetId(item);
    const kind = localKind(item);
    const validKind = kind === "glow" || kind === "light";
    const key = id && kind ? localKey(id, kind) : "";

    if (!id || !validKind || !markerIds.has(id)) {
      obsoleteIds.push(item.id);
      continue;
    }

    if (seenLocalKeys.has(key)) {
      obsoleteIds.push(item.id);
      continue;
    }

    seenLocalKeys.add(key);
  }
  await safeDeleteItems(obsoleteIds);

  for (const marker of activeMarkers) {
    const settings = getMarkerSettings(marker);
    const type = markerSourceType(marker);
    const glow = existing.get(localKey(marker.id, "glow"));
    const light = existing.get(localKey(marker.id, "light"));

    if (type === "torch" && settings.fogLight) await upsertLocal(light, buildLocalLight, marker, now);
    else await safeDeleteItems([light?.id]);

    if (settings.visualGlow) await upsertLocal(glow, buildLocalGlow, marker, now);
    else await safeDeleteItems([glow?.id]);
  }
}

export function markerStyle(settings = DEFAULT_SETTINGS) {
  const type = settings.sourceType === "beam" ? "beam" : "torch";
  return {
    fillColor: colorToHex(settings.color),
    fillOpacity: Math.max(0.006, settings.markerOpacity * (type === "beam" ? 0.12 : 0.16)),
    strokeColor: colorToHex(settings.color),
    strokeOpacity: settings.markerOpacity,
    strokeWidth: type === "beam" ? 4 : 6,
    strokeDash: type === "beam" ? [10, 8] : [12, 10],
  };
}

async function centerOfViewport() {
  const viewportWidth = await OBR.viewport.getWidth();
  const viewportHeight = await OBR.viewport.getHeight();
  return OBR.viewport.inverseTransformPoint({ x: viewportWidth / 2, y: viewportHeight / 2 });
}

export async function createFlickeringLight(settings = {}) {
  const merged = mergeSettings({ ...DEFAULT_TORCH_SETTINGS, ...settings, sourceType: "torch" });
  const width = merged.radius * 2;
  const height = merged.radius * 2;
  const position = await centerOfViewport();
  const metadata = {
    [MARKER_KEY]: makeMarkerMetadata(merged),
  };

  const marker = buildShape()
    .name("Flickering Light")
    .shapeType("CIRCLE")
    .width(width)
    .height(height)
    .position(position)
    .layer("PROP")
    .zIndex(999999)
    .style(markerStyle(merged))
    .metadata(metadata)
    .build();

  await OBR.scene.items.addItems([marker]);
  await OBR.player.select([marker.id], true);
  await syncLocalLights();
  return marker;
}

export async function createDoorWindowLight(settings = {}) {
  const merged = mergeSettings({ ...DEFAULT_BEAM_SETTINGS, color: settings.color ?? DEFAULT_BEAM_SETTINGS.color, sourceType: "beam" });
  const position = await centerOfViewport();
  const metadata = {
    [MARKER_KEY]: makeMarkerMetadata(merged),
  };

  const marker = buildShape()
    .name("Door / Window Light")
    .shapeType("RECTANGLE")
    .width(merged.beamWidth)
    .height(merged.beamLength)
    .position(position)
    .layer("PROP")
    .zIndex(999999)
    .style(markerStyle(merged))
    .metadata(metadata)
    .build();

  await OBR.scene.items.addItems([marker]);
  await OBR.player.select([marker.id], true);
  await syncLocalLights();
  return marker;
}

export async function getSelectedFlickerMarkers() {
  const selection = await OBR.player.getSelection();
  if (!selection?.length) return [];
  return OBR.scene.items.getItems((item) => selection.includes(item.id) && isFlickerMarker(item));
}

export async function applySettingsToSelected(settingsPatch = {}) {
  const markers = await getSelectedFlickerMarkers();
  if (!markers.length) return 0;
  const ids = markers.map((item) => item.id);
  await OBR.scene.items.updateItems(ids, (items) => {
    for (const item of items) {
      const current = item.metadata?.[MARKER_KEY] ?? makeMarkerMetadata();
      const currentSettings = getMarkerSettings(item);
      const settings = mergeSettings({ ...currentSettings, ...settingsPatch });
      item.metadata = item.metadata ?? {};
      item.metadata[MARKER_KEY] = {
        ...current,
        kind: settings.sourceType === "beam" ? "door-window-light" : "flickering-light",
        settings,
        schemaVersion: 2,
      };

      if (settings.sourceType === "torch" && settingsPatch.radius !== undefined) {
        item.width = settings.radius * 2;
        item.height = settings.radius * 2;
        item.scale = { x: 1, y: 1 };
      }

      if (settings.sourceType === "beam" && (settingsPatch.beamLength !== undefined || settingsPatch.beamWidth !== undefined)) {
        item.width = settings.beamWidth;
        item.height = settings.beamLength;
        item.scale = { x: 1, y: 1 };
      }

      item.style = markerStyle(settings);
    }
  });
  await syncLocalLights();
  return ids.length;
}

export async function getSelectedFlickerMarkerIds() {
  const markers = await getSelectedFlickerMarkers();
  return markers.map((item) => item.id);
}

export async function deleteSelectedFlickerMarkers() {
  const markers = await getSelectedFlickerMarkers();
  if (!markers.length) return 0;
  await OBR.scene.items.deleteItems(markers.map((item) => item.id));
  await syncLocalLights();
  return markers.length;
}
