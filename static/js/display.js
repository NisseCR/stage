/**
 * Initialize the display page behavior.
 *
 * This page is a read-only listener that receives live updates from the backend
 * via SSE and renders the active scene state.
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

  let currentState = {
    current_scene: null,
    current_music_playlist: null,
    active_ambiences: {},
    fade_settings: {},
  };

  let currentSceneId = null;
  let isTransitioning = false;

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

  /**
   * Get the current fade duration for scene transitions in milliseconds.
   *
   * Returns:
   *   The fade duration in milliseconds.
   */
  function getSceneFadeDurationMs() {
    const fadeSeconds = Number(currentState.fade_settings?.scene ?? 5.0);
    return Math.max(0, fadeSeconds * 1000);
  }

  /**
   * Fade the entire scene stage to black.
   *
   * Returns:
   *   A promise that resolves after the fade completes.
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
   * Fade the entire scene stage back in from black.
   *
   * Returns:
   *   A promise that resolves after the fade completes.
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
   * Clear the current scene stage contents.
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
   * Apply visual styling from a layer configuration.
   *
   * Args:
   *   element: The DOM element representing a layer.
   *   layer: The layer configuration.
   */
  function applyLayerStyles(element, layer) {
    element.style.opacity = String(layer.opacity ?? 1.0);
    element.style.filter = `brightness(${layer.brightness ?? 1.0})${layer.filter ? ` ${layer.filter}` : ""}`;
    element.style.mixBlendMode = layer.blend_mode ?? "normal";
    element.style.transform = layer.transform ?? "none";
  }

  /**
   * Wait for an image element to finish loading.
   *
   * Args:
   *   image: The image element.
   *
   * Returns:
   *   A promise that resolves when the image is loaded.
   */
  function waitForImageLoad(image) {
    return new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to load image: ${image.src}`));
    });
  }

  /**
   * Wait for a video element to be ready to play.
   *
   * Args:
   *   video: The video element.
   *
   * Returns:
   *   A promise that resolves when the video is ready.
   */
  function waitForVideoReady(video) {
    return new Promise((resolve, reject) => {
      video.oncanplaythrough = () => resolve();
      video.onerror = () => reject(new Error(`Failed to load video: ${video.src}`));
    });
  }

  /**
   * Preload the assets for a scene without showing them yet.
   *
   * Args:
   *   scene: The scene definition from the library, or null.
   *
   * Returns:
   *   A promise that resolves once all assets are ready.
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

    scene.layers.forEach((layer) => {
      const isVideo = layer.type === "video" || layer.src.endsWith(".webm") || layer.src.endsWith(".mp4");

      if (isVideo) {
        const video = document.createElement("video");
        video.preload = "auto";
        video.src = layer.src;
        preloadTasks.push(waitForVideoReady(video));
        return;
      }

      const image = new Image();
      image.src = layer.src;
      preloadTasks.push(waitForImageLoad(image));
    });

    await Promise.all(preloadTasks);
  }

  /**
   * Render a scene definition into the stage.
   *
   * Args:
   *   scene: The scene definition from the library, or null.
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
      scene.layers.forEach((layer) => {
        const isVideo = layer.type === "video" || layer.src.endsWith(".webm") || layer.src.endsWith(".mp4");

        if (isVideo) {
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
   * Switch to a new scene with a fade-to-black transition.
   *
   * Args:
   *   sceneId: The new active scene identifier.
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

  eventSource.addEventListener("state_snapshot", async (event) => {
    const data = JSON.parse(event.data);
    console.log("Initial state snapshot received:", data);
    currentState = data;
    renderState(currentState);
    await switchScene(currentState.current_scene?.scene_id ?? null);
  });

  eventSource.addEventListener("scene_changed", async (event) => {
    const data = JSON.parse(event.data);
    console.log("Scene changed:", data);
    applyStatePatch({
      current_scene: data.scene,
    });
    await switchScene(data.scene?.scene_id ?? null);
  });

  eventSource.addEventListener("music_changed", async (event) => {
    const data = JSON.parse(event.data);
    console.log("Music changed:", data);
    applyStatePatch({
      current_music_playlist: data.music_playlist,
    });
  });

  eventSource.addEventListener("ambience_changed", async (event) => {
    const data = JSON.parse(event.data);
    console.log("Ambience changed:", data);
    applyStatePatch({
      active_ambiences: data.active_ambiences,
    });
  });

  eventSource.addEventListener("fade_settings_changed", async (event) => {
    const data = JSON.parse(event.data);
    console.log("Fade settings changed:", data);
    applyStatePatch({
      fade_settings: data.fade_settings,
    });
  });

  eventSource.addEventListener("volume_changed", async (event) => {
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