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
    this.container = options.container;
    this.sceneBackground = options.sceneBackground || this.container?.querySelector(".scene-background");
    this.sceneLayers = options.sceneLayers || this.container?.querySelector(".scene-layers");
    this.sceneFadeOverlay = options.sceneFadeOverlay || this.container?.querySelector(".scene-fade-overlay");
    this.sceneMap = options.sceneMap || new Map();

    this.currentSceneId = null;
    this.isTransitioning = false;
    this.pendingSceneId = null;
    this.currentFadeDurationMs = 5000;

    // Parallax intro configuration
    this.parallaxIntroBackgroundScale = 1.05;
    this.parallaxIntroFirstLayerScale = 1.10;
    this.parallaxIntroLayerScaleStep = 0.05;
    this.parallaxIntroMaxLayerScale = 1.30;

    // Track active animations for cleanup
    this.activeIntroAnimations = [];
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
    this.cancelParallaxIntroAnimations();
    await this.fadeToBlack();
    const scene = sceneId ? this.sceneMap.get(sceneId) ?? null : null;
    await this.preloadScene(scene);
    this.renderScene(scene);

    if (this.currentFadeDurationMs > 0) {
      this.prepareParallaxIntro();
      const introPromise = this.playParallaxIntro(this.currentFadeDurationMs);
      const fadePromise = this.fadeInFromBlack();
      await Promise.all([introPromise, fadePromise]);
    } else {
      this.finishParallaxIntro();
      await this.fadeInFromBlack();
    }
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

    const filters = [];
    if (layer.brightness !== undefined && layer.brightness !== 1.0) {
      filters.push(`brightness(${layer.brightness})`);
    }
    if (layer.grayscale !== undefined && layer.grayscale > 0) {
      filters.push(`grayscale(${layer.grayscale})`);
    }
    if (layer.blur !== undefined && layer.blur > 0) {
      filters.push(`blur(${layer.blur}px)`);
    }
    element.style.filter = filters.length > 0 ? filters.join(" ") : "none";

    element.style.mixBlendMode = layer.blend_mode ?? "normal";

    const transforms = [];
    if (layer.flip) {
      transforms.push("scaleX(-1)");
    }
    element.style.transform = transforms.length > 0 ? transforms.join(" ") : "none";
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
        // Store base transform for parallax intro composition
        video.dataset.baseTransform = layer.flip ? "scaleX(-1)" : "none";
        this.applyLayerStyles(video, layer);
        this.sceneLayers.appendChild(video);
        return;
      }

      const image = document.createElement("img");
      image.className = "scene-layer-image";
      image.src = layer.src;
      image.alt = `${scene.name} layer`;
      // Store base transform for parallax intro composition
      image.dataset.baseTransform = layer.flip ? "scaleX(-1)" : "none";
      this.applyLayerStyles(image, layer);
      this.sceneLayers.appendChild(image);
    });
  }

  /**
   * Get the intro scale for a specific layer index.
   *
   * Args:
   *   layerIndex: Zero-based index of the layer above background.
   */
  getLayerIntroScale(layerIndex) {
    if (layerIndex === -1) {
      return this.parallaxIntroBackgroundScale;
    }
    const scale = this.parallaxIntroFirstLayerScale + layerIndex * this.parallaxIntroLayerScaleStep;
    return Math.min(scale, this.parallaxIntroMaxLayerScale);
  }

  /**
   * Prepare all scene elements for the parallax intro.
   * Applies starting scales and performance hints.
   */
  prepareParallaxIntro() {
    if (this.sceneBackground && !this.sceneBackground.classList.contains("is-hidden")) {
      const scale = this.getLayerIntroScale(-1);
      this.sceneBackground.style.transform = `scale(${scale})`;
      this.sceneBackground.style.willChange = "transform";
    }

    if (this.sceneLayers) {
      const layers = Array.from(this.sceneLayers.children);
      layers.forEach((layer, index) => {
        const scale = this.getLayerIntroScale(index);
        const baseTransform = layer.dataset.baseTransform || "none";
        const combinedTransform = baseTransform === "none" ? `scale(${scale})` : `${baseTransform} scale(${scale})`;
        layer.style.transform = combinedTransform;
        layer.style.willChange = "transform, opacity";
      });
    }
  }

  /**
   * Play the parallax intro animation.
   *
   * Args:
   *   durationMs: The duration of the intro animation.
   */
  async playParallaxIntro(durationMs) {
    if (durationMs <= 0) {
      this.finishParallaxIntro();
      return;
    }

    const animations = [];

    if (this.sceneBackground && !this.sceneBackground.classList.contains("is-hidden")) {
      const scale = this.getLayerIntroScale(-1);
      const anim = this.sceneBackground.animate(
        [
          { transform: `scale(${scale})` },
          { transform: "scale(1)" }
        ],
        {
          duration: durationMs,
          easing: "cubic-bezier(0.2, 0, 0.4, 1)", // More natural "gliding" stop
          fill: "forwards"
        }
      );
      animations.push(anim);
    }

    if (this.sceneLayers) {
      const layers = Array.from(this.sceneLayers.children);
      layers.forEach((layer, index) => {
        const scale = this.getLayerIntroScale(index);
        const baseTransform = layer.dataset.baseTransform || "none";
        const startTransform = baseTransform === "none" ? `scale(${scale})` : `${baseTransform} scale(${scale})`;
        const endTransform = baseTransform === "none" ? "scale(1)" : `${baseTransform} scale(1)`;

        const anim = layer.animate(
          [
            { transform: startTransform },
            { transform: endTransform }
          ],
          {
            duration: durationMs,
            easing: "cubic-bezier(0.2, 0, 0.4, 1)",
            fill: "forwards"
          }
        );
        animations.push(anim);
      });
    }

    this.activeIntroAnimations = animations;

    if (animations.length > 0) {
      await Promise.all(animations.map(anim => anim.finished)).catch(() => {
        /* Ignore cancelled animations */
      });
    }

    this.finishParallaxIntro();
  }

  /**
   * Clean up after parallax intro completion.
   */
  finishParallaxIntro() {
    this.activeIntroAnimations = [];

    if (this.sceneBackground) {
      this.sceneBackground.style.transform = "";
      this.sceneBackground.style.willChange = "";
    }

    if (this.sceneLayers) {
      Array.from(this.sceneLayers.children).forEach((layer) => {
        layer.style.transform = layer.dataset.baseTransform === "none" ? "" : (layer.dataset.baseTransform || "");
        layer.style.willChange = "";
      });
    }
  }

  /**
   * Cancel any ongoing parallax intro animations.
   */
  cancelParallaxIntroAnimations() {
    if (this.activeIntroAnimations.length > 0) {
      this.activeIntroAnimations.forEach(anim => anim.cancel());
      this.finishParallaxIntro();
    }
  }
}