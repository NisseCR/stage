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
  const ambienceList = document.getElementById("ambience-list");

  const currentScene = document.getElementById("current-scene");
  const currentMusic = document.getElementById("current-music");
  const currentMusicVolume = document.getElementById("current-music-volume");
  const currentAmbienceVolume = document.getElementById("current-ambience-volume");
  const currentSceneVolume = document.getElementById("current-scene-volume");

  const fadeMusic = document.getElementById("fade-music");
  const fadeAmbience = document.getElementById("fade-ambience");
  const fadeScene = document.getElementById("fade-scene");
  const saveFadeSettingsButton = document.getElementById("save-fade-settings");

  const volumeMusic = document.getElementById("volume-music");
  const volumeAmbience = document.getElementById("volume-ambience");
  const volumeScene = document.getElementById("volume-scene");
  const saveVolumesButton = document.getElementById("save-volumes");

  /**
   * Render the current state into the GM control UI.
   *
   * Args:
   *   state: The latest known application state.
   */
  function renderState(state) {
    if (currentScene) {
      currentScene.textContent = state.current_scene?.scene_id ?? "None";
    }

    if (currentMusic) {
      currentMusic.textContent = state.current_music_playlist?.playlist_id ?? "None";
    }

    if (currentMusicVolume) {
      currentMusicVolume.textContent = String(state.current_music_playlist?.volume ?? 1.0);
    }

    if (currentAmbienceVolume) {
      const ambiences = Object.values(state.active_ambiences ?? {});
      const averageVolume =
        ambiences.length > 0
          ? ambiences.reduce((sum, ambience) => sum + (ambience.volume ?? 1.0), 0) / ambiences.length
          : 1.0;
      currentAmbienceVolume.textContent = String(averageVolume);
    }

    if (currentSceneVolume) {
      currentSceneVolume.textContent = String(state.current_scene?.opacity ?? 1.0);
    }

    if (fadeMusic) {
      fadeMusic.value = state.fade_settings?.music ?? 5.0;
    }

    if (fadeAmbience) {
      fadeAmbience.value = state.fade_settings?.ambience ?? 10.0;
    }

    if (fadeScene) {
      fadeScene.value = state.fade_settings?.scene ?? 5.0;
    }

    if (volumeMusic) {
      volumeMusic.value = state.current_music_playlist?.volume ?? 1.0;
    }

    if (volumeAmbience) {
      const ambiences = Object.values(state.active_ambiences ?? {});
      const averageVolume =
        ambiences.length > 0
          ? ambiences.reduce((sum, ambience) => sum + (ambience.volume ?? 1.0), 0) / ambiences.length
          : 1.0;
      volumeAmbience.value = averageVolume;
    }

    if (volumeScene) {
      volumeScene.value = state.current_scene?.opacity ?? 1.0;
    }

    setActiveButtonState(sceneList, state.current_scene?.scene_id ?? null);
    setActiveButtonState(musicList, state.current_music_playlist?.playlist_id ?? null);
    setAmbienceToggleState(state.active_ambiences ?? {});
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
   * Toggle active styling for ambience buttons.
   *
   * Args:
   *   activeAmbiences: The ambience map from application state.
   */
  function setAmbienceToggleState(activeAmbiences) {
    if (!ambienceList) {
      return;
    }

    ambienceList.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", Boolean(activeAmbiences[button.dataset.value]));
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

  /**
   * Update the active ambience map in the backend.
   *
   * Args:
   *   activeAmbiences: The ambience id -> volume mapping.
   */
  async function setAmbiences(activeAmbiences) {
    const updatedState = await postJson("/api/state/ambience", {
      active_ambiences: activeAmbiences,
    });
    console.log("Ambiences updated:", updatedState);
    return updatedState;
  }

  /**
   * Update fade durations in the backend.
   *
   * Args:
   *   fadeSettings: The fade settings payload.
   */
  async function setFadeSettings(fadeSettings) {
    const updatedState = await postJson("/api/state/fade", {
      fade_settings: fadeSettings,
    });
    console.log("Fade settings updated:", updatedState);
    return updatedState;
  }

  /**
   * Update audio-related runtime values in the backend.
   *
   * Args:
   *   volumes: The volume payload for the current music and active ambiences.
   */
  async function setVolumes(volumes) {
    const updatedState = await postJson("/api/state/volume", volumes);
    console.log("Volumes updated:", updatedState);
    return updatedState;
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

  if (ambienceList) {
    ambienceList.innerHTML = "";

    library.ambience_folders.forEach((folder) => {
      folder.tracks.forEach((track) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = track.name;
        button.dataset.value = track.name;

        button.addEventListener("click", async () => {
          const nextAmbiences = {
            ...(currentState.active_ambiences ?? {}),
          };

          if (nextAmbiences[track.name]) {
            delete nextAmbiences[track.name];
          } else {
            nextAmbiences[track.name] = {
              ambience_id: track.name,
              volume: 1.0,
            };
          }

          const updatedState = await setAmbiences(nextAmbiences);
          applyStatePatch(updatedState);
        });

        ambienceList.appendChild(button);
      });
    });
  }

  if (saveFadeSettingsButton && fadeMusic && fadeAmbience && fadeScene) {
    saveFadeSettingsButton.addEventListener("click", async () => {
      const updatedState = await setFadeSettings({
        music: Number(fadeMusic.value),
        ambience: Number(fadeAmbience.value),
        scene: Number(fadeScene.value),
      });
      applyStatePatch(updatedState);
    });
  }

  if (saveVolumesButton && volumeMusic && volumeAmbience && volumeScene) {
    saveVolumesButton.addEventListener("click", async () => {
      const activeAmbiences = currentState.active_ambiences ?? {};
      const ambienceVolumes = {};

      Object.entries(activeAmbiences).forEach(([ambienceId, ambience]) => {
        ambienceVolumes[ambienceId] = ambience.volume ?? 1.0;
      });

      const updatedState = await setVolumes({
        music_volume: Number(volumeMusic.value),
        ambience_volumes: ambienceVolumes,
      });
      applyStatePatch(updatedState);
    });
  }

  renderState(currentState);
}

document.addEventListener("DOMContentLoaded", initGmPage);