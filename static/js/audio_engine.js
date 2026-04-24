/**
 * AudioEngine reconciles desired audio state against currently playing audio.
 *
 * Web Audio implementation goals:
 * - use AudioBufferSourceNode for playback
 * - fade individual music tracks and ambience items
 * - preserve unchanged items
 * - crossfade music only when the playlist changes
 * - auto-advance music tracks without fades
 * - latest update wins gracefully by waiting for the current transition to finish
 */
class AudioEngine {
  /**
   * Create a new audio engine instance.
   *
   * Args:
   *   options: Engine dependencies and library data.
   */
  constructor(options) {
    this.musicPlaylistMap = options.musicPlaylistMap;
    this.ambienceTrackMap = options.ambienceTrackMap;

    this.audioContext = null;
    this.masterGain = null;

    this.fadeSettings = {
      music: 5.0,
      ambience: 5.0,
    };

    this.currentDesiredState = {
      music: null,
      ambiences: {},
    };

    this.musicState = {
      playlistId: null,
      playlist: null,
      trackIndex: 0,
      source: null,
      gainNode: null,
      currentTrackUrl: null,
      failedTrackIndexes: new Set(),
      transitionPromise: Promise.resolve(),
    };

    this.activeAmbienceSources = new Map();
    this.bufferCache = new Map();
    this.pendingLoadPromises = new Map();
  }

  /**
   * Initialize the audio context and master gain chain.
   */
  async init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Update fade durations used by the audio engine.
   *
   * Args:
   *   fadeSettings: The current fade settings object.
   */
  updateFadeSettings(fadeSettings) {
    this.fadeSettings = {
      music: Math.max(0, Number(fadeSettings?.music ?? 5.0)),
      ambience: Math.max(0, Number(fadeSettings?.ambience ?? 5.0)),
    };
  }

  /**
   * Update the desired audio state and reconcile playback.
   *
   * Args:
   *   state: The latest canonical application state.
   */
  async reconcile(state) {
    await this.init();
    this.updateFadeSettings(state.fade_settings);

    const desiredMusicPlaylistId = state.music?.playlist_id ?? null;
    const desiredAmbiences = state.ambiences ?? {};

    const musicChanged = desiredMusicPlaylistId !== this.currentDesiredState.music?.playlist_id;
    const ambienceChanged = !this.areAmbiencesEqual(desiredAmbiences, this.currentDesiredState.ambiences);

    this.currentDesiredState = {
      music: state.music ?? null,
      ambiences: this.cloneAmbiences(desiredAmbiences),
    };

    if (musicChanged) {
      this.musicState.transitionPromise = this.musicState.transitionPromise.then(() =>
        this.reconcileMusic(desiredMusicPlaylistId)
      );
      await this.musicState.transitionPromise;
    }

    if (ambienceChanged) {
      await this.reconcileAmbiences(desiredAmbiences);
    }
  }

  /**
   * Reconcile the currently playing music playlist.
   *
   * Args:
   *   playlistId: The desired playlist identifier, or null.
   */
  async reconcileMusic(playlistId) {
    if (!playlistId) {
      await this.fadeOutAndStopMusic();
      return;
    }

    const playlist = this.musicPlaylistMap.get(playlistId) ?? null;

    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      console.warn("Music playlist has no tracks or was not found:", playlistId);
      await this.fadeOutAndStopMusic();
      return;
    }

    const playlistChanged = this.musicState.playlistId !== playlistId;

    if (playlistChanged) {
      await this.switchMusicPlaylist(playlistId, playlist);
      return;
    }

