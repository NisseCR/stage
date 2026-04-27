/**
 * Convert a kebab-case filename to a more readable display name.
 * (e.g., "dystopic-wind.ogg" -> "Dystopic wind")
 */
function formatDisplayName(filename) {
  if (!filename) return "";
  
  // Remove extension
  const name = filename.replace(/\.[^/.]+$/, "");
  
  // Replace hyphens with spaces
  const spaced = name.replace(/-/g, " ");
  
  // Capitalize first letter
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Shuffle an array in-place using Fisher-Yates.
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

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

  const canonicalState = await stateResponse.json();
  const library = await libraryResponse.json();

  const ui = createUiBindings();
  const draftState = createDraftState(canonicalState);

  // Provide initial library to state so we can find names for IDs
  draftState.library = library;

  bindUiEvents(ui, library, draftState);
  bindSyncButton(ui.syncButton, ui, library, draftState);
  bindGlobalShortcuts(ui);
  renderAll(ui, library, draftState);
}

/**
 * Bind global keyboard shortcuts.
 */
function bindGlobalShortcuts(ui) {
  window.addEventListener("keydown", (event) => {
    // Ctrl+S
    if (event.ctrlKey && event.key === "s") {
      event.preventDefault();
      if (ui.syncButton && !ui.syncButton.disabled) {
        ui.syncButton.click();
      }
    }
  });
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
    currentAmbiences: document.getElementById("current-ambiences"),
    currentArt: document.getElementById("current-art"),
    sceneList: document.getElementById("scene-list"),
    musicList: document.getElementById("music-list"),
    ambienceList: document.getElementById("ambience-list"),
    artList: document.getElementById("art-list"),
    hideArtButton: document.getElementById("hide-art-button"),
    fadeMusic: document.getElementById("fade-music"),
    fadeAmbience: document.getElementById("fade-ambience"),
    fadeScene: document.getElementById("fade-scene"),
    volumeMusic: document.getElementById("volume-music"),
    volumeAmbience: document.getElementById("volume-ambience"),
    showDebug: document.getElementById("show-debug"),
    syncButton: document.getElementById("sync-state"),
    tabButtons: document.querySelectorAll(".tab-button"),
    tabPanels: document.querySelectorAll(".gm-tab-panel"),
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
    ambiences: structuredClone(state.ambiences ?? {}),
    art: structuredClone(state.art ?? { visible: false, art_id: null }),
    show_debug: state.show_debug ?? true,
    fade_settings: {
      music: state.fade_settings?.music ?? 5.0,
      ambience: state.fade_settings?.ambience ?? 10.0,
      scene: state.fade_settings?.scene ?? 5.0,
    },
    volume_settings: {
      music: state.volume_settings?.music ?? 1.0,
      ambience: state.volume_settings?.ambience ?? 1.0,
    },
  };
}

/**
 * Build the sync payload expected by the backend.
 *
 * Args:
 *   draftState: The editable local state.
 *
 * Returns:
 *   A plain JSON-serializable payload.
 */
function createSyncPayload(draftState) {
  return {
    scene: draftState.scene,
    music: draftState.music,
    ambiences: draftState.ambiences,
    art: draftState.art,
    show_debug: draftState.show_debug,
    fade_settings: draftState.fade_settings,
    volume_settings: draftState.volume_settings,
  };
}

/**
 * Bind all UI handlers for the GM page.
 *
 * Args:
 *   ui: DOM element bindings.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 */
function bindUiEvents(ui, library, draftState) {
  bindFadeControls(ui, draftState);
  bindVolumeControls(ui, draftState);
  bindTabs(ui, draftState, library);
}

/**
 * Bind tab button clicks to switch between panels.
 */
function bindTabs(ui, draftState, library) {
  ui.tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.tab;

      ui.tabButtons.forEach(btn => btn.classList.toggle("active", btn === button));
      ui.tabPanels.forEach(panel => {
        const isTarget = panel.id === `tab-${targetTab}`;
        panel.classList.toggle("active", isTarget);
      });
    });
  });

  // Hide Art button
  if (ui.hideArtButton) {
    ui.hideArtButton.addEventListener("click", () => {
      draftState.art = { visible: false, art_id: null };
      renderAll(ui, library, draftState);
    });
  }
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
  renderArtControls(ui, draftState);
  renderSceneList(ui.sceneList, library, draftState, ui);
  renderMusicList(ui.musicList, library, draftState, ui);
  renderAmbienceList(ui.ambienceList, library, draftState, ui);
  renderArtLibrary(ui.artList, library.art_library, draftState, ui, library);
  renderFadeControls(ui, draftState);
  renderVolumeControls(ui, draftState);
}

