/**
 * Initialize the GM page behavior.
 *
 * The GM page edits a local draft state and syncs the full desired application
 * state to the backend on demand.
 */
async function initGmPage() {
  const [stateResponse, libraryResponse] = await Promise.all([
    fetch("/api/state"),
    fetch("/api/library"),
  ]);

  const currentState = await stateResponse.json();
  const library = await libraryResponse.json();

  const ui = createUiBindings();
  const draftState = createDraftState(currentState);

  renderAll(ui, library, draftState);

  bindSceneSelection(ui.sceneList, draftState, library, renderAll.bind(null, ui, library, draftState));
  bindMusicSelection(ui.musicList, draftState, library, renderAll.bind(null, ui, library, draftState));
  bindAmbienceControls(ui.ambienceList, draftState, library, renderAll.bind(null, ui, library, draftState));
  bindFadeControls(ui, draftState);
  bindSyncButton(ui.syncButton, draftState);

  renderAll(ui, library, draftState);
}

/**
 * Create DOM bindings for the GM page.
 *
 * Returns:
 *   A dictionary of relevant DOM elements.
 */
function createUiBindings() {
  return {
    currentScene: document.getElementById("current-scene"),
    currentMusic: document.getElementById("current-music"),
    sceneList: document.getElementById("scene-list"),
    musicList: document.getElementById("music-list"),
    ambienceList: document.getElementById("ambience-list"),
    fadeMusic: document.getElementById("fade-music"),
    fadeAmbience: document.getElementById("fade-ambience"),
    fadeScene: document.getElementById("fade-scene"),
    syncButton: document.getElementById("sync-state"),
  };
}

/**
 * Create a mutable draft copy of the application state.
 *
 * Args:
 *   state: The canonical state returned by the backend.
 *
 * Returns:
 *   A locally editable draft state.
 */
function createDraftState(state) {
  return {
    scene: state.scene ?? null,
    music: state.music ?? null,
    ambiences: state.ambiences ?? {},
    fade_settings: state.fade_settings ?? {
      music: 5.0,
      ambience: 10.0,
      scene: 5.0,
    },
  };
}

/**
 * Render all GM controls from the current draft state.
 *
 * Args:
 *   ui: DOM element bindings.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 */
function renderAll(ui, library, draftState) {
  renderCurrentState(ui, draftState);
  renderSceneList(ui.sceneList, library, draftState);
  renderMusicList(ui.musicList, library, draftState);
  renderAmbienceList(ui.ambienceList, library, draftState);
  renderFadeControls(ui, draftState);
}

/**
 * Render the current scene and music labels.
 *
 * Args:
 *   ui: DOM element bindings.
 *   draftState: The editable local state.
 */
function renderCurrentState(ui, draftState) {
  if (ui.currentScene) {
    ui.currentScene.textContent = draftState.scene?.scene_id ?? "None";
  }

  if (ui.currentMusic) {
    ui.currentMusic.textContent = draftState.music?.playlist_id ?? "None";
  }
}

/**
 * Render the scene selection list.
 *
 * Args:
 *   container: The scene list container.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 */
function renderSceneList(container, library, draftState) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  library.scenes.forEach((scene) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = scene.name;
    button.classList.toggle("active", draftState.scene?.scene_id === scene.id);

    button.addEventListener("click", () => {
      draftState.scene = {
        scene_id: scene.id,
        transition: draftState.scene?.transition ?? null,
        opacity: draftState.scene?.opacity ?? 1.0,
      };
      renderSceneList(container, library, draftState);
      renderCurrentState(createUiBindings(), draftState);
    });

    container.appendChild(button);
  });
}

/**
 * Render the music selection list.
 *
 * Args:
 *   container: The music list container.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 */
function renderMusicList(container, library, draftState) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  library.music_playlists.forEach((playlist) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = playlist.name;
    button.classList.toggle("active", draftState.music?.playlist_id === playlist.id);

    button.addEventListener("click", () => {
      draftState.music = {
        playlist_id: playlist.id,
      };
      renderMusicList(container, library, draftState);
      renderCurrentState(createUiBindings(), draftState);
    });

    container.appendChild(button);
  });
}

/**
 * Render ambience toggles and per-item controls.
 *
 * Args:
 *   container: The ambience list container.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 */
