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

  const fadeMusic = document.getElementById("fade-music");
  const fadeAmbience = document.getElementById("fade-ambience");
  const fadeScene = document.getElementById("fade-scene");
  const saveFadeSettingsButton = document.getElementById("save-fade-settings");

  const volumeMusic = document.getElementById("volume-music");
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

    setActiveButtonState(sceneList, state.current_scene?.scene_id ?? null);
    setActiveButtonState(musicList, state.current_music_playlist?.playlist_id ?? null);
    renderAmbienceControls(state.active_ambiences ?? {});
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
   * Render ambience toggles and per-item volume controls.
   *
   * Args:
   *   activeAmbiences: The ambience map from application state.
   */
  function renderAmbienceControls(activeAmbiences) {
    if (!ambienceList) {
      return;
    }

    ambienceList.innerHTML = "";

    library.ambience_folders.forEach((folder) => {
      folder.tracks.forEach((track) => {
        const ambienceId = track.name;
        const activeAmbience = activeAmbiences[ambienceId] ?? null;
        const isActive = Boolean(activeAmbience);

        const wrapper = document.createElement("div");
        wrapper.className = "ambience-control";

        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.textContent = isActive ? `Remove ${track.name}` : `Add ${track.name}`;
        toggleButton.dataset.value = ambienceId;
        toggleButton.classList.toggle("active", isActive);

        toggleButton.addEventListener("click", async () => {
          const nextAmbiences = {
            ...(currentState.active_ambiences ?? {}),
          };

          if (nextAmbiences[ambienceId]) {
            delete nextAmbiences[ambienceId];
          } else {
            nextAmbiences[ambienceId] = {
              ambience_id: ambienceId,
              volume: 1.0,
            };
          }

          const updatedState = await setAmbiences(nextAmbiences);
          applyStatePatch(updatedState);
        });

        wrapper.appendChild(toggleButton);

        if (isActive) {
          const volumeLabel = document.createElement("label");
          volumeLabel.textContent = `${track.name} volume`;
          volumeLabel.htmlFor = `ambience-volume-${ambienceId}`;

          const volumeInput = document.createElement("input");
          volumeInput.type = "range";
          volumeInput.id = `ambience-volume-${ambienceId}`;
          volumeInput.min = "0";
          volumeInput.max = "1";
          volumeInput.step = "0.01";
          volumeInput.value = activeAmbience.volume ?? 1.0;

          volumeInput.addEventListener("input", () => {
            currentState = {
              ...currentState,
              active_ambiences: {
                ...(currentState.active_ambiences ?? {}),
                [ambienceId]: {
                  ...(currentState.active_ambiences?.[ambienceId] ?? {}),
                  ambience_id: ambienceId,
                  volume: Number(volumeInput.value),
                },
              },
            };
          });

          wrapper.appendChild(volumeLabel);
          wrapper.appendChild(volumeInput);
        }

        ambienceList.appendChild(wrapper);
      });
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
   *   activeAmbiences: The ambience id -> active ambience object mapping.
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

  if (saveVolumesButton && volumeMusic) {
    saveVolumesButton.addEventListener("click", async () => {
      const ambienceVolumes = {};

      Object.entries(currentState.active_ambiences ?? {}).forEach(([ambienceId, ambience]) => {
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