/**
 * Reconcile the display audio state against the shared application state.
 *
 * The engine follows a latest-state-wins model:
 * - the backend state is the source of truth
 * - the newest revision always wins
 * - stale async work is ignored
 * - ambiences and music are reconciled independently
 * - volume changes retarget in-flight fades instead of fighting them
 */
class AudioEngine {
  /**
   * Create a new audio engine instance.
   */
  constructor() {
    this.audioContext = null;
    this.masterGain = null;

    this.lastRevision = -1;
    this.syncToken = 0;
    this.isInitialized = false;

    this.musicController = null;
    this.ambienceControllers = new Map();

    this.defaultMusicFadeSeconds = 5.0;
    this.defaultAmbienceFadeSeconds = 10.0;
  }

  /**
   * Initialize the Web Audio context and master gain node.
   *
   * Returns:
   *   A promise that resolves once the audio engine is ready.
   */
  async init() {
    if (this.isInitialized) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();

    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.audioContext.destination);

    this.isInitialized = true;
  }

  /**
   * Ensure the audio context is running.
   *
   * Returns:
   *   A promise that resolves once the audio context is active.
   */
  async ensureRunning() {
    await this.init();

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Synchronize all audio playback against the latest application state.
   *
   * Args:
   *   state: The current application state snapshot.
   *   resolvedAudio: The resolved audio library lookup data.
   *
   * Returns:
   *   A promise that resolves once reconciliation completes.
   */
  async syncFromState(state, resolvedAudio) {
    const revision = Number(state?.revision ?? 0);

    if (revision <= this.lastRevision) {
      return;
    }

    this.lastRevision = revision;
    const token = this.nextSyncToken();

    await this.ensureRunning();

    const fadeSettings = state?.fade_settings ?? {};
    const musicFadeSeconds = this.getFadeSeconds(fadeSettings.music, this.defaultMusicFadeSeconds);
    const ambienceFadeSeconds = this.getFadeSeconds(fadeSettings.ambience, this.defaultAmbienceFadeSeconds);

    await this.syncMusicFromState(state?.current_music_playlist ?? null, resolvedAudio?.musicPlaylist ?? null, musicFadeSeconds, token);
    await this.syncAmbiencesFromState(state?.active_ambiences ?? {}, resolvedAudio?.ambienceTrackUrls ?? {}, ambienceFadeSeconds, token);
  }

  /**
   * Get the next sync token.
   *
   * Returns:
   *   A monotonically increasing token number.
   */
  nextSyncToken() {
    this.syncToken += 1;
    return this.syncToken;
  }

  /**
   * Check whether a token is still current.
   *
   * Args:
   *   token: The token to validate.
   *
   * Returns:
   *   True if the token is current, false otherwise.
   */
  isCurrentToken(token) {
    return token === this.syncToken;
  }

  /**
   * Convert an input value into a safe fade duration.
   *
   * Args:
   *   value: The input fade value.
   *   fallback: The fallback duration.
   *
   * Returns:
   *   A safe number of seconds.
   */
  getFadeSeconds(value, fallback) {
    const seconds = Number(value ?? fallback);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : fallback;
  }

  /**
   * Reconcile music against the current desired state.
   *
   * Args:
   *   currentMusicPlaylist: The current music playlist state.
   *   resolvedPlaylist: The resolved playlist library entry.
   *   fadeSeconds: Fade duration in seconds.
   *   token: The current sync token.
   */
  async syncMusicFromState(currentMusicPlaylist, resolvedPlaylist, fadeSeconds, token) {
    if (!this.isCurrentToken(token)) {
      return;
    }

    if (!currentMusicPlaylist || !resolvedPlaylist || !Array.isArray(resolvedPlaylist.tracks) || resolvedPlaylist.tracks.length === 0) {
      await this.clearMusic(fadeSeconds, token);
      return;
    }

    const playlistId = currentMusicPlaylist.playlist_id;
    const targetVolume = Number(currentMusicPlaylist.volume ?? 1.0);

    const controller = this.getOrCreateMusicController();

    if (controller.playlistId !== playlistId) {
      await controller.switchPlaylist(playlistId, resolvedPlaylist.tracks, targetVolume, fadeSeconds, token);
      return;
    }

    await controller.reconcileVolume(targetVolume, fadeSeconds, token);
  }

  /**
   * Reconcile ambiences against the current desired state.
   *
   * Args:
   *   activeAmbiences: The desired active ambience state map.
   *   resolvedTrackUrls: A map of ambience ids to resolved audio urls.
   *   fadeSeconds: Fade duration in seconds.
   *   token: The current sync token.
   */
  async syncAmbiencesFromState(activeAmbiences, resolvedTrackUrls, fadeSeconds, token) {
    if (!this.isCurrentToken(token)) {
      return;
    }

    const desiredIds = new Set(Object.keys(activeAmbiences ?? {}));

    for (const [ambienceId, ambienceState] of Object.entries(activeAmbiences ?? {})) {
      if (!this.isCurrentToken(token)) {
        return;
      }

      const trackUrl = resolvedTrackUrls?.[ambienceId];
      if (!trackUrl) {
        continue;
      }

      const controller = this.getOrCreateAmbienceController(ambienceId);
      await controller.reconcile(trackUrl, Number(ambienceState.volume ?? 1.0), fadeSeconds, token);
    }

    for (const [ambienceId, controller] of this.ambienceControllers.entries()) {
      if (!desiredIds.has(ambienceId)) {
        await controller.stopGracefully(fadeSeconds, token);
        this.ambienceControllers.delete(ambienceId);
      }
    }
  }

  /**
   * Create or return the shared music controller.
   *
   * Returns:
   *   A playlist controller.
   */
  getOrCreateMusicController() {
    if (!this.musicController) {
      this.musicController = new PlaylistController(this.audioContext, this.masterGain, "music");
    }

    return this.musicController;
  }

  /**
   * Create or return an ambience controller.
   *
   * Args:
   *   ambienceId: The ambience identifier.
   *
   * Returns:
   *   A track controller.
   */
  getOrCreateAmbienceController(ambienceId) {
    let controller = this.ambienceControllers.get(ambienceId);

    if (!controller) {
      controller = new ReconciledTrackController(this.audioContext, this.masterGain, {
        kind: "ambience",
        loop: true,
      });
      this.ambienceControllers.set(ambienceId, controller);
    }

    return controller;
  }

  /**
   * Clear the active music playlist.
   *
   * Args:
   *   fadeSeconds: Fade duration in seconds.
   *   token: The current sync token.
   */
  async clearMusic(fadeSeconds, token) {
    if (!this.musicController) {
      return;
    }

    await this.musicController.stop(fadeSeconds, token);
    this.musicController = null;
  }
}

