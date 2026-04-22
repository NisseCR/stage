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

  const currentState = await stateResponse.json();
  const library = await libraryResponse.json();

  console.log("Current state:", currentState);
  console.log("Library:", library);

  const sceneList = document.getElementById("scene-list");
  const musicList = document.getElementById("music-list");

  if (sceneList) {
    sceneList.innerHTML = "";
    library.scenes.forEach((scene) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = scene.name;
      button.addEventListener("click", () => {
        setScene(scene.id);
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
      button.addEventListener("click", () => {
        setMusic(playlist.id);
      });
      musicList.appendChild(button);
    });
  }
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
}

document.addEventListener("DOMContentLoaded", initGmPage);