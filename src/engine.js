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
uniform vec3 hotspotColor;
uniform float intensity;
uniform float flicker;
uniform float coreSize;
uniform float styleIndex;
uniform float irregularity;
uniform float barCount;

float stripeMask(float p, float frequency, float thickness) {
  float s = abs(sin(p * frequency));
  return 1.0 - smoothstep(0.0, thickness, s);
}

half4 main(float2 coord) {
  vec2 uv = coord / size;
  vec2 p = (uv - vec2(0.5, 0.5)) * 2.0;
  float angle = atan(p.y, p.x);
  float dBase = length(p);

  float noiseA = sin(angle * 6.0 + dBase * 7.0 + flicker * 3.1);
  float noiseB = sin(angle * 13.0 - dBase * 10.0 - flicker * 1.7);
  float noiseC = sin(angle * 3.0 + dBase * 15.0 + flicker * 0.9);
  float edgeWarp = 1.0 + irregularity * (noiseA * 0.12 + noiseB * 0.07 + noiseC * 0.05);
  float d = dBase / max(0.72, edgeWarp);

  float coreRadius = clamp(coreSize, 0.04, 0.62);
  float outer = 1.0 - smoothstep(0.56, 1.00, d);
  float mid = 1.0 - smoothstep(max(0.10, coreRadius * 0.78), 0.74, d);
  float core = 1.0 - smoothstep(0.02, coreRadius, d);
  float feather = 1.0 - smoothstep(0.90, 1.0, d);

  float alpha = (outer * 0.28 + mid * 0.20 + core * 0.24) * intensity * flicker * feather;
  vec3 finalColor = mix(color, hotspotColor, clamp(core * 0.95 + mid * 0.24, 0.0, 1.0));

  if (styleIndex > 0.5 && styleIndex < 1.5) {
    float bowl = smoothstep(0.12, 0.88, uv.y);
    float rim = smoothstep(0.46, 0.54, d) * (1.0 - smoothstep(0.62, 0.82, d));
    alpha *= mix(0.88, 1.08, bowl);
    alpha *= 1.0 - rim * 0.12;
    finalColor = mix(finalColor, hotspotColor, 0.10 + 0.08 * bowl);
  } else if (styleIndex > 1.5 && styleIndex < 2.5) {
    float bars = max(2.0, floor(barCount + 0.5));
    float spokeWave = 0.5 + 0.5 * cos(angle * bars);
    float spokeMask = smoothstep(0.945, 0.992, spokeWave);
    float ringWave = 0.5 + 0.5 * cos((d - 0.20) * 15.0);
    float ringMask = smoothstep(0.955, 0.992, ringWave) * smoothstep(0.28, 0.92, d);
    float cage = clamp(spokeMask * 0.46 + ringMask * 0.22, 0.0, 1.0);
    float cageFade = smoothstep(0.26, 0.72, d);
    alpha *= 1.0 - cage * 0.14 * cageFade;
    finalColor = mix(finalColor, color, cage * 0.08 * cageFade);
  } else if (styleIndex > 2.5) {
    float lobe = 0.88 + irregularity * 0.28 * sin(angle * 5.0 + flicker * 3.0 + dBase * 8.0);
    alpha *= lobe;
    finalColor = mix(finalColor, hotspotColor, 0.12);
  }

  alpha = clamp(alpha, 0.0, 0.90);
  return half4(finalColor * alpha, alpha);
}
`;

const BEAM_SKSL = `
uniform vec2 size;
uniform vec3 color;
uniform vec3 hotspotColor;
uniform float intensity;
uniform float flicker;
uniform float spread;
uniform float styleIndex;
uniform float irregularity;
uniform float barCount;

float stripeMask(float p, float frequency, float thickness) {
  float s = abs(sin(p * frequency));
  return 1.0 - smoothstep(0.0, thickness, s);
}