/**
 * Manage one playlist with sequential track playback and auto-advance.
 */
class PlaylistController {
  /**
   * Create a new playlist controller.
   *
   * Args:
   *   audioContext: The shared audio context.
   *   outputNode: The output node.
   *   kind: Controller label used for logs.
   */
  constructor(audioContext, outputNode, kind = "music") {
    this.audioContext = audioContext;
    this.outputNode = outputNode;
    this.kind = kind;

    this.trackController = new ReconciledTrackController(this.audioContext, this.outputNode, {
      kind,
      loop: false,
    });

    this.playlistId = null;
    this.tracks = [];
    this.currentTrackIndex = -1;
    this.currentVolume = 1.0;
    this.playToken = 0;
    this.isStopping = false;
  }

  /**
   * Switch to a new playlist.
   *
   * Args:
   *   playlistId: Playlist identifier.
   *   tracks: Track list for the playlist.
   *   targetVolume: Desired playback volume.
   *   fadeSeconds: Fade duration in seconds.
   *   syncToken: The current audio sync token.
   */
  async switchPlaylist(playlistId, tracks, targetVolume, fadeSeconds, syncToken) {
    this.playToken += 1;
    const token = this.playToken;

    this.playlistId = playlistId;
    this.tracks = Array.isArray(tracks) ? tracks.slice() : [];
    this.currentTrackIndex = 0;
    this.currentVolume = this.clampVolume(targetVolume);

    if (this.tracks.length === 0) {
      await this.stop(fadeSeconds, syncToken);
      return;
    }

    await this.trackController.fadeOutAndPause(fadeSeconds, token, syncToken);

    if (!this.isCurrentPlayToken(token, syncToken)) {
      return;
    }

    await this.trackController.setSource(this.tracks[this.currentTrackIndex].url, false, token, syncToken);

    if (!this.isCurrentPlayToken(token, syncToken)) {
      return;
    }

    this.bindTrackEnd(token, syncToken);
    await this.trackController.fadeTo(this.currentVolume, fadeSeconds, token, syncToken);
  }

