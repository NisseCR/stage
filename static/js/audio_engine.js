/**
 * AudioEngine reconciles desired audio state against currently playing audio.
 *
 * Prototype behavior:
 * - no fades yet
 * - music playlists auto-advance track-to-track
 * - state changes reload/unload audio when needed
 * - unchanged playlists keep their current playback position
 * - failed tracks are skipped once per playlist cycle
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

    this.currentDesiredState = {
      music: null,
      ambiences: {},
    };

    this.musicState = {
      playlistId: null,
      playlist: null,
      trackIndex: 0,
      audioElement: null,
      playbackToken: 0,
      failedTrackIndexes: new Set(),
    };

    this.activeAmbienceSources = new Map();
  }

  /**
   * Initialize the audio context.
   */
  async init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Update the desired audio state and reconcile playback.
   *
   * Args:
   *   state: The latest canonical application state.
   */
  async reconcile(state) {
    await this.init();

    const desiredMusicPlaylistId = state.music?.playlist_id ?? null;
    const desiredAmbiences = state.ambiences ?? {};

    const musicChanged = desiredMusicPlaylistId !== this.currentDesiredState.music?.playlist_id;
    const ambienceChanged = !this.areAmbiencesEqual(desiredAmbiences, this.currentDesiredState.ambiences);

    this.currentDesiredState = {
      music: state.music ?? null,
      ambiences: this.cloneAmbiences(desiredAmbiences),
    };

    if (musicChanged) {
      await this.reconcileMusic(desiredMusicPlaylistId);
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
      this.stopMusic();
      return;
    }

    const playlist = this.musicPlaylistMap.get(playlistId) ?? null;

    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      console.warn("Music playlist has no tracks or was not found:", playlistId);
      this.stopMusic();
      return;
    }

    const playlistStillPlaying = this.musicState.playlistId === playlistId;

    if (!playlistStillPlaying) {
      this.stopMusic();
      this.musicState.playlistId = playlistId;
      this.musicState.playlist = playlist;
      this.musicState.trackIndex = 0;
      this.musicState.failedTrackIndexes = new Set();
      await this.playCurrentMusicTrack();
      return;
    }

    if (!this.musicState.audioElement) {
      await this.playCurrentMusicTrack();
    }
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
   */
  async playCurrentMusicTrack() {
    const playlist = this.musicState.playlist;
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      return;
    }

    const token = ++this.musicState.playbackToken;

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

    const audio = new Audio(track.url);
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";

    audio.addEventListener("ended", async () => {
      if (token !== this.musicState.playbackToken) {
        return;
      }

      await this.advanceMusicTrack();
    });

    audio.addEventListener("error", async () => {
      if (token !== this.musicState.playbackToken) {
        return;
      }

      console.warn("Music track failed to load:", track.url);
      await this.handleMusicTrackFailure();
    });

    this.musicState.audioElement = audio;

    try {
      await audio.play();

      if (token !== this.musicState.playbackToken) {
        audio.pause();
        return;
      }

      console.log("Playing music track:", track.name);
    } catch (error) {
      if (token !== this.musicState.playbackToken) {
        return;
      }

      console.warn("Failed to play music track:", track.url, error);
      await this.handleMusicTrackFailure();
    }
  }

  /**
   * Handle a failed music track by moving to the next track once.
   */
  async handleMusicTrackFailure() {
    const playlist = this.musicState.playlist;
    if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
      this.stopMusic();
      return;
    }

    this.musicState.failedTrackIndexes.add(this.musicState.trackIndex);

    const totalTracks = playlist.tracks.length;
    const triedCount = this.musicState.failedTrackIndexes.size;

    if (triedCount >= totalTracks) {
      console.warn("All tracks in playlist failed to load:", this.musicState.playlistId);
      this.stopMusic();
      return;
    }

    await this.advanceMusicTrack();
  }

  /**
   * Advance to the next track in the current playlist.
   *
   * This is only used when the playlist itself has not changed.
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
        this.cleanupMusicElement();
        await this.playCurrentMusicTrack();
        return;
      }
    }

    console.warn("No playable tracks remain in playlist:", this.musicState.playlistId);
    this.stopMusic();
  }

  /**
   * Stop music playback and clear music state.
   */
  stopMusic() {
    this.cleanupMusicElement();
    this.musicState.playlistId = null;
    this.musicState.playlist = null;
    this.musicState.trackIndex = 0;
    this.musicState.failedTrackIndexes = new Set();
    this.musicState.playbackToken += 1;
  }

  /**
   * Dispose of the active music element.
   */
  cleanupMusicElement() {
    if (!this.musicState.audioElement) {
      return;
    }

    const audio = this.musicState.audioElement;
    audio.pause();
    audio.src = "";
    audio.load();
    this.musicState.audioElement = null;
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
        this.stopAmbience(ambienceId);
      }
    }

    for (const [ambienceId, ambience] of Object.entries(desiredAmbiences)) {
      const alreadyPlaying = this.activeAmbienceSources.has(ambienceId);
      if (!alreadyPlaying) {
        await this.startAmbience(ambienceId, ambience);
      }
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

    const audio = new Audio(trackUrl);
    audio.preload = "auto";
    audio.loop = true;
    audio.crossOrigin = "anonymous";

    audio.addEventListener("error", () => {
      console.warn("Ambience track failed to load:", trackUrl);
      this.stopAmbience(ambienceId);
    });

    this.activeAmbienceSources.set(ambienceId, {
      audio,
      ambience,
    });

    try {
      await audio.play();
      console.log("Playing ambience:", ambienceId);
    } catch (error) {
      console.warn("Failed to play ambience track:", error);
      this.stopAmbience(ambienceId);
    }
  }

  /**
   * Stop a single ambience track.
   *
   * Args:
   *   ambienceId: The ambience identifier.
   */
  stopAmbience(ambienceId) {
    const entry = this.activeAmbienceSources.get(ambienceId);
    if (!entry) {
      return;
    }

    entry.audio.pause();
    entry.audio.src = "";
    entry.audio.load();
    this.activeAmbienceSources.delete(ambienceId);
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
}