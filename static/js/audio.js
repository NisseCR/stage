/**
 * Manage all audio playback for the display page.
 *
 * This engine uses the Web Audio API so fades and interruptions can be handled
 * smoothly from the current gain level rather than from a fixed start point.
 */
class AudioEngine {
  /**
   * Create a new audio engine instance.
   */
  constructor() {
    this.audioContext = null;
    this.masterGain = null;

    this.musicController = null;
    this.musicPlaylistId = null;

    this.ambienceControllers = new Map();

    this.defaultMusicFadeSeconds = 5.0;
    this.defaultAmbienceFadeSeconds = 10.0;
    this.volumeFadeSeconds = 0.35;
  }

  /**
   * Ensure the audio context is created and ready.
   *
   * Returns:
   *   A promise that resolves once the audio engine is ready.
   */
  async init() {
    if (this.audioContext) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();

    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.audioContext.destination);
  }

  /**
   * Resume the audio context if it is currently suspended.
   *
   * Returns:
   *   A promise that resolves once the context is running.
   */
  async ensureRunning() {
    await this.init();

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Apply the complete scene audio state.
   *
   * Args:
   *   state: The current application state.
   *   resolvedAudio: The resolved audio lookup data.
   */
  async syncFromState(state, resolvedAudio) {
    await this.ensureRunning();

    const fadeSettings = state.fade_settings ?? {};
    const musicFadeSeconds = Number(fadeSettings.music ?? this.defaultMusicFadeSeconds);
    const ambienceFadeSeconds = Number(fadeSettings.ambience ?? this.defaultAmbienceFadeSeconds);

    const currentMusicPlaylist = state.current_music_playlist;
    const activeAmbiences = state.active_ambiences ?? {};

    if (currentMusicPlaylist && resolvedAudio.musicPlaylist) {
      await this.setMusic(
        currentMusicPlaylist.playlist_id,
        resolvedAudio.musicPlaylist,
        currentMusicPlaylist.volume ?? 1.0,
        musicFadeSeconds
      );
    } else {
      await this.clearMusic(musicFadeSeconds);
    }

    await this.syncAmbiences(activeAmbiences, resolvedAudio.ambienceTrackUrls, ambienceFadeSeconds);
  }

  /**
   * Set or switch music playlist playback.
   *
   * Args:
   *   playlistId: The selected playlist identifier.
   *   playlist: The resolved playlist object.
   *   volume: The target volume.
   *   fadeSeconds: The fade duration in seconds.
   */
  async setMusic(playlistId, playlist, volume, fadeSeconds = this.defaultMusicFadeSeconds) {
    await this.ensureRunning();

    if (!playlistId || !playlist || !playlist.tracks || playlist.tracks.length === 0) {
      await this.clearMusic(fadeSeconds);
      return;
    }

    if (!this.musicController) {
      this.musicController = new PlaylistController(this.audioContext, this.masterGain, {
        kind: "music",
      });
      this.musicPlaylistId = null;
    }

    if (this.musicPlaylistId !== playlistId) {
      console.log("[audio] switching playlist:", playlistId, playlist.tracks.map((track) => track.url));
      this.musicPlaylistId = playlistId;
      await this.musicController.switchPlaylist(playlist.tracks, volume ?? 1.0, fadeSeconds);
      return;
    }

    await this.musicController.setVolume(volume ?? 1.0, this.volumeFadeSeconds);
  }

  /**
   * Synchronize ambience controllers with the current active ambience map.
   *
   * Args:
   *   activeAmbiences: The active ambience state map.
   *   resolvedTrackUrls: A map of ambience ids to track URLs.
   *   fadeSeconds: The fade duration in seconds.
   */
  async syncAmbiences(activeAmbiences, resolvedTrackUrls, fadeSeconds = this.defaultAmbienceFadeSeconds) {
    await this.ensureRunning();

    const desiredIds = new Set(Object.keys(activeAmbiences ?? {}));

    for (const [ambienceId, ambience] of Object.entries(activeAmbiences ?? {})) {
      const trackUrl = resolvedTrackUrls?.[ambienceId];
      if (!trackUrl) {
        continue;
      }

      const controller = this.getOrCreateAmbienceController(ambienceId);

      if (controller.sourceUrl !== trackUrl) {
        await controller.setSource(trackUrl);
      }

      await controller.fadeTo(ambience.volume ?? 1.0, fadeSeconds);
    }

    for (const [ambienceId, controller] of this.ambienceControllers.entries()) {
      if (!desiredIds.has(ambienceId)) {
        await controller.fadeOutAndStop(fadeSeconds);
        this.ambienceControllers.delete(ambienceId);
      }
    }
  }

  /**
   * Set the volume for a single ambience track.
   *
   * Args:
   *   ambienceId: The ambience identifier.
   *   volume: The new volume.
   */
  async setAmbienceVolume(ambienceId, volume) {
    await this.ensureRunning();

    const controller = this.ambienceControllers.get(ambienceId);
    if (!controller) {
      return;
    }

    await controller.fadeTo(volume, this.volumeFadeSeconds);
  }

  /**
   * Clear the current music track.
   *
   * Args:
   *   fadeSeconds: The fade duration in seconds.
   */
  async clearMusic(fadeSeconds = this.defaultMusicFadeSeconds) {
    if (!this.musicController) {
      this.musicPlaylistId = null;
      return;
    }

    await this.musicController.stopPlaylist(fadeSeconds);
    this.musicController = null;
    this.musicPlaylistId = null;
  }

  /**
   * Clear all ambience tracks.
   *
   * Args:
   *   fadeSeconds: The fade duration in seconds.
   */
  async clearAmbiences(fadeSeconds = this.defaultAmbienceFadeSeconds) {
    for (const [ambienceId, controller] of this.ambienceControllers.entries()) {
      await controller.fadeOutAndStop(fadeSeconds);
      this.ambienceControllers.delete(ambienceId);
    }
  }

  /**
   * Get or create an ambience controller.
   *
   * Args:
   *   ambienceId: The ambience identifier.
   *
   * Returns:
   *   An ambience controller instance.
   */
  getOrCreateAmbienceController(ambienceId) {
    let controller = this.ambienceControllers.get(ambienceId);

    if (!controller) {
      controller = new FadableTrackController(this.audioContext, this.masterGain, {
        loop: true,
        kind: "ambience",
      });
      this.ambienceControllers.set(ambienceId, controller);
    }

    return controller;
  }
}