  /**
   * Reconcile volume without changing the current track.
   *
   * Args:
   *   targetVolume: Desired volume.
   *   fadeSeconds: Fade duration in seconds.
   *   syncToken: Current audio sync token.
   */
  async reconcileVolume(targetVolume, fadeSeconds, syncToken) {
    const safeVolume = this.clampVolume(targetVolume);
    this.currentVolume = safeVolume;

    await this.trackController.reconcileVolume(safeVolume, fadeSeconds, this.playToken, syncToken);
  }

  /**
   * Stop playlist playback gracefully.
   *
   * Args:
   *   fadeSeconds: Fade duration in seconds.
   *   syncToken: Current audio sync token.
   */
  async stop(fadeSeconds, syncToken) {
    this.isStopping = true;
    this.playToken += 1;

    await this.trackController.fadeOutAndPause(fadeSeconds, this.playToken, syncToken);

    this.playlistId = null;
    this.tracks = [];
    this.currentTrackIndex = -1;
    this.isStopping = false;
  }

  /**
   * Handle automatic advancement after a track ends.
   *
   * Args:
   *   playTokenAtBind: Token captured when the handler was attached.
   *   syncToken: Current audio sync token.
   */
  bindTrackEnd(playTokenAtBind, syncToken) {
    if (!this.trackController.audioElement) {
      return;
    }

    this.trackController.audioElement.onended = async () => {
      if (!this.isCurrentPlayToken(playTokenAtBind, syncToken) || this.isStopping) {
        return;
      }

      await this.playNextTrack(playTokenAtBind, syncToken);
    };
  }

  /**
   * Advance to the next track in order.
   *
   * The order is kept as provided by the current playlist data.
   *
   * Args:
   *   playTokenAtBind: Current playlist token.
   *   syncToken: Current audio sync token.
   */
  async playNextTrack(playTokenAtBind, syncToken) {
    if (!this.isCurrentPlayToken(playTokenAtBind, syncToken) || this.tracks.length === 0) {
      return;
    }

    this.currentTrackIndex += 1;
    if (this.currentTrackIndex >= this.tracks.length) {
      this.currentTrackIndex = 0;
    }

    const nextTrack = this.tracks[this.currentTrackIndex];
    await this.trackController.setSource(nextTrack.url, false, playTokenAtBind, syncToken);

    if (!this.isCurrentPlayToken(playTokenAtBind, syncToken)) {
      return;
    }

    this.bindTrackEnd(playTokenAtBind, syncToken);
    await this.trackController.fadeTo(this.currentVolume, 0.15, playTokenAtBind, syncToken);
  }

  /**
   * Validate that the provided token is still active.
   *
   * Args:
   *   playToken: Playlist token.
   *   syncToken: Global sync token.
   *
   * Returns:
   *   True if the token is still valid.
   */
  isCurrentPlayToken(playToken, syncToken) {
    return playToken === this.playToken && syncToken === this.trackController.syncToken;
  }

