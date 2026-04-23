/**
 * Initialize the display page.
 *
 * This page receives full state snapshots from the backend and uses them as the
 * source of truth for both visuals and audio reconciliation.
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
  const audioUnlockOverlay = document.getElementById("audio-unlock-overlay");

  const sceneMap = buildSceneMap(library);
  const musicPlaylistMap = buildMusicPlaylistMap(library);
  const ambienceTrackMap = buildAmbienceTrackMap(library);

  const audioEngine = new window.AudioEngine();

  let audioReady = false;
  let isSyncingAudio = false;
  let pendingAudioState = null;

  let currentState = createEmptyState();
  let currentSceneId = null;
  let isTransitioning = false;

  /**
   * Create an empty display state.
   *
   * Returns:
   *   A minimal state object.
   */
  function createEmptyState() {
    return {
      current_scene: null,
      current_music_playlist: null,
      active_ambiences: {},
      fade_settings: {},
      revision: -1,
    };
  }

  /**
   * Build a map of scene id to scene definition.
   *
   * Args:
   *   library: The loaded media library.
   *
   * Returns:
   *   A map of scene id to scene data.
   */
  function buildSceneMap(libraryData) {
    return new Map((libraryData.scenes ?? []).map((scene) => [scene.id, scene]));
  }

  /**
   * Build a map of playlist id to playlist definition.
   *
   * Args:
   *   library: The loaded media library.
   *
   * Returns:
   *   A map of playlist id to playlist data.
   */
  function buildMusicPlaylistMap(libraryData) {
    return new Map((libraryData.music_playlists ?? []).map((playlist) => [playlist.id, playlist]));
  }

  /**
   * Build a map of ambience id to track url.
   *
   * Args:
   *   library: The loaded media library.
   *
   * Returns:
   *   A map of ambience identifier to track url.
   */
  function buildAmbienceTrackMap(libraryData) {
    const trackMap = new Map();

    (libraryData.ambience_folders ?? []).forEach((folder) => {
      (folder.tracks ?? []).forEach((track) => {
        trackMap.set(track.name, track.url);
      });
    });

    return trackMap;
  }

  /**
   * Render the current application state into the display UI.
   *
   * Args:
   *   state: The latest state snapshot.
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
   * Get the fade duration in milliseconds for scene transitions.
   *
   * Returns:
   *   The scene fade duration.
   */
  function getSceneFadeDurationMs() {
    const fadeSeconds = Number(currentState.fade_settings?.scene ?? 5.0);
    return Math.max(0, fadeSeconds * 1000);
  }

  /**
   * Fade the scene to black.
   *
   * Returns:
   *   A promise that resolves when the fade completes.
   */
  function fadeToBlack() {
    return new Promise((resolve) => {
      if (!sceneFadeOverlay) {
        resolve();
        return;
      }

      const durationMs = getSceneFadeDurationMs();
      sceneFadeOverlay.style.transitionDuration = `${durationMs}ms`;
      sceneFadeOverlay.classList.add("is-visible");
      window.setTimeout(resolve, durationMs);
    });
  }

  /**
   * Fade the scene back in from black.
   *
   * Returns:
   *   A promise that resolves when the fade completes.
   */
  function fadeInFromBlack() {
    return new Promise((resolve) => {
      if (!sceneFadeOverlay) {
        resolve();
        return;
      }

      const durationMs = getSceneFadeDurationMs();
      sceneFadeOverlay.style.transitionDuration = `${durationMs}ms`;
      sceneFadeOverlay.classList.remove("is-visible");
      window.setTimeout(resolve, durationMs);
    });
  }

  /**
   * Clear the rendered scene contents.
   */
  function clearSceneStage() {
    if (sceneBackground) {
      sceneBackground.removeAttribute("src");
      sceneBackground.alt = "Current scene background";
      sceneBackground.classList.add("is-hidden");
    }

    if (sceneLayers) {
      sceneLayers.innerHTML = "";
    }
  }

  /**
   * Apply layer styles to an element.
   *
   * Args:
   *   element: The DOM element.
   *   layer: The layer definition.
   */
  function applyLayerStyles(element, layer) {
    element.style.opacity = String(layer.opacity ?? 1.0);
    element.style.filter = `brightness(${layer.brightness ?? 1.0})${layer.filter ? ` ${layer.filter}` : ""}`;
    element.style.mixBlendMode = layer.blend_mode ?? "normal";
    element.style.transform = layer.transform ?? "none";
  }

  /**
   * Determine whether a layer should be rendered as a video.
   *
   * Args:
   *   layer: The layer definition.
   *
   * Returns:
   *   True if the layer should use a video element.
   */
  function isVideoLayer(layer) {
    const fileSrc = String(layer?.src ?? "").toLowerCase();
    return layer?.type === "video" || fileSrc.endsWith(".webm") || fileSrc.endsWith(".mp4");
  }

  /**
   * Wait for an image to finish loading.
   *
   * Args:
   *   image: The image element.
   *
   * Returns:
   *   A promise that resolves when loading succeeds.
   */
  function waitForImageLoad(image) {
    return new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to load image: ${image.src}`));
    });
  }

  /**
   * Wait for a video to be ready.
   *
   * Args:
   *   video: The video element.
   *
   * Returns:
   *   A promise that resolves when the video can play.
   */
  function waitForVideoReady(video) {
    return new Promise((resolve, reject) => {
      video.oncanplaythrough = () => resolve();
      video.onerror = () => reject(new Error(`Failed to load video: ${video.src}`));
    });
  }

  /**
   * Preload a scene before rendering it.
   *
   * Args:
   *   scene: Scene definition or null.
   */
  async function preloadScene(scene) {
    if (!scene) {
      return;
    }

    const preloadTasks = [];

    if (scene.background) {
      const image = new Image();
      image.src = scene.background;
      preloadTasks.push(waitForImageLoad(image));
    }

    (scene.layers ?? []).forEach((layer) => {
      if (isVideoLayer(layer)) {
        const video = document.createElement("video");
        video.preload = "auto";
        video.src = layer.src;
        preloadTasks.push(waitForVideoReady(video));
      } else {
        const image = new Image();
        image.src = layer.src;
        preloadTasks.push(waitForImageLoad(image));
      }
    });

    await Promise.all(preloadTasks);
  }

  /**
   * Render a scene into the display stage.
   *
   * Args:
   *   scene: Scene definition or null.
   */
  function renderScene(scene) {
    clearSceneStage();

    if (!scene) {
      return;
    }

    if (sceneBackground) {
      sceneBackground.src = scene.background;
      sceneBackground.alt = scene.name;
      sceneBackground.classList.remove("is-hidden");
    }

    if (sceneLayers) {
      (scene.layers ?? []).forEach((layer) => {
        if (isVideoLayer(layer)) {
          const video = document.createElement("video");
          video.className = "scene-layer-video";
          video.src = layer.src;
          video.autoplay = true;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.setAttribute("aria-hidden", "true");
          applyLayerStyles(video, layer);
          sceneLayers.appendChild(video);
          return;
        }

        const image = document.createElement("img");
        image.className = "scene-layer-image";
        image.src = layer.src;
        image.alt = `${scene.name} layer`;
        applyLayerStyles(image, layer);
        sceneLayers.appendChild(image);
      });
    }
  }

  /**
   * Switch to a new scene using a fade transition.
   *
   * Args:
   *   sceneId: The new scene identifier.
   */
  async function switchScene(sceneId) {
    if (isTransitioning) {
      currentSceneId = sceneId;
      return;
    }

    if (sceneId === currentSceneId) {
      return;
    }

    isTransitioning = true;
    currentSceneId = sceneId;

    await fadeToBlack();

    const scene = sceneId ? sceneMap.get(sceneId) ?? null : null;
    await preloadScene(scene);
    renderScene(scene);

    await fadeInFromBlack();

    isTransitioning = false;
  }

  /**
   * Resolve the audio library state for the current display state.
   *
   * Args:
   *   state: The current application state.
   *
   * Returns:
   *   Resolved audio references.
   */
  function resolveAudioState(state) {
    const musicPlaylistId = state.current_music_playlist?.playlist_id ?? null;
    const musicPlaylist = musicPlaylistId ? musicPlaylistMap.get(musicPlaylistId) ?? null : null;

    const ambienceTrackUrls = {};
    Object.keys(state.active_ambiences ?? {}).forEach((ambienceId) => {
      const trackUrl = ambienceTrackMap.get(ambienceId);
      if (trackUrl) {
        ambienceTrackUrls[ambienceId] = trackUrl;
      }
    });

    return {
      musicPlaylist,
      ambienceTrackUrls,
    };
  }

  /**
   * Update audio from the current application state.
   *
   * Newer state always wins. If a sync is already in progress, only the latest
   * pending state is kept.
   *
   * Args:
   *   state: The latest state snapshot.
   */
  async function updateAudioFromState(state) {
    if (!audioReady) {
      pendingAudioState = state;
      return;
    }

    if (isSyncingAudio) {
      if (!pendingAudioState || state.revision > pendingAudioState.revision) {
        pendingAudioState = state;
      }
      return;
    }

    isSyncingAudio = true;

    try {
      const resolvedAudio = resolveAudioState(state);
      await audioEngine.syncFromState(state, resolvedAudio);
    } finally {
      isSyncingAudio = false;

      if (pendingAudioState) {
        const nextState = pendingAudioState;
        pendingAudioState = null;
        updateAudioFromState(nextState);
      }
    }
  }

  /**
   * Unlock audio after the first user gesture.
   */
  async function unlockAudio() {
    if (audioReady) {
      return;
    }

    audioReady = true;

    if (audioUnlockOverlay) {
      audioUnlockOverlay.classList.add("is-hidden");
    }

    await audioEngine.init();
    await audioEngine.ensureRunning();

    if (pendingAudioState) {
      const nextState = pendingAudioState;
      pendingAudioState = null;
      await updateAudioFromState(nextState);
      return;
    }

    await updateAudioFromState(currentState);
  }

  /**
   * Bind the gesture that unlocks audio.
   */
  function bindAudioUnlock() {
    const unlockOnce = async () => {
      await unlockAudio();
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
      window.removeEventListener("touchstart", unlockOnce);
    };

    window.addEventListener("pointerdown", unlockOnce, { once: true });
    window.addEventListener("keydown", unlockOnce, { once: true });
    window.addEventListener("touchstart", unlockOnce, { once: true });
  }

  bindAudioUnlock();

  if (audioUnlockOverlay) {
    audioUnlockOverlay.addEventListener("click", unlockAudio);
  }

  eventSource.addEventListener("state_snapshot", async (event) => {
    const data = JSON.parse(event.data);
    currentState = data;
    renderState(currentState);
    await switchScene(currentState.current_scene?.scene_id ?? null);
    updateAudioFromState(currentState);
  });

  eventSource.addEventListener("state_updated", async (event) => {
    const data = JSON.parse(event.data);

    if (data.revision !== undefined && data.revision <= currentState.revision) {
      return;
    }

    const previousSceneId = currentState.current_scene?.scene_id ?? null;
    currentState = data;
    renderState(currentState);

    if (currentState.current_scene?.scene_id !== previousSceneId) {
      await switchScene(currentState.current_scene?.scene_id ?? null);
    }

    updateAudioFromState(currentState);
  });

  eventSource.onerror = () => {
    console.warn("Display SSE connection lost. Browser will retry automatically.");
  };
}

document.addEventListener("DOMContentLoaded", initDisplayPage);