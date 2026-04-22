/**
 * Initialize the display page behavior.
 *
 * This page is a read-only listener that receives live updates from the backend
 * via SSE and will eventually render the active scene and audio state.
 */
function initDisplayPage() {
  const eventSource = new EventSource("/events");

  const displayScene = document.getElementById("display-scene");
  const displayMusic = document.getElementById("display-music");
  const displayState = document.getElementById("display-state");

  let currentState = {
    current_scene: null,
    current_music_playlist: null,
    active_ambiences: {},
    fade_settings: {},
  };

  /**
   * Render the current application state into the display UI.
   *
   * Args:
   *   state: The latest known application state.
   */
  function renderState(state) {
    if (displayScene) {
      displayScene.textContent = state.current_scene?.scene_id ?? "None";
    }

    if (displayMusic) {
      displayMusic.textContent = state.current_music_playlist?.playlist_id ?? "None";
    }

    if (displayState) {
      displayState.textContent = JSON.stringify(state, null, 2);
    }
  }

  /**
   * Merge a partial state update into the current state and re-render.
   *
   * Args:
   *   patch: The partial update received from SSE.
   */
  function applyStatePatch(patch) {
    currentState = {
      ...currentState,
      ...patch,
    };
    renderState(currentState);
  }

  eventSource.addEventListener("state_snapshot", (event) => {
    const data = JSON.parse(event.data);
    console.log("Initial state snapshot received:", data);
    currentState = data;
    renderState(currentState);
  });

  eventSource.addEventListener("scene_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Scene changed:", data);
    applyStatePatch({
      current_scene: data.scene,
    });
  });

  eventSource.addEventListener("music_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Music changed:", data);
    applyStatePatch({
      current_music_playlist: data.music_playlist,
    });
  });

  eventSource.addEventListener("ambience_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Ambience changed:", data);
    applyStatePatch({
      active_ambiences: data.active_ambiences,
    });
  });

  eventSource.addEventListener("fade_settings_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Fade settings changed:", data);
    applyStatePatch({
      fade_settings: data.fade_settings,
    });
  });

  eventSource.addEventListener("volume_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Volume changed:", data);

    applyStatePatch({
      current_music_playlist: data.music_playlist ?? currentState.current_music_playlist,
      active_ambiences: data.active_ambiences ?? currentState.active_ambiences,
    });
  });

  eventSource.onerror = () => {
    console.warn("Display SSE connection lost. Browser will retry automatically.");
  };

  console.log("Display page loaded");
}

document.addEventListener("DOMContentLoaded", initDisplayPage);