  /**
   * Clamp a volume value into the valid range.
   *
   * Args:
   *   volume: Desired volume.
   *
   * Returns:
   *   A value between 0 and 1.
   */
  clampVolume(volume) {
    const numeric = Number(volume ?? 1.0);
    if (!Number.isFinite(numeric)) {
      return 1.0;
    }

    return Math.min(1.0, Math.max(0.0, numeric));
  }
}

/**
 * Manage one audio track with reconciliation-aware source and volume changes.
 */
class ReconciledTrackController {
  /**
   * Create a new track controller.
   *
   * Args:
   *   audioContext: The shared audio context.
   *   outputNode: The destination node.
   *   options: Controller options.
   */
  constructor(audioContext, outputNode, options = {}) {
    this.audioContext = audioContext;
    this.outputNode = outputNode;
    this.kind = options.kind ?? "track";
    this.loop = Boolean(options.loop ?? true);

    this.audioElement = null;
    this.sourceNode = null;
    this.sourceUrl = null;

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0.0;
    this.gainNode.connect(this.outputNode);

    this.currentFadeTarget = 0.0;
    this.syncToken = 0;
  }

  /**
   * Reconcile the controller to a desired source and volume.
   *
   * Args:
   *   url: Desired source url.
   *   targetVolume: Desired volume.
   *   fadeSeconds: Fade duration.
   *   playToken: Optional playlist token.
   *   syncToken: Global sync token.
   */
  async reconcile(url, targetVolume, fadeSeconds, playToken, syncToken) {
    if (this.sourceUrl !== url) {
      await this.setSource(url, true, playToken, syncToken);
    }

    await this.fadeTo(targetVolume, fadeSeconds, playToken, syncToken);
  }

  /**
   * Set or replace the current audio source.
   *
   * Args:
   *   url: Source URL.
   *   shouldFadeIn: Whether the source should fade in afterwards.
   *   playToken: Optional playlist token.
   *   syncToken: Global sync token.
   */
  async setSource(url, shouldFadeIn, playToken, syncToken) {
    const token = this.nextToken();

    await this.stopSource(token, syncToken);

    if (!this.isCurrentToken(token, syncToken)) {
      return;
    }

    this.sourceUrl = url;
    this.audioElement = new Audio(url);
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.loop = this.loop;
    this.audioElement.preload = "auto";

    await this.waitForCanPlay(this.audioElement);

    if (!this.isCurrentToken(token, syncToken)) {
      return;
    }

    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.sourceNode.connect(this.gainNode);

    try {
      await this.audioElement.play();
    } catch (error) {
      console.warn(`Unable to autoplay ${this.kind} track:`, error);
    }

    if (shouldFadeIn) {
      await this.fadeTo(1.0, 0.15, playToken, syncToken);
    }
  }

  /**
   * Fade the track to a target volume.
   *
   * Args:
   *   targetVolume: Desired target.
   *   fadeSeconds: Fade duration.
   *   playToken: Optional playlist token.
   *   syncToken: Global sync token.
   */
  async fadeTo(targetVolume, fadeSeconds, playToken, syncToken) {
    const safeTarget = this.clampVolume(targetVolume);
    const currentToken = this.nextToken();

    if (!this.isCurrentToken(currentToken, syncToken)) {
      return;
    }

    if (this.currentFadeTarget === safeTarget) {
      return;
    }

    const now = this.audioContext.currentTime;
    const currentGain = this.getCurrentGain();

    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(currentGain, now);
    this.gainNode.gain.linearRampToValueAtTime(safeTarget, now + Math.max(0, Number(fadeSeconds ?? 0)));

    this.currentFadeTarget = safeTarget;

    if (Number(fadeSeconds ?? 0) > 0) {
      await this.wait(Number(fadeSeconds ?? 0) * 1000);
    }

    if (!this.isCurrentToken(currentToken, syncToken)) {
      return;
    }
  }

  /**
   * Fade out and pause the current audio source.
   *
   * Args:
   *   fadeSeconds: Fade duration.
   *   playToken: Optional playlist token.
   *   syncToken: Global sync token.
   */
  async fadeOutAndPause(fadeSeconds, playToken, syncToken) {
    await this.fadeTo(0.0, fadeSeconds, playToken, syncToken);
    await this.pauseSource(syncToken);
  }