    if (!this.musicState.source) {
      await this.playCurrentMusicTrack(false);
    }
  }

  /**
   * Switch to a new music playlist with crossfade.
   *
   * Args:
   *   playlistId: The desired playlist identifier.
   *   playlist: The discovered playlist object.
   */
  async switchMusicPlaylist(playlistId, playlist) {
    const previousState = this.snapshotCurrentMusicState();

    this.musicState.playlistId = playlistId;
    this.musicState.playlist = playlist;
    this.musicState.trackIndex = 0;
    this.musicState.failedTrackIndexes = new Set();

    await this.playCurrentMusicTrack(true, previousState);
  }

  /**
   * Snapshot the currently playing music state for crossfade purposes.
   *
   * Returns:
   *   A snapshot of the previous music playback state.
   */
  snapshotCurrentMusicState() {
    return {
      source: this.musicState.source,
      gainNode: this.musicState.gainNode,
      currentTrackUrl: this.musicState.currentTrackUrl,
    };
  }

  /**
   * Get the current track from the active playlist.
   *
   * Returns:
   *   The current track, or null if unavailable.
   */
  getCurrentMusicTrack() {
    const playlist = this.musicState.playlist;
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      return null;
    }

    return playlist.tracks[this.musicState.trackIndex % playlist.tracks.length] ?? null;
  }

  /**
   * Start playback for the currently selected music track.
   *
   * Args:
   *   shouldCrossfade: Whether to crossfade in from a previous source.
   *   previousState: The prior music state for crossfade, if any.
   */
  async playCurrentMusicTrack(shouldCrossfade = false, previousState = null) {
    const playlist = this.musicState.playlist;
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      return;
    }

    const track = this.getCurrentMusicTrack();
    if (!track) {
      return;
    }

    if (!track.url) {
      console.warn("Music track has no URL:", track);
      await this.handleMusicTrackFailure();
      return;
    }

    if (this.musicState.failedTrackIndexes.has(this.musicState.trackIndex)) {
      await this.handleMusicTrackFailure();
      return;
    }

    let buffer;
    try {
      buffer = await this.loadAudioBuffer(track.url);
    } catch (error) {
      console.warn("Music track failed to load:", track.url, error);
      await this.handleMusicTrackFailure();
      return;
    }

    if (this.musicState.playlistId !== playlist.id || this.currentDesiredState.music?.playlist_id !== playlist.id) {
      return;
    }

    if (this.musicState.trackIndex < 0 || this.musicState.trackIndex >= playlist.tracks.length) {
      return;
    }

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    const targetVolume = Number(track.volume ?? this.musicState.playlist?.volume ?? 1.0);
    gainNode.gain.value = shouldCrossfade ? 0.0 : targetVolume;

    source.addEventListener("ended", async () => {
      if (this.musicState.source !== source) {
        return;
      }

      await this.advanceMusicTrack();
    });

    this.musicState.source = source;
    this.musicState.gainNode = gainNode;
    this.musicState.currentTrackUrl = track.url;

    try {
      source.start(0);
    } catch (error) {
      console.warn("Failed to start music track:", track.url, error);
      await this.handleMusicTrackFailure();
      return;
    }

    if (this.musicState.playlistId !== playlist.id || this.currentDesiredState.music?.playlist_id !== playlist.id) {
      this.disposeMusicSource(source, gainNode);
      return;
    }

    if (shouldCrossfade && previousState?.source && previousState?.gainNode) {
      await this.crossfadeMusic(previousState, gainNode, targetVolume);
    } else {
      await this.fadeGainTo(gainNode, targetVolume, 0.01);
    }

    console.log("Playing music track:", track.name);
  }

  /**
   * Crossfade from the previous music source into the new one.
   *
   * Args:
   *   previousState: The previous music source snapshot.
   *   newGainNode: The new gain node.
   *   targetVolume: The target volume for the new track.
   */
  async crossfadeMusic(previousState, newGainNode, targetVolume) {
    await this.fadeGainTo(newGainNode, targetVolume, this.fadeSettings.music);
    await this.fadeOutSource(previousState.source, previousState.gainNode, this.fadeSettings.music);
    this.disposeMusicSource(previousState.source, previousState.gainNode);
  }

  /**
   * Fade out and stop the current music source.
   */
  async fadeOutAndStopMusic() {
    const source = this.musicState.source;
    const gainNode = this.musicState.gainNode;

    if (source && gainNode) {
      await this.fadeOutSource(source, gainNode, this.fadeSettings.music);
      this.disposeMusicSource(source, gainNode);
    }

    this.musicState.playlistId = null;
    this.musicState.playlist = null;
    this.musicState.trackIndex = 0;
    this.musicState.source = null;
    this.musicState.gainNode = null;
    this.musicState.currentTrackUrl = null;
    this.musicState.failedTrackIndexes = new Set();
  }

  /**
   * Handle a failed music track by moving to the next track once.
   */
  async handleMusicTrackFailure() {
    const playlist = this.musicState.playlist;
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      await this.fadeOutAndStopMusic();
      return;
    }

    this.musicState.failedTrackIndexes.add(this.musicState.trackIndex);

    const totalTracks = playlist.tracks.length;
    const triedCount = this.musicState.failedTrackIndexes.size;

    if (triedCount >= totalTracks) {
      console.warn("All tracks in playlist failed to load:", this.musicState.playlistId);
      await this.fadeOutAndStopMusic();
      return;
    }

    await this.advanceMusicTrack();
  }

  /**
   * Advance to the next track in the current playlist.
   *
   * This is only used when the playlist itself has not changed.
   * Auto-advance uses no fades.
   */
  async advanceMusicTrack() {
    const playlist = this.musicState.playlist;
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      return;
    }

    const desiredPlaylistId = this.currentDesiredState.music?.playlist_id ?? null;
    if (desiredPlaylistId !== this.musicState.playlistId) {
      return;
    }

    const totalTracks = playlist.tracks.length;
    let nextIndex = this.musicState.trackIndex;

    for (let i = 0; i < totalTracks; i += 1) {
      nextIndex = (nextIndex + 1) % totalTracks;

      if (!this.musicState.failedTrackIndexes.has(nextIndex)) {
        this.musicState.trackIndex = nextIndex;

        const previousSource = this.musicState.source;
        const previousGainNode = this.musicState.gainNode;

        this.musicState.source = null;
        this.musicState.gainNode = null;
        this.musicState.currentTrackUrl = null;

        if (previousSource && previousGainNode) {
          this.disposeMusicSource(previousSource, previousGainNode);
        }

        await this.playCurrentMusicTrack(false);
        return;
      }
    }

    console.warn("No playable tracks remain in playlist:", this.musicState.playlistId);
    await this.fadeOutAndStopMusic();
  }

  /**
   * Reconcile active ambience playback.
   *
   * Args:
   *   desiredAmbiences: The desired ambience id -> ambience object mapping.
   */
  async reconcileAmbiences(desiredAmbiences) {
    const desiredIds = new Set(Object.keys(desiredAmbiences));
    const activeIds = new Set(this.activeAmbienceSources.keys());

    for (const ambienceId of activeIds) {
      if (!desiredIds.has(ambienceId)) {
        await this.fadeOutAndStopAmbience(ambienceId);
      }
    }

    for (const [ambienceId, ambience] of Object.entries(desiredAmbiences)) {
      const activeEntry = this.activeAmbienceSources.get(ambienceId);

      if (!activeEntry) {
        await this.startAmbience(ambienceId, ambience);
        continue;
      }

      const targetVolume = Number(ambience.volume ?? 1.0);
      await this.fadeGainTo(activeEntry.gainNode, targetVolume, this.fadeSettings.ambience);
      activeEntry.ambience = ambience;
    }
  }

  /**
   * Start a single ambience track.
   *
   * Args:
   *   ambienceId: The ambience identifier.
   *   ambience: The active ambience model.
   */
  async startAmbience(ambienceId, ambience) {
    const trackUrl = this.ambienceTrackMap.get(ambienceId);
    if (!trackUrl) {
      console.warn("Unknown ambience track:", ambienceId);
      return;
    }

    let buffer;
    try {
      buffer = await this.loadAudioBuffer(trackUrl);
    } catch (error) {
      console.warn("Ambience track failed to load:", trackUrl, error);
      return;
    }

    if (!this.currentDesiredState.ambiences[ambienceId]) {
      return;
    }

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    const token = Symbol(ambienceId);
    const targetVolume = Number(ambience.volume ?? 1.0);
    gainNode.gain.value = 0.0;

    this.activeAmbienceSources.set(ambienceId, {
      source,
      gainNode,
      ambience,
      token,
    });

    try {
      source.start(0);

      if (!this.currentDesiredState.ambiences[ambienceId]) {
        this.disposeSource(source);
        this.activeAmbienceSources.delete(ambienceId);
        return;
      }

      await this.fadeGainTo(gainNode, targetVolume, this.fadeSettings.ambience);

      const currentEntry = this.activeAmbienceSources.get(ambienceId);
      if (!currentEntry || currentEntry.token !== token) {
        source.stop();
        return;
      }

      console.log("Playing ambience:", ambienceId);
    } catch (error) {
      const currentEntry = this.activeAmbienceSources.get(ambienceId);
      if (!currentEntry || currentEntry.token !== token) {
        return;
      }

      console.warn("Failed to play ambience track:", error);
      await this.stopAmbience(ambienceId);
    }
  }

  /**
   * Fade out and stop a single ambience track.
   *
   * Args:
   *   ambienceId: The ambience identifier.
   */
  async fadeOutAndStopAmbience(ambienceId) {
    const entry = this.activeAmbienceSources.get(ambienceId);
    if (!entry) {
      return;
    }

    await this.fadeOutSource(entry.source, entry.gainNode, this.fadeSettings.ambience);
    await this.stopAmbience(ambienceId);
  }

  /**
   * Stop a single ambience track.
   *
   * Args:
   *   ambienceId: The ambience identifier.
   */
  async stopAmbience(ambienceId) {
    const entry = this.activeAmbienceSources.get(ambienceId);
    if (!entry) {
      return;
    }

    this.activeAmbienceSources.delete(ambienceId);
    this.disposeSource(entry.source);
  }

  /**
   * Dispose of a music source and gain node.
   *
   * Args:
   *   source: The buffer source node.
   *   gainNode: The gain node.
   */
  disposeMusicSource(source, gainNode) {
    this.disposeSource(source);
    if (gainNode) {
      gainNode.disconnect();
    }
  }

  /**
   * Dispose of a generic source node.
   *
   * Args:
   *   source: The buffer source node.
   */
  disposeSource(source) {
    if (!source) {
      return;
    }

    try {
      source.stop();
    } catch (error) {
      // Source may already be stopped; ignore.
    }

    try {
      source.disconnect();
    } catch (error) {
      // Ignore disconnect errors during cleanup.
    }
  }

  /**
   * Fade a gain node to a target value.
   *
   * Args:
   *   gainNode: The gain node to animate.
   *   targetVolume: The target gain value.
   *   durationSeconds: Fade duration in seconds.
   */
  async fadeGainTo(gainNode, targetVolume, durationSeconds) {
    if (!gainNode || !this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;
    const duration = Math.max(0.01, Number(durationSeconds ?? 0));

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(Number(targetVolume ?? 1.0), now + duration);

    await this.delay(duration * 1000);
  }

  /**
   * Fade out a source by reducing its gain to zero.
   *
   * Args:
   *   source: The audio source node.
   *   gainNode: The gain node.
   *   durationSeconds: Fade duration in seconds.
   */
  async fadeOutSource(source, gainNode, durationSeconds) {
    if (!gainNode || !this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;
    const duration = Math.max(0.01, Number(durationSeconds ?? 0));

    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0.0, now + duration);

    await this.delay(duration * 1000);

    this.disposeSource(source);
  }

  /**
   * Load and cache an audio buffer.
   *
   * Args:
   *   url: The audio file URL.
   *
   * Returns:
   *   The decoded audio buffer.
   */
  async loadAudioBuffer(url) {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url);
    }

    if (this.pendingLoadPromises.has(url)) {
      return this.pendingLoadPromises.get(url);
    }

    const loadPromise = this.decodeAudioBuffer(url);
    this.pendingLoadPromises.set(url, loadPromise);

    try {
      const buffer = await loadPromise;
      this.bufferCache.set(url, buffer);
      return buffer;
    } finally {
      this.pendingLoadPromises.delete(url);
    }
  }

  /**
   * Fetch and decode an audio file into an AudioBuffer.
   *
   * Args:
   *   url: The audio file URL.
   *
   * Returns:
   *   The decoded audio buffer.
   */
  async decodeAudioBuffer(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch audio file: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * Compare ambience mappings for equality.
   *
   * Args:
   *   left: The first ambience mapping.
   *   right: The second ambience mapping.
   *
   * Returns:
   *   True if the mappings are equivalent, otherwise false.
   */
  areAmbiencesEqual(left, right) {
    const leftKeys = Object.keys(left ?? {});
    const rightKeys = Object.keys(right ?? {});

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    for (const key of leftKeys) {
      const leftItem = left[key];
      const rightItem = right[key];

      if (!rightItem) {
        return false;
      }

      if (leftItem.ambience_id !== rightItem.ambience_id) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clone an ambience mapping.
   *
   * Args:
   *   ambiences: The ambience mapping to clone.
   *
   * Returns:
   *   A shallow clone of the ambience mapping.
   */
  cloneAmbiences(ambiences) {
    return Object.fromEntries(
      Object.entries(ambiences ?? {}).map(([key, value]) => [key, { ...value }])
    );
  }

  /**
   * Delay execution for a number of milliseconds.
   *
   * Args:
   *   milliseconds: Delay duration.
   */
  delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
}