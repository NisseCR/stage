from pydantic import BaseModel


class SceneUpdateRequest(BaseModel):
    """
    Represent a request to change the current scene.
    """

    scene_id: str | None


class MusicUpdateRequest(BaseModel):
    """
    Represent a request to change the current music playlist.
    """

    music_playlist: str | None


class AmbienceUpdateRequest(BaseModel):
    """
    Represent a request to change the active ambience set.
    """

    active_ambiences: dict[str, float]


class FadeUpdateRequest(BaseModel):
    """
    Represent a request to change fade settings.
    """

    fade_settings: dict[str, float]


class ActiveScene(BaseModel):
    """
    Represent the currently active scene and its runtime settings.
    """

    scene_id: str
    transition: str | None = None
    opacity: float = 1.0


class ActivePlaylist(BaseModel):
    """
    Represent the currently selected music playlist and its runtime settings.
    """

    playlist_id: str
    volume: float = 1.0


class ActiveAmbience(BaseModel):
    """
    Represent an active ambience item and its runtime settings.
    """

    ambience_id: str
    volume: float = 1.0


class VolumeUpdateRequest(BaseModel):
    """
    Represent a request to change runtime volumes.

    The current music playlist and active ambience items own their own volume
    values, so this payload updates those runtime selections.
    """

    music_volume: float
    ambience_volumes: dict[str, float]