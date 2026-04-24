/**
 * Initialize the display page behavior.
 *
 * This file is only responsible for bootstrapping the scene engine, wiring SSE,
 * and updating the debug display.
 */
async function initDisplayPage() {
  const eventSource = new EventSource("/events");

  const [libraryResponse] = await Promise.all([
    fetch("/api/library"),
  ]);

  const library = await libraryResponse.json();

  const displayScene = document.getElementById("display-scene");
  const displayMusic = document.getElementById("display-music");
  const displayState = document.getElementById("display-state");

  const sceneBackground = document.getElementById("scene-background");
  const sceneLayers = document.getElementById("scene-layers");
  const sceneFadeOverlay = document.getElementById("scene-fade-overlay");

  const sceneMap = new Map(
    library.scenes.map((scene) => [scene.id, scene])
  );

  const sceneEngine = new SceneEngine({
    sceneBackground,
    sceneLayers,
    sceneFadeOverlay,
    sceneMap,
  });

  /**
   * Render the current shared state into the debug panel.
   *
   * Args:
   *   state: The latest state from the backend.
   */
  function renderDebugState(state) {
    if (displayScene) {
      displayScene.textContent = state.scene?.scene_id ?? "None";
    }

    if (displayMusic) {
      displayMusic.textContent = state.music?.playlist_id ?? "None";
    }

    if (displayState) {
      displayState.textContent = JSON.stringify(state, null, 2);
    }
  }

  /**
   * Apply a new canonical state to the display page.
   *
   * Args:
   *   state: The latest state from the backend.
   */
  async function applyState(state) {
    renderDebugState(state);
    sceneEngine.updateFadeSettings(state.fade_settings);
    await sceneEngine.reconcile(state.scene?.scene_id ?? null);
  }

  eventSource.addEventListener("state_snapshot", async (event) => {
    const data = JSON.parse(event.data);
    await applyState(data);
  });

  eventSource.addEventListener("state_updated", async (event) => {
    const data = JSON.parse(event.data);
    await applyState(data);
  });

  eventSource.onerror = () => {
    console.warn("Display SSE connection lost. Browser will retry automatically.");
  };

  console.log("Display page loaded");
}

document.addEventListener("DOMContentLoaded", initDisplayPage);