/**
 * Render Art tab controls.
 */
function renderArtControls(ui, draftState) {
  if (ui.hideArtButton) {
    const hasActiveArt = Boolean(draftState.art?.visible && draftState.art?.art_id);
    ui.hideArtButton.disabled = !hasActiveArt;
  }
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

  if (ui.currentAmbiences) {
    const activeAmbiences = Object.keys(draftState.ambiences || {});

    ui.currentAmbiences.textContent = activeAmbiences.length > 0
      ? activeAmbiences.map(formatDisplayName).join(", ")
      : "None";
  }

  if (ui.currentArt) {
    if (draftState.art?.visible && draftState.art?.art_id) {
      const artItem = draftState.library?.art_library?.find(a => a.id === draftState.art.art_id);
      ui.currentArt.textContent = artItem ? artItem.name : draftState.art.art_id;
    } else {
      ui.currentArt.textContent = "None";
    }
  }

  if (ui.showDebug) {
    ui.showDebug.checked = draftState.show_debug;
  }
}

/**
 * Render the scene selection list.
 *
 * Args:
 *   container: The scene list container.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 *   ui: DOM element bindings.
 */
function renderSceneList(container, library, draftState, ui) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  library.scenes.forEach((scene) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gm-tile-button";
    button.classList.toggle("active", draftState.scene?.scene_id === scene.id);

    const img = document.createElement("img");
    img.src = scene.background;
    img.className = "tile-art";
    img.loading = "lazy";
    button.appendChild(img);

    const overlay = document.createElement("div");
    overlay.className = "tile-overlay";
    
    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = scene.name;
    
    overlay.appendChild(label);
    button.appendChild(overlay);

    button.addEventListener("click", () => {
      draftState.scene = {
        scene_id: scene.id,
        transition: draftState.scene?.transition ?? null,
        opacity: draftState.scene?.opacity ?? 1.0,
      };
      renderAll(ui, library, draftState);
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
 *   ui: DOM element bindings.
 */
function renderMusicList(container, library, draftState, ui) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  library.music_playlists.forEach((playlist) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gm-tile-button";
    button.classList.toggle("active", draftState.music?.playlist_id === playlist.id);

    if (playlist.cover_url) {
      const img = document.createElement("img");
      img.src = playlist.cover_url;
      img.className = "tile-art";
      img.loading = "lazy";
      button.appendChild(img);
    }

    const overlay = document.createElement("div");
    overlay.className = "tile-overlay";
    
    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = playlist.name;
    
    overlay.appendChild(label);
    button.appendChild(overlay);

    button.addEventListener("click", () => {
      const trackUrls = playlist.tracks.map((t) => t.url);
      const shuffledOrder = shuffleArray([...trackUrls]);

      draftState.music = {
        playlist_id: playlist.id,
        track_order: shuffledOrder,
      };
      renderAll(ui, library, draftState);
    });

    container.appendChild(button);
  });
}

/**
 * Render ambience toggles grouped by folder.
 *
 * Args:
 *   container: The ambience list container.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 *   ui: DOM element bindings.
 */
function renderAmbienceList(container, library, draftState, ui) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  library.ambience_folders.forEach((folder) => {
    const folderSection = document.createElement("div");
    folderSection.className = "ambience-folder-section";

    const folderTitle = document.createElement("h3");
    folderTitle.textContent = folder.name;
    folderTitle.className = "ambience-folder-title";
    folderSection.appendChild(folderTitle);

    const tracksGrid = document.createElement("div");
    tracksGrid.className = "gm-control-group is-buttons";
    folderSection.appendChild(tracksGrid);

    folder.tracks.forEach((track) => {
      const ambienceId = track.name;
      const isActive = Boolean(draftState.ambiences[ambienceId]);

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.textContent = formatDisplayName(track.name);
      toggleButton.classList.toggle("active", isActive);

      toggleButton.addEventListener("click", () => {
        if (draftState.ambiences[ambienceId]) {
          delete draftState.ambiences[ambienceId];
        } else {
          draftState.ambiences[ambienceId] = {
            ambience_id: ambienceId,
          };
        }

        renderAll(ui, library, draftState);
      });

      tracksGrid.appendChild(toggleButton);
    });

    container.appendChild(folderSection);
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
    ui.fadeMusic.value = draftState.fade_settings.music;
  }

  if (ui.fadeAmbience) {
    ui.fadeAmbience.value = draftState.fade_settings.ambience;
  }

  if (ui.fadeScene) {
    ui.fadeScene.value = draftState.fade_settings.scene;
  }

  if (ui.showDebug) {
    ui.showDebug.checked = draftState.show_debug;
  }
}

/**
 * Render volume slider controls.
 *
 * Args:
 *   ui: DOM element bindings.
 *   draftState: The editable local state.
 */
function renderVolumeControls(ui, draftState) {
  if (ui.volumeMusic) {
    ui.volumeMusic.value = draftState.volume_settings.music;
  }

  if (ui.volumeAmbience) {
    ui.volumeAmbience.value = draftState.volume_settings.ambience;
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

  if (ui.showDebug) {
    ui.showDebug.addEventListener("change", () => {
      draftState.show_debug = ui.showDebug.checked;
    });
  }
}

/**
 * Bind volume slider handlers so they update the draft state.
 *
 * Args:
 *   ui: DOM element bindings.
 *   draftState: The editable local state.
 */
function bindVolumeControls(ui, draftState) {
  if (ui.volumeMusic) {
    ui.volumeMusic.addEventListener("input", () => {
      draftState.volume_settings.music = Number(ui.volumeMusic.value);
    });
  }

  if (ui.volumeAmbience) {
    ui.volumeAmbience.addEventListener("input", () => {
      draftState.volume_settings.ambience = Number(ui.volumeAmbience.value);
    });
  }
}

/**
 * Bind the sync button to submit the full draft state.
 *
 * Args:
 *   button: The sync button element.
 *   ui: DOM element bindings.
 *   library: The discovered media library.
 *   draftState: The editable local state.
 */
function bindSyncButton(button, ui, library, draftState) {
  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Syncing...";

    try {
      const updatedState = await syncState(createSyncPayload(draftState));

      draftState.scene = updatedState.scene ?? null;
      draftState.music = updatedState.music ?? null;
      draftState.ambiences = structuredClone(updatedState.ambiences ?? {});
      draftState.art = structuredClone(updatedState.art ?? { visible: false, art_id: null });
      draftState.show_debug = updatedState.show_debug ?? true;
      draftState.fade_settings = {
        music: updatedState.fade_settings?.music ?? 5.0,
        ambience: updatedState.fade_settings?.ambience ?? 10.0,
        scene: updatedState.fade_settings?.scene ?? 5.0,
      };
      draftState.volume_settings = {
        music: updatedState.volume_settings?.music ?? 1.0,
        ambience: updatedState.volume_settings?.ambience ?? 1.0,
      };

      renderAll(ui, library, draftState);
      button.textContent = "Synced!";
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1500);
    } catch (error) {
      console.error("Sync failed:", error);
      button.textContent = "Error";
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    }
  });
}

