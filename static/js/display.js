/**
 * Initialize the display page behavior.
 *
 * This file is only responsible for bootstrapping the scene engine, audio engine,
 * wiring SSE, and updating the debug display.
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

  const musicPlaylistMap = new Map(
    library.music_playlists.map((playlist) => [playlist.id, playlist])
  );

  const ambienceTrackMap = new Map();
  library.ambience_folders.forEach((folder) => {
    folder.tracks.forEach((track) => {
      ambienceTrackMap.set(track.name, track.url);
    });
  });

  const sceneEngine = new SceneEngine({
    sceneBackground,
    sceneLayers,
    sceneFadeOverlay,
    sceneMap,
  });

  const audioEngine = new AudioEngine({
    musicPlaylistMap,
    ambienceTrackMap,
  });

  const displayPage = document.querySelector(".display-page");
  const joinOverlay = document.getElementById("join-overlay");
  const joinButton = document.getElementById("join-button");
  const debugPanel = document.querySelector(".display-debug");

  let isJoined = false;
  let lastState = null;

  // Add blur on load
  displayPage.classList.add("is-blurred");

  joinButton.addEventListener("click", async () => {
    isJoined = true;
    displayPage.classList.remove("is-blurred");
    joinOverlay.classList.add("is-hidden");

    // Initialize audio context within user gesture
    await audioEngine.init();

    // Reconcile with last received state if any
    if (lastState) {
      await audioEngine.reconcile(lastState);
    }
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
    lastState = state;
    renderDebugState(state);

    if (debugPanel) {
      debugPanel.classList.toggle("is-hidden", !state.show_debug);
    }

    sceneEngine.updateFadeSettings(state.fade_settings);

    const scenePromise = sceneEngine.reconcile(state.scene?.scene_id ?? null);
    
    let audioPromise = Promise.resolve();
    if (isJoined) {
      audioPromise = audioEngine.reconcile(state);
    }

    await Promise.all([scenePromise, audioPromise]);
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