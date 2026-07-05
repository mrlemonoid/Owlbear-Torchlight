import OBR from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  DEFAULT_SETTINGS,
  MARKER_KEY,
  colorToHex,
  hexToColor,
  mergeSettings,
} from "./constants.js";
import {
  applySettingsToSelected,
  createDoorWindowLight,
  createFlickeringLight,
  deleteSelectedFlickerMarkers,
  getSelectedFlickerMarkers,
  getSelectedFlickerMarkerIds,
  syncLocalLights,
} from "./engine.js";

const app = document.querySelector("#app");
let connected = false;
let settings = mergeSettings(DEFAULT_SETTINGS);
let selectedCount = 0;
let applyTimer = null;
let selectionTimer = null;

function pct(value) {
  return Math.round(Number(value) * 100);
}

function range(id, label, value, min, max, step, suffix = "") {
  return `
    <label class="field" for="${id}">
      <span class="field__top"><span>${label}</span><strong id="${id}Value">${value}${suffix}</strong></span>
      <input id="${id}" class="native-range" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${id}" />
    </label>
  `;
}

function checkbox(id, label, checked) {
  return `
    <label class="check-field" for="${id}">
      <span>${label}</span>
      <input id="${id}" type="checkbox" ${checked ? "checked" : ""} data-setting="${id}" />
    </label>
  `;
}

function render() {
  app.innerHTML = `
    <section class="panel">
      <header class="hero">
        <div>
          <p class="eyebrow">Owlbear Rodeo</p>
          <h1>Flickering Light</h1>
        </div>
        <div class="status ${connected ? "on" : "off"}">${connected ? "LIVE" : "OFF"}</div>
      </header>

      <section class="card flame-card">
        <div class="flame-preview" style="--flame: ${colorToHex(settings.color)}; --pulse: ${settings.intensity};">
          <div class="flame-preview__glow"></div>
          <svg viewBox="0 0 64 64" class="flame-preview__icon" aria-hidden="true">
            <path d="M32 8c5.5 7.1 2.4 11.2 8.5 17.2 3.9 3.8 6.4 8.2 6.4 14.4C46.9 51.2 39.8 58 32 58s-14.9-6.8-14.9-18.4c0-6.2 2.5-10.6 6.4-14.4C29.6 19.2 26.5 15.1 32 8Z"></path>
            <path d="M32 30.5c3.5 4.3 6.1 7.8 6.1 12.7 0 5-2.8 8.2-6.1 8.2s-6.1-3.2-6.1-8.2c0-4.9 2.6-8.4 6.1-12.7Z"></path>
          </svg>
        </div>
        <p class="muted center">Place this over torches, fires, lamps, or magic light sources. Move and resize the circle on the scene.</p>
      </section>

      <section class="card">
        <h2>Light Source</h2>
        <div class="actions-main three-actions">
          <button id="addLight" class="primary" type="button">Add Flickering Light</button>
          <button id="addBeam" class="primary secondary-primary" type="button">Add Door / Window Light</button>
          <button id="deleteLight" type="button">Delete Selected</button>
        </div>
        <p class="muted" id="selectionInfo">${selectedCount ? `${selectedCount} flickering light selected.` : "No flickering light selected. Sliders set the next light you add."}</p>
      </section>

      <section class="card compact">
        <h2 class="section-title">Settings</h2>
        ${settings.sourceType === "beam" ? `
          ${range("beamLength", "Beam Length", Math.round(settings.beamLength), 60, 1800, 10, " px")}
          ${range("beamWidth", "Beam Width", Math.round(settings.beamWidth), 20, 900, 10, " px")}
        ` : `
          ${range("radius", "Radius", Math.round(settings.radius), 40, 1400, 10, " px")}
          ${range("sourceRadius", "Hot Core", Math.round(settings.sourceRadius), 1, 400, 1, " px")}
        `}
        ${range("intensity", "Intensity", pct(settings.intensity), 0, 200, 1, "%")}
        ${range("flicker", "Flicker Amount", pct(settings.flicker), 0, 100, 1, "%")}
        ${range("speed", "Flicker Speed", Math.round(settings.speed * 100), 10, 400, 5, "%")}
        ${range("markerOpacity", "Marker Visibility", pct(settings.markerOpacity), 0, 100, 1, "%")}
        <label class="field" for="color">
          <span class="field__top"><span>Light Color</span><strong>${colorToHex(settings.color).toUpperCase()}</strong></span>
          <input id="color" class="color-input" type="color" value="${colorToHex(settings.color)}" />
        </label>
        ${checkbox("visualGlow", settings.sourceType === "beam" ? "Visible beam glow" : "Visual glow on the map", settings.visualGlow)}
        ${settings.sourceType === "beam" ? `<p class="muted small-note">Beam light is a visual overlay. For Smoke & Spectre, apply Create Torchlight to the small “S&S Torch Anchor” circle at the beam center, not the large rectangle.</p>` : `
          ${checkbox("fogLight", "Native Owlbear fog light / fog cut", settings.fogLight)}
          <p class="muted small-note">Native Owlbear fog cut is circular and can pass through Smoke & Spectre obstruction lines. Keep it off when S&S wall-aware light is needed.</p>
        `}
      </section>
    </section>
  `;
  wireEvents();
}