/**
 * Play a shuffled playlist with auto-advance.
 */
class PlaylistController {
  /**
   * Create a new playlist controller.
   *
   * Args:
   *   audioContext: The shared audio context.
   *   outputNode: The node to connect into.
   *   options: Playlist options.
   */
  constructor(audioContext, outputNode, options = {}) {
    this.audioContext = audioContext;
    this.outputNode = outputNode;
    this.kind = options.kind ?? "playlist";

    this.trackController = new FadableTrackController(this.audioContext, this.outputNode, {
      loop: false,
      kind: this.kind,
    });

    this.tracks = [];
    this.queue = [];
    this.currentTrackIndex = -1;
    this.currentVolume = 1.0;
    this.isStopping = false;
    this.token = 0;
  }

  /**
   * Switch to a new playlist and crossfade from the current track.
   *
   * Args:
   *   tracks: The playlist track list.
   *   targetVolume: The target volume.
   *   fadeSeconds: The playlist switch fade duration.
   */
  async switchPlaylist(tracks, targetVolume, fadeSeconds) {
    this.token += 1;
    const switchToken = this.token;

    this.tracks = Array.isArray(tracks) ? tracks.slice() : [];
    this.queue = this.shuffleTracks(this.tracks);
    this.currentTrackIndex = 0;
    this.currentVolume = Number(targetVolume ?? 1.0);

    if (this.queue.length === 0) {
      await this.stopPlaylist(fadeSeconds);
      return;
    }

    const nextTrack = this.queue[this.currentTrackIndex];
    console.log("[audio] starting playlist with track:", nextTrack.url);

    await this.trackController.fadeTo(0.0, fadeSeconds);
    if (switchToken !== this.token) {
      return;
    }

    await this.trackController.setSource(nextTrack.url);
    if (switchToken !== this.token) {
      return;
    }

    this.bindTrackEnd(switchToken);

    await this.trackController.fadeTo(this.currentVolume, fadeSeconds);
  }

  /**
   * Update playlist volume without changing the current track.
   *
   * Args:
   *   volume: The new target volume.
   *   fadeSeconds: The fade duration in seconds.
   */
  async setVolume(volume, fadeSeconds) {
    this.currentVolume = Number(volume ?? 1.0);
    await this.trackController.fadeTo(this.currentVolume, fadeSeconds);
  }

