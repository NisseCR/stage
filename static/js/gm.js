/**
 * Initialize the GM page behavior.
 *
 * This page will act as the control surface for scenes, music, ambience, and
 * other live state changes that are broadcast to the display page.
 */
async function initGmPage() {
  console.log("GM page loaded");

  const [stateResponse, libraryResponse] = await Promise.all([
    fetch("/api/state"),
    fetch("/api/library"),
  ]);

  let currentState = await stateResponse.json();
  const library = await libraryResponse.json();

  console.log("Current state:", currentState);
  console.log("Library:", library);

  const sceneList = document.getElementById("scene-list");
  const musicList = document.getElementById("music-list");
  const currentScene = document.getElementById("current-scene");
  const currentMusic = document.getElementById("current-music");

  /**
   * Render the current state into the GM control UI.
   *
   * Args:
   *   state: The latest known application state.
   */
  function renderState(state) {
    if (currentScene) {
      currentScene.textContent = state.current_scene_id ?? "None";
    }

    if (currentMusic) {
      currentMusic.textContent = state.current_music_playlist ?? "None";
    }

    setActiveButtonState(sceneList, state.current_scene_id);
    setActiveButtonState(musicList, state.current_music_playlist);
  }

  /**
   * Merge a partial state update into the current state and re-render.
   *
   * Args:
   *   patch: The partial update returned by the backend.
   */
  function applyStatePatch(patch) {
    currentState = {
      ...currentState,
      ...patch,
    };
    renderState(currentState);
  }

  if (sceneList) {
    sceneList.innerHTML = "";
    library.scenes.forEach((scene) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = scene.name;
      button.dataset.value = scene.id;
      button.addEventListener("click", async () => {
        const updatedState = await setScene(scene.id);
        applyStatePatch(updatedState);
      });
      sceneList.appendChild(button);
    });
  }

  if (musicList) {
    musicList.innerHTML = "";
    library.music_playlists.forEach((playlist) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = playlist.name;
      button.dataset.value = playlist.id;
      button.addEventListener("click", async () => {
        const updatedState = await setMusic(playlist.id);
        applyStatePatch(updatedState);
      });
      musicList.appendChild(button);
    });
  }

  renderState(currentState);
}

/**
 * Toggle active button styling within a container.
 *
 * Args:
 *   container: The element containing selectable buttons.
 *   activeValue: The currently active value.
 */
function setActiveButtonState(container, activeValue) {
  if (!container) {
    return;
  }

  container.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.value === activeValue);
  });
}

/**
 * Send a JSON payload to the backend and return the parsed response.
 *
 * Args:
 *   url: The endpoint URL to post to.
 *   payload: The request body to send as JSON.
 *
 * Returns:
 *   The parsed JSON response body.
 */
async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Update the currently selected scene in the backend.
 *
 * Args:
 *   sceneId: The selected scene identifier.
 */
async function setScene(sceneId) {
  const updatedState = await postJson("/api/state/scene", {
    scene_id: sceneId,
  });
  console.log("Scene updated:", updatedState);
  return updatedState;
}

/**
 * Update the currently selected music playlist in the backend.
 *
 * Args:
 *   musicPlaylistId: The selected music playlist identifier.
 */
async function setMusic(musicPlaylistId) {
  const updatedState = await postJson("/api/state/music", {
    music_playlist: musicPlaylistId,
  });
  console.log("Music updated:", updatedState);
  return updatedState;
}

document.addEventListener("DOMContentLoaded", initGmPage);