half4 main(float2 coord) {
  vec2 uv = coord / size;
  float y = uv.y;
  float x = uv.x - 0.5;
  float xAbs = abs(x) * 2.0;

  float widthFactor = clamp(spread, 0.05, 1.0);
  float startSpread = mix(0.10, 0.44, pow(widthFactor, 0.85));
  float endSpread = min(1.08, startSpread + mix(0.12, 0.62, sqrt(widthFactor)));
  float taper = mix(startSpread, endSpread, smoothstep(0.0, 1.0, y));
  float edge = 1.0 - smoothstep(taper * 0.82, taper, xAbs);
  float startFade = smoothstep(0.00, 0.02, y);
  float endFade = 1.0 - smoothstep(0.70, 1.0, y);
  float sideFeather = 1.0 - smoothstep(0.84, 1.0, xAbs);
  float textureA = 0.88 + 0.12 * sin((uv.x * 10.0) + (uv.y * 2.5));
  float textureB = 0.92 + 0.08 * sin((uv.x * 17.0) - (uv.y * 5.0));
  float breakup = 1.0 - irregularity * 0.28 * (0.5 + 0.5 * sin(uv.y * 18.0 + uv.x * 6.0));

  float alpha = edge * startFade * endFade * sideFeather * textureA * textureB * breakup * intensity * flicker;
  float projectedX = x / max(0.04, taper);
  float styleShadow = 1.0;

  float shadowFade = 0.35 + 0.65 * smoothstep(0.0, 0.08, y);
  if (styleIndex > 0.5 && styleIndex < 1.5) {
    float bars = stripeMask(projectedX, max(2.0, floor(barCount + 0.5)) * 1.55, 0.46);
    styleShadow = 1.0 - bars * 0.16 * shadowFade;
  } else if (styleIndex > 1.5 && styleIndex < 2.5) {
    float bars = stripeMask(projectedX, max(2.0, floor(barCount + 0.5)) * 1.45, 0.46);
    float grate = stripeMask(y, 8.0 + barCount * 0.8, 0.34) * smoothstep(0.00, 0.12, y);
    styleShadow = 1.0 - clamp((bars * 0.12 + grate * 0.05) * shadowFade, 0.0, 0.22);
  } else if (styleIndex > 2.5) {
    float bars = stripeMask(projectedX, max(2.0, floor(barCount + 0.5)) * 2.0, 0.48);
    styleShadow = 1.0 - bars * 0.20 * shadowFade;
  }

  alpha *= styleShadow;
  alpha = clamp(alpha * 0.62, 0.0, 0.82);
  float centerGlow = 1.0 - smoothstep(0.0, 0.38, xAbs / max(0.08, taper));
  vec3 warm = mix(color, hotspotColor, clamp(centerGlow * 0.76 + (1.0 - y) * 0.28, 0.0, 1.0));
  return half4(warm * alpha, alpha);
}
`;

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

  if (settings.sourceType === "beam") {
    const baseWidth = Math.max(20, Number(settings.beamWidth ?? 190));
    const baseHeight = Math.max(20, Number(settings.beamLength ?? 420));
    return {
      baseWidth,
      baseHeight,
      width: baseWidth,
      height: baseHeight,
      radius: Math.max(baseWidth, baseHeight) / 2,
      scaleX: 1,
      scaleY: 1,
    };
  }

  const scaleX = Math.abs(marker?.scale?.x ?? 1) || 1;
  const scaleY = Math.abs(marker?.scale?.y ?? 1) || 1;
  const fallbackWidth = settings.radius * 2;
  const fallbackHeight = settings.radius * 2;
  const baseWidth = Math.max(20, Number(marker?.width ?? fallbackWidth));
  const baseHeight = Math.max(20, Number(marker?.height ?? fallbackHeight));
  const width = baseWidth * scaleX;
  const height = baseHeight * scaleY;
  const radius = Math.max(width, height) / 2;
  return { baseWidth, baseHeight, width, height, radius, scaleX, scaleY };
}

function effectPositionFromMarker(marker, width, height) {
  const center = marker?.position ?? { x: 0, y: 0 };
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
  };
}

function rotatePoint(point, degrees) {
  const radians = Number(degrees ?? 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}


function torchStyleIndex(style = "classic") {
  if (style === "brazier") return 1;
  if (style === "caged") return 2;
  if (style === "wild") return 3;
  return 0;
}

function beamStyleIndex(style = "clean") {
  if (style === "barred") return 1;
  if (style === "grated") return 2;
  if (style === "cage") return 3;
  return 0;
}

function beamGlowPosition(marker, width, height) {
  const source = marker?.position ?? { x: 0, y: 0 };

  // The beam shader starts at local top-center: (width / 2, 0).
  // The standalone effect position is its top-left origin.
  // So: topLeft = source - rotate(width / 2, 0)
  const topCenterOffset = rotatePoint({ x: width / 2, y: 0 }, marker.rotation ?? 0);

  return {
    x: source.x - topCenterOffset.x,
    y: source.y - topCenterOffset.y,
  };
}

function torchGlowPosition(marker, width, height) {
  const center = marker?.position ?? { x: 0, y: 0 };
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
    { name: "hotspotColor", value: settings.hotspotColor },
    { name: "intensity", value: clamp(settings.intensity, 0, 2) },
    { name: "flicker", value: flicker },
    { name: "coreSize", value: clamp(settings.sourceRadius / Math.max(radius, 1), 0.04, 0.62) },
    { name: "styleIndex", value: torchStyleIndex(settings.torchStyle) },
    { name: "irregularity", value: clamp(settings.irregularity, 0, 1) },
    { name: "barCount", value: clamp(settings.torchBars, 2, 24) },
  ];
}

function makeBeamUniforms(marker, now = Date.now()) {
  const settings = getMarkerSettings(marker);
  const flicker = flickerValue(marker, now);
  const spread = clamp(settings.beamWidth / 1800, 0.05, 1.0);
  return [
    { name: "color", value: settings.color },
    { name: "hotspotColor", value: settings.hotspotColor },
    { name: "intensity", value: clamp(settings.intensity, 0, 2) },
    { name: "flicker", value: flicker },
    { name: "spread", value: spread },
    { name: "styleIndex", value: beamStyleIndex(settings.beamStyle) },
    { name: "irregularity", value: clamp(settings.irregularity, 0, 1) },
    { name: "barCount", value: clamp(settings.beamBars, 2, 20) },
  ];
}

function buildLocalGlow(marker, now = Date.now()) {
  const type = markerSourceType(marker);
  const { baseWidth, baseHeight, width, height } = markerDimensions(marker);

  if (type === "beam") {
    const effect = buildEffect()
      .name(`Door/Window Light Glow - ${marker.name ?? "Light"}`)
      .effectType("STANDALONE")
      .width(baseWidth)
      .height(baseHeight)
      .position(beamGlowPosition(marker, baseWidth, baseHeight))
      .rotation(marker.rotation ?? 0)
      .scale({ x: 1, y: 1 })
      .layer("PROP")
      .zIndex(999998)
      .sksl(BEAM_SKSL)
      .uniforms(makeBeamUniforms(marker, now))
      .blendMode("SCREEN")
      .locked(true)
      .disableHit(true)
      .build();

    effect.metadata = {
      ...(effect.metadata ?? {}),
      [LOCAL_KEY]: {
        kind: "glow",
        targetId: marker.id,
        sourceType: "beam",
        renderMode: "beam-source-standalone",
      },
    };

    return effect;
  }

  const flicker = flickerValue(marker, now);
  const wobble = 1 + (flicker - 1) * 0.06;
  const effectWidth = width * wobble;
  const effectHeight = height * wobble;

  const effect = buildEffect()
    .name(`Torchlight Glow - ${marker.name ?? "Light"}`)
    .effectType("STANDALONE")
    .width(effectWidth)
    .height(effectHeight)
    .position(torchGlowPosition(marker, effectWidth, effectHeight))
    .rotation(0)
    .scale({ x: 1, y: 1 })
    .layer("PROP")
    .zIndex(999998)
    .sksl(GLOW_SKSL)
    .uniforms(makeTorchUniforms(marker, now))
    .blendMode("SCREEN")
    .locked(true)
    .disableHit(true)
    .build();

  effect.metadata = {
    ...(effect.metadata ?? {}),
    [LOCAL_KEY]: {
      kind: "glow",
      targetId: marker.id,
      sourceType: "torch",
      renderMode: "torch-standalone",
    },
  };

  return effect;
}

function buildLocalLight(marker, now = Date.now()) {
  const settings = getMarkerSettings(marker);
  const { radius } = markerDimensions(marker);
  const flicker = flickerValue(marker, now);
  const light = buildLight()
    .name(`Torchlight Fog - ${marker.name ?? "Torch"}`)
    .position(marker.position)
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
  const { baseWidth, baseHeight, width, height, radius } = markerDimensions(marker);
  const flicker = flickerValue(marker, now);

  item.visible = marker.visible !== false;
  item.locked = true;
  item.disableHit = true;

  if (kind === "glow" && isEffect(item)) {
    if (type === "beam") {
      item.name = `Door/Window Light Glow - ${marker.name ?? "Light"}`;
      item.effectType = "STANDALONE";
      item.attachedTo = undefined;
      item.disableAttachmentBehavior = undefined;
      item.layer = "PROP";
      item.zIndex = 999998;
      item.width = baseWidth;
      item.height = baseHeight;
      item.position = beamGlowPosition(marker, baseWidth, baseHeight);
      item.rotation = marker.rotation ?? 0;
      item.scale = { x: 1, y: 1 };
      item.sksl = BEAM_SKSL;
      item.blendMode = "SCREEN";
      item.uniforms = makeBeamUniforms(marker, now);
      item.metadata = item.metadata ?? {};
      item.metadata[LOCAL_KEY] = {
        ...(item.metadata[LOCAL_KEY] ?? {}),
        kind: "glow",
        targetId: marker.id,
        sourceType: "beam",
        renderMode: "beam-source-standalone",
      };
    } else {
      const wobble = 1 + (flicker - 1) * 0.06;
      const effectWidth = width * wobble;
      const effectHeight = height * wobble;
      item.name = `Torchlight Glow - ${marker.name ?? "Light"}`;
      item.effectType = "STANDALONE";
      item.attachedTo = undefined;
      item.disableAttachmentBehavior = undefined;
      item.layer = "PROP";
      item.zIndex = 999998;
      item.width = effectWidth;
      item.height = effectHeight;
      item.position = torchGlowPosition(marker, effectWidth, effectHeight);
      item.rotation = 0;
      item.scale = { x: 1, y: 1 };
      item.sksl = GLOW_SKSL;
      item.blendMode = "SCREEN";
      item.uniforms = makeTorchUniforms(marker, now);
      item.metadata = item.metadata ?? {};
      item.metadata[LOCAL_KEY] = {
        ...(item.metadata[LOCAL_KEY] ?? {}),
        kind: "glow",
        targetId: marker.id,
        sourceType: "torch",
        renderMode: "torch-standalone",
      };
    }
  }

  if (kind === "light" && isLight(item)) {
    item.position = { ...(marker.position ?? { x: 0, y: 0 }) };
    item.name = `Torchlight Fog - ${marker.name ?? "Torch"}`;
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

    const staleGlow =
      glow &&
      (!isEffect(glow) ||
        (type === "beam" &&
          (glow.effectType !== "STANDALONE" ||
            glow.attachedTo ||
            glow.metadata?.[LOCAL_KEY]?.renderMode !== "beam-source-standalone")) ||
        (type === "torch" &&
          (glow.effectType !== "STANDALONE" ||
            glow.attachedTo ||
            glow.metadata?.[LOCAL_KEY]?.renderMode !== "torch-standalone")));

    if (settings.visualGlow) {
      if (staleGlow) {
        await safeDeleteItems([glow.id]);
        await safeAddItem(buildLocalGlow(marker, now));
      } else {
        await upsertLocal(glow, buildLocalGlow, marker, now);
      }
    } else {
      await safeDeleteItems([glow?.id]);
    }
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
    .name("Torchlight")
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
    .name("Window / Beam Light Source")
    .shapeType("CIRCLE")
    .width(40)
    .height(40)
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

      if (settings.sourceType === "beam") {
        item.shapeType = "CIRCLE";
        item.width = 40;
        item.height = 40;
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