  /**
   * Advance to the next track in the current shuffled order.
   *
   * When the end of the queue is reached, reshuffle and start from the beginning.
   */
  async playNextTrack() {
    if (this.isStopping || this.queue.length === 0) {
      return;
    }

    this.currentTrackIndex += 1;

    if (this.currentTrackIndex >= this.queue.length) {
      this.queue = this.shuffleTracks(this.tracks);
      this.currentTrackIndex = 0;
    }

    const nextTrack = this.queue[this.currentTrackIndex];
    console.log("[audio] advancing to next track:", nextTrack.url);

    await this.trackController.setSource(nextTrack.url);
    await this.trackController.fadeTo(this.currentVolume, 0.15);
    this.bindTrackEnd(this.token);
  }

  /**
   * Stop the playlist and fade out the current track.
   *
   * Args:
   *   fadeSeconds: The fade duration in seconds.
   */
  async stopPlaylist(fadeSeconds) {
    this.isStopping = true;
    this.token += 1;

    await this.trackController.fadeOutAndStop(fadeSeconds);
    this.isStopping = false;
    this.queue = [];
    this.tracks = [];
    this.currentTrackIndex = -1;
  }

  /**
   * Bind the end handler for the currently playing track.
   *
   * Args:
   *   tokenAtBind: The controller token at bind time.
   */
  bindTrackEnd(tokenAtBind) {
    if (!this.trackController.audioElement) {
      return;
    }

    this.trackController.audioElement.onended = async () => {
      if (this.isStopping || tokenAtBind !== this.token) {
        return;
      }

      await this.playNextTrack();
    };
  }

  /**
   * Shuffle a track list.
   *
   * Args:
   *   tracks: The original track list.
   *
   * Returns:
   *   A shuffled copy of the list.
   */
  shuffleTracks(tracks) {
    const shuffled = tracks.slice();

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }
}

/**
 * Manage one audio track with a gain node and interruption-safe fades.
 */
class FadableTrackController {
  /**
   * Create a new track controller.
   *
   * Args:
   *   audioContext: The shared audio context.
   *   outputNode: The node to connect into.
   *   options: Track options.
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
  }

  /**
   * Create or replace the underlying audio element source.
   *
   * Args:
   *   url: The audio source URL.
   */
  async setSource(url) {
    if (this.sourceUrl === url && this.audioElement && this.sourceNode) {
      return;
    }

    await this.stopSource();

    this.sourceUrl = url;
    this.audioElement = new Audio(url);
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.loop = this.loop;
    this.audioElement.preload = "auto";

    await this.waitForCanPlay(this.audioElement);

    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.sourceNode.connect(this.gainNode);

    try {
      await this.audioElement.play();
    } catch (error) {
      console.warn(`Unable to autoplay ${this.kind} track:`, error);
    }
  }

  /**
   * Fade the track to a target volume.
   *
   * Args:
   *   targetVolume: The target gain value.
   *   fadeSeconds: The fade duration in seconds.
   */
  async fadeTo(targetVolume, fadeSeconds) {
    const safeTarget = Math.max(0, Number(targetVolume ?? 0));
    const safeDurationMs = Math.max(0, Number(fadeSeconds ?? 0) * 1000);

    if (!this.gainNode) {
      return;
    }

    const now = this.audioContext.currentTime;
    const currentGain = this.getCurrentGain();

    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(currentGain, now);
    this.gainNode.gain.linearRampToValueAtTime(safeTarget, now + safeDurationMs / 1000);

    this.currentFadeTarget = safeTarget;

    if (safeDurationMs > 0) {
      await this.wait(safeDurationMs);
    }
  }

  /**
   * Fade the track out and stop playback.
   *
   * Args:
   *   fadeSeconds: The fade duration in seconds.
   */
  async fadeOutAndStop(fadeSeconds) {
    await this.fadeTo(0.0, fadeSeconds);
    await this.stopSource();
  }

  /**
   * Stop and release the current source.
   */
  async stopSource() {
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
      this.sourceNode = null;
    }

    this.audioElement = null;
    this.sourceUrl = null;
    this.currentFadeTarget = 0.0;
    this.gainNode.gain.value = 0.0;
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
   * Wait for the audio element to become playable.
   *
   * Args:
   *   audioElement: The audio element.
   *
   * Returns:
   *   A promise that resolves when the source can play.
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