function renderAmbienceList(container, library, draftState) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  library.ambience_folders.forEach((folder) => {
    folder.tracks.forEach((track) => {
      const ambienceId = track.name;
      const activeAmbience = draftState.ambiences[ambienceId] ?? null;
      const isActive = Boolean(activeAmbience);

      const wrapper = document.createElement("div");
      wrapper.className = "ambience-control";

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.textContent = isActive ? `Remove ${track.name}` : `Add ${track.name}`;
      toggleButton.classList.toggle("active", isActive);

      toggleButton.addEventListener("click", () => {
        if (draftState.ambiences[ambienceId]) {
          delete draftState.ambiences[ambienceId];
        } else {
          draftState.ambiences[ambienceId] = {
            ambience_id: ambienceId,
            volume: 1.0,
          };
        }

        renderAmbienceList(container, library, draftState);
      });

      wrapper.appendChild(toggleButton);

      container.appendChild(wrapper);
    });
  });
}

/**
 * Render fade duration inputs.
 *
 * Args:
 *   ui: DOM element bindings.
 *   draftState: The editable local state.
 */
function renderFadeControls(ui, draftState) {
  if (ui.fadeMusic) {
    ui.fadeMusic.value = draftState.fade_settings?.music ?? 5.0;
  }

  if (ui.fadeAmbience) {
    ui.fadeAmbience.value = draftState.fade_settings?.ambience ?? 10.0;
  }

  if (ui.fadeScene) {
    ui.fadeScene.value = draftState.fade_settings?.scene ?? 5.0;
  }
}

/**
 * Bind fade input handlers so they update the draft state.
 *
 * Args:
 *   ui: DOM element bindings.
 *   draftState: The editable local state.
 */
function bindFadeControls(ui, draftState) {
  if (ui.fadeMusic) {
    ui.fadeMusic.addEventListener("change", () => {
      draftState.fade_settings.music = Number(ui.fadeMusic.value);
    });
  }

  if (ui.fadeAmbience) {
    ui.fadeAmbience.addEventListener("change", () => {
      draftState.fade_settings.ambience = Number(ui.fadeAmbience.value);
    });
  }

  if (ui.fadeScene) {
    ui.fadeScene.addEventListener("change", () => {
      draftState.fade_settings.scene = Number(ui.fadeScene.value);
    });
  }
}

/**
 * Bind the sync button to submit the full draft state.
 *
 * Args:
 *   button: The sync button element.
 *   draftState: The editable local state.
 */
function bindSyncButton(button, draftState) {
  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    const updatedState = await syncState(draftState);
    Object.assign(draftState, updatedState);
    window.location.reload();
  });
}

/**
 * Bind scene selection handlers.
 *
 * Args:
 *   container: The scene container.
 *   draftState: The editable local state.
 *   library: The discovered media library.
 *   rerender: Callback to refresh the UI.
 */
function bindSceneSelection(container, draftState, library, rerender) {
  if (!container) {
    return;
  }

  container.addEventListener("click", () => {
    rerender();
  });

  window.addEventListener("click", () => {
    rerender();
  });
}

/**
 * Bind music selection handlers.
 *
 * Args:
 *   container: The music container.
 *   draftState: The editable local state.
 *   library: The discovered media library.
 *   rerender: Callback to refresh the UI.
 */
function bindMusicSelection(container, draftState, library, rerender) {
  if (!container) {
    return;
  }

  container.addEventListener("click", () => {
    rerender();
  });

  window.addEventListener("click", () => {
    rerender();
  });
}

/**
 * Bind ambience handlers.
 *
 * Args:
 *   container: The ambience container.
 *   draftState: The editable local state.
 *   library: The discovered media library.
 *   rerender: Callback to refresh the UI.
 */
function bindAmbienceControls(container, draftState, library, rerender) {
  if (!container) {
    return;
  }

  container.addEventListener("click", () => {
    rerender();
  });
}

/**
 * Send the full draft state to the backend.
 *
 * Args:
 *   draftState: The editable local state.
 *
 * Returns:
 *   The canonical backend state.
 */
async function syncState(draftState) {
  const response = await fetch("/api/state/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draftState),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }

  return response.json();
}

document.addEventListener("DOMContentLoaded", initGmPage);