/**
 * SceneEngine reconciles the desired scene state against the rendered display.
 */
class SceneEngine {
  /**
   * Create a new scene engine instance.
   *
   * Args:
   *   options: Scene engine dependencies and initial data.
   */
  constructor(options) {
    this.sceneBackground = options.sceneBackground;
    this.sceneLayers = options.sceneLayers;
    this.sceneFadeOverlay = options.sceneFadeOverlay;
    this.sceneMap = options.sceneMap;

    this.currentSceneId = null;
    this.isTransitioning = false;
    this.pendingSceneId = null;
    this.currentFadeDurationMs = 5000;
  }

  /**
   * Update the fade duration used for the next scene transition.
   *
   * Args:
   *   fadeSettings: The current fade settings object.
   */
  updateFadeSettings(fadeSettings) {
    const fadeSeconds = Number(fadeSettings?.scene ?? 5.0);
    this.currentFadeDurationMs = Math.max(0, fadeSeconds * 1000);
  }

  /**
   * Reconcile the rendered scene with the desired scene state.
   *
   * Args:
   *   sceneId: The desired scene identifier, or null.
   */
  async reconcile(sceneId) {
    if (sceneId === this.currentSceneId) {
      return;
    }

    this.pendingSceneId = sceneId;

    if (this.isTransitioning) {
      return;
    }

    this.isTransitioning = true;

    while (this.pendingSceneId !== this.currentSceneId) {
      const desiredSceneId = this.pendingSceneId;
      await this.runTransition(desiredSceneId);
      this.currentSceneId = desiredSceneId;
    }

    this.isTransitioning = false;
  }

  /**
   * Run the standard scene transition flow for a target scene.
   *
   * Args:
   *   sceneId: The target scene identifier.
   */
  async runTransition(sceneId) {
    await this.fadeToBlack();
    const scene = sceneId ? this.sceneMap.get(sceneId) ?? null : null;
    await this.preloadScene(scene);
    this.renderScene(scene);
    await this.fadeInFromBlack();
  }

  /**
   * Fade the scene stage to black.
   */
  fadeToBlack() {
    return new Promise((resolve) => {
      if (!this.sceneFadeOverlay) {
        resolve();
        return;
      }

      this.sceneFadeOverlay.style.transitionDuration = `${this.currentFadeDurationMs}ms`;
      this.sceneFadeOverlay.classList.add("is-visible");
      window.setTimeout(resolve, this.currentFadeDurationMs);
    });
  }

  /**
   * Fade the scene stage back in from black.
   */
  fadeInFromBlack() {
    return new Promise((resolve) => {
      if (!this.sceneFadeOverlay) {
        resolve();
        return;
      }

      this.sceneFadeOverlay.style.transitionDuration = `${this.currentFadeDurationMs}ms`;
      this.sceneFadeOverlay.classList.remove("is-visible");
      window.setTimeout(resolve, this.currentFadeDurationMs);
    });
  }

  /**
   * Clear the current scene stage contents.
   */
  clearSceneStage() {
    if (this.sceneBackground) {
      this.sceneBackground.removeAttribute("src");
      this.sceneBackground.alt = "Current scene background";
      this.sceneBackground.classList.add("is-hidden");
    }

    if (this.sceneLayers) {
      this.sceneLayers.innerHTML = "";
    }
  }

  /**
   * Apply visual styles to a scene layer element.
   *
   * Args:
   *   element: The DOM element representing the layer.
   *   layer: The layer configuration.
   */
  applyLayerStyles(element, layer) {
    element.style.opacity = String(layer.opacity ?? 1.0);
    element.style.filter = `brightness(${layer.brightness ?? 1.0})${layer.filter ? ` ${layer.filter}` : ""}`;
    element.style.mixBlendMode = layer.blend_mode ?? "normal";
    element.style.transform = layer.transform ?? "none";
  }

  /**
   * Wait for an image element to load.
   *
   * Args:
   *   image: The image element.
   *
   * Returns:
   *   A promise that resolves when loading succeeds.
   */
  waitForImageLoad(image) {
    return new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to load image: ${image.src}`));
    });
  }

  /**
   * Wait for a video element to become ready.
   *
   * Args:
   *   video: The video element.
   *
   * Returns:
   *   A promise that resolves when the video is ready.
   */
  waitForVideoReady(video) {
    return new Promise((resolve, reject) => {
      video.oncanplaythrough = () => resolve();
      video.onerror = () => reject(new Error(`Failed to load video: ${video.src}`));
    });
  }

  /**
   * Preload the assets for a scene.
   *
   * Args:
   *   scene: The scene definition, or null.
   */
  async preloadScene(scene) {
    if (!scene) {
      return;
    }

    const preloadTasks = [];

    if (scene.background) {
      const image = new Image();
      image.src = scene.background;
      preloadTasks.push(this.waitForImageLoad(image));
    }

    (scene.layers ?? []).forEach((layer) => {
      const isVideo = layer.type === "video" || layer.src.endsWith(".webm") || layer.src.endsWith(".mp4");

      if (isVideo) {
        const video = document.createElement("video");
        video.preload = "auto";
        video.src = layer.src;
        preloadTasks.push(this.waitForVideoReady(video));
        return;
      }

      const image = new Image();
      image.src = layer.src;
      preloadTasks.push(this.waitForImageLoad(image));
    });

    await Promise.all(preloadTasks);
  }

  /**
   * Render a scene into the stage.
   *
   * Args:
   *   scene: The scene definition, or null.
   */
  renderScene(scene) {
    this.clearSceneStage();

    if (!scene) {
      return;
    }

    if (this.sceneBackground) {
      this.sceneBackground.src = scene.background;
      this.sceneBackground.alt = scene.name;
      this.sceneBackground.classList.remove("is-hidden");
    }

    if (!this.sceneLayers) {
      return;
    }

    (scene.layers ?? []).forEach((layer) => {
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
        this.applyLayerStyles(video, layer);
        this.sceneLayers.appendChild(video);
        return;
      }

      const image = document.createElement("img");
      image.className = "scene-layer-image";
      image.src = layer.src;
      image.alt = `${scene.name} layer`;
      this.applyLayerStyles(image, layer);
      this.sceneLayers.appendChild(image);
    });
  }
}