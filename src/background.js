import OBR from "@owlbear-rodeo/sdk";
import { clearLocalLights, syncLocalLights } from "./engine.js";

let timer = null;
let running = false;
let pending = false;

async function tick() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  try {
    await syncLocalLights();
  } catch (error) {
    console.warn("Flickering Light: sync failed", error);
  } finally {
    running = false;
    if (pending) {
      pending = false;
      void tick();
    }
  }
}

function startLoop() {
  stopLoop();
  void tick();
  timer = window.setInterval(() => void tick(), 85);
}

function stopLoop() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

OBR.onReady(async () => {
  if (await OBR.scene.isReady()) startLoop();
  else await clearLocalLights();

  OBR.scene.onReadyChange(async (ready) => {
    if (ready) startLoop();
    else {
      stopLoop();
      await clearLocalLights();
    }
  });

  OBR.scene.items.onChange(() => {
    void tick();
  });
});