/**
 * Send the full draft state to the backend.
 *
 * Args:
 *   payload: The editable local state payload.
 *
 * Returns:
 *   The canonical backend state.
 */
async function syncState(payload) {
  const response = await fetch("/api/state/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Render the art library grouped by category.
 */
function renderArtLibrary(container, artLibrary, draftState, ui, library) {
  if (!container) return;
  container.innerHTML = "";

  if (!artLibrary || artLibrary.length === 0) {
    container.innerHTML = "<p class='gm-empty-state'>No art handouts found.</p>";
    return;
  }

  // Group by category
  const categories = {};
  artLibrary.forEach(art => {
    if (!categories[art.category]) {
      categories[art.category] = [];
    }
    categories[art.category].push(art);
  });

  // Render each category
  Object.keys(categories).sort().forEach(catName => {
    const section = document.createElement("section");
    section.className = "gm-section";
    
    const h2 = document.createElement("h2");
    h2.textContent = catName;
    section.appendChild(h2);
    
    const grid = document.createElement("div");
    grid.className = "gm-art-grid";

    categories[catName].forEach(art => {
      const isActive = Boolean(draftState.art?.visible && draftState.art?.art_id === art.id);
      
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gm-tile-button gm-art-tile";
      if (isActive) {
        button.classList.add("active");
      }

      button.addEventListener("click", () => {
        if (isActive) {
          draftState.art = { visible: false, art_id: null };
        } else {
          draftState.art = { visible: true, art_id: art.id };
        }
        renderAll(ui, library, draftState);
      });

      const img = document.createElement("img");
      img.src = art.src;
      img.alt = art.name;
      img.className = "tile-art";
      img.loading = "lazy";
      button.appendChild(img);

      const overlay = document.createElement("div");
      overlay.className = "tile-overlay";
      button.appendChild(overlay);

      grid.appendChild(button);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });
}

document.addEventListener("DOMContentLoaded", initGmPage);