  /**
   * Fade out and stop the current audio source.
   *
   * Args:
   *   fadeSeconds: Fade duration.
   *   playToken: Optional playlist token.
   *   syncToken: Global sync token.
   */
  async fadeOutAndStop(fadeSeconds, playToken, syncToken) {
    await this.fadeOutAndPause(fadeSeconds, playToken, syncToken);
    await this.stopSource(this.syncToken, syncToken);
  }

  /**
   * Reconcile a volume change without changing the source.
   *
   * Args:
   *   targetVolume: Desired volume.
   *   fadeSeconds: Fade duration.
   *   playToken: Optional playlist token.
   *   syncToken: Global sync token.
   */
  async reconcileVolume(targetVolume, fadeSeconds, playToken, syncToken) {
    await this.fadeTo(targetVolume, fadeSeconds, playToken, syncToken);
  }

  /**
   * Pause the current audio element.
   *
   * Args:
   *   syncToken: Global sync token.
   */
  async pauseSource(syncToken) {
    if (!this.isCurrentToken(this.syncToken, syncToken)) {
      return;
    }

    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch (error) {
        console.warn(`Unable to pause ${this.kind} track:`, error);
      }
    }
  }

  /**
   * Stop and release the current source.
   *
   * Args:
   *   token: Local source token.
   *   syncToken: Global sync token.
   */
  async stopSource(token, syncToken) {
    if (!this.isCurrentToken(token, syncToken)) {
      return;
    }

    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch (error) {
        console.warn(`Unable to pause ${this.kind} track:`, error);
      }
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (error) {
        console.warn(`Unable to disconnect ${this.kind} source node:`, error);
      }
    }

    this.audioElement = null;
    this.sourceNode = null;
    this.sourceUrl = null;
    this.currentFadeTarget = 0.0;
    this.gainNode.gain.value = 0.0;
  }

  /**
   * Increment the controller token.
   *
   * Returns:
   *   The new token value.
   */
  nextToken() {
    this.syncToken += 1;
    return this.syncToken;
  }

  /**
   * Check whether a token is still current.
   *
   * Args:
   *   token: Local token.
   *   syncToken: Global sync token.
   *
   * Returns:
   *   True if the token is current.
   */
  isCurrentToken(token, syncToken) {
    return token === this.syncToken && syncToken === this.syncToken;
  }

  /**
   * Get the current gain value.
   *
   * Returns:
   *   The current gain value.
   */
  getCurrentGain() {
    return Number(this.gainNode.gain.value ?? 0.0);
  }

  /**
   * Clamp a volume value into the valid range.
   *
   * Args:
   *   volume: Desired volume.
   *
   * Returns:
   *   A safe normalized volume.
   */
  clampVolume(volume) {
    const numeric = Number(volume ?? 0.0);
    if (!Number.isFinite(numeric)) {
      return 0.0;
    }

    return Math.min(1.0, Math.max(0.0, numeric));
  }

  /**
   * Wait for an audio element to become playable.
   *
   * Args:
   *   audioElement: The audio element.
   *
   * Returns:
   *   A promise that resolves when the track can play.
   */
  waitForCanPlay(audioElement) {
    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load audio source: ${audioElement.src}`));
      };

      const cleanup = () => {
        audioElement.removeEventListener("canplaythrough", onReady);
        audioElement.removeEventListener("error", onError);
      };

      audioElement.addEventListener("canplaythrough", onReady, { once: true });
      audioElement.addEventListener("error", onError, { once: true });
    });
  }

  /**
   * Wait for a given number of milliseconds.
   *
   * Args:
   *   milliseconds: Duration to wait.
   *
   * Returns:
   *   A promise that resolves after the wait.
   */
  wait(milliseconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }
}

window.AudioEngine = AudioEngine;