function toPatch(key, rawValue, inputType = "range") {
  if (key === "radius") return { radius: Number(rawValue) };
  if (key === "sourceRadius") return { sourceRadius: Number(rawValue) };
  if (key === "beamLength") return { beamLength: Number(rawValue) };
  if (key === "beamWidth") return { beamWidth: Number(rawValue) };
  if (key === "intensity") return { intensity: Number(rawValue) / 100 };
  if (key === "flicker") return { flicker: Number(rawValue) / 100 };
  if (key === "speed") return { speed: Number(rawValue) / 100 };
  if (key === "markerOpacity") return { markerOpacity: Number(rawValue) / 100 };
  if (key === "visualGlow") return { visualGlow: Boolean(rawValue) };
  if (key === "fogLight") return { fogLight: Boolean(rawValue) };
  if (key === "color") return { color: hexToColor(rawValue) };
  return {};
}

function scheduleApply(patch, immediate = false) {
  settings = mergeSettings({ ...settings, ...patch });
  window.clearTimeout(applyTimer);
  const run = async () => {
    if (connected) {
      const count = await applySettingsToSelected(patch);
      if (count > 0) selectedCount = count;
      await syncLocalLights();
    }
  };
  if (immediate) void run();
  else applyTimer = window.setTimeout(run, 40);
}

function updateValueDisplay(id) {
  const valueEl = document.querySelector(`#${id}Value`);
  if (!valueEl) return;
  if (id === "radius") valueEl.textContent = `${Math.round(settings.radius)} px`;
  if (id === "sourceRadius") valueEl.textContent = `${Math.round(settings.sourceRadius)} px`;
  if (id === "beamLength") valueEl.textContent = `${Math.round(settings.beamLength)} px`;
  if (id === "beamWidth") valueEl.textContent = `${Math.round(settings.beamWidth)} px`;
  if (id === "intensity") valueEl.textContent = `${pct(settings.intensity)}%`;
  if (id === "flicker") valueEl.textContent = `${pct(settings.flicker)}%`;
  if (id === "speed") valueEl.textContent = `${Math.round(settings.speed * 100)}%`;
  if (id === "markerOpacity") valueEl.textContent = `${pct(settings.markerOpacity)}%`;
}

async function refreshSelection() {
  if (!connected) return;
  const active = document.activeElement;
  const isEditing = active?.matches?.("input");
  const markers = await getSelectedFlickerMarkers();
  selectedCount = markers.length;
  if (markers[0]) {
    settings = mergeSettings(markers[0].metadata?.[MARKER_KEY]?.settings ?? settings);
  }
  if (!isEditing) render();
  else {
    const info = document.querySelector("#selectionInfo");
    if (info) info.textContent = selectedCount ? `${selectedCount} flickering light selected.` : "No flickering light selected. Sliders set the next light you add.";
  }
}

function scheduleSelectionRefresh() {
  window.clearTimeout(selectionTimer);
  selectionTimer = window.setTimeout(() => void refreshSelection(), 60);
}

function wireEvents() {
  document.querySelector("#addLight")?.addEventListener("click", async () => {
    if (!connected) return;
    const marker = await createFlickeringLight(settings);
    selectedCount = 1;
    await OBR.notification.show("Flickering light added.");
    await refreshSelection();
  });

  document.querySelector("#addBeam")?.addEventListener("click", async () => {
    if (!connected) return;
    const marker = await createDoorWindowLight(settings);
    selectedCount = 1;
    await OBR.notification.show("Door / window light added.");
    await refreshSelection();
  });

  document.querySelector("#deleteLight")?.addEventListener("click", async () => {
    if (!connected) return;
    const count = await deleteSelectedFlickerMarkers();
    selectedCount = 0;
    await OBR.notification.show(count ? "Selected flickering light deleted." : "Select a flickering light first.", count ? "SUCCESS" : "WARNING");
    await refreshSelection();
  });

  document.querySelectorAll(".native-range[data-setting]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.currentTarget.dataset.setting;
      const patch = toPatch(key, event.currentTarget.value);
      settings = mergeSettings({ ...settings, ...patch });
      updateValueDisplay(key);
      scheduleApply(patch, false);
    });
    input.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.setting;
      scheduleApply(toPatch(key, event.currentTarget.value), true);
    });
  });

  document.querySelectorAll(".check-field input[data-setting]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const key = event.currentTarget.dataset.setting;
      const patch = toPatch(key, event.currentTarget.checked, "checkbox");
      scheduleApply(patch, true);
      render();
    });
  });

  document.querySelector("#color")?.addEventListener("input", (event) => {
    const patch = toPatch("color", event.currentTarget.value);
    settings = mergeSettings({ ...settings, ...patch });
    const label = event.currentTarget.closest(".field")?.querySelector("strong");
    if (label) label.textContent = colorToHex(settings.color).toUpperCase();
    scheduleApply(patch, false);
  });
}

async function init() {
  render();
  if (!OBR.isAvailable) return;

  OBR.onReady(async () => {
    connected = true;
    await refreshSelection();
    await syncLocalLights();

    OBR.player.onChange(() => {
      scheduleSelectionRefresh();
    });

    OBR.scene.onReadyChange(async (ready) => {
      if (ready) {
        connected = true;
        await refreshSelection();
        await syncLocalLights();
      }
    });

    OBR.scene.items.onChange(() => {
      void syncLocalLights();
      scheduleSelectionRefresh();
    });
  });
}

init();
