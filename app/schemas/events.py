from typing import Any

from pydantic import BaseModel, Field


class ActiveScene(BaseModel):
    """
    Represent the currently active scene and its runtime settings.
    """

    scene_id: str
    transition: str | None = None
    opacity: float = 1.0


class ActivePlaylist(BaseModel):
    """
    Represent the currently active music playlist.
    """

    playlist_id: str
    volume: float = 1.0


class ActiveAmbience(BaseModel):
    """
    Represent a single active ambience track and its runtime settings.
    """

    ambience_id: str
    volume: float = 1.0


class FadeSettings(BaseModel):
    """
    Represent fade durations for the different state categories.
    """

    music: float = 5.0
    ambience: float = 5.0
    scene: float = 5.0


class AppStateSyncRequest(BaseModel):
    """
    Represent the full application state payload sent from the GM page.
    """

    scene: ActiveScene | None = None
    music: ActivePlaylist | None = None
    ambiences: dict[str, ActiveAmbience] = Field(default_factory=dict)
    show_debug: bool = True
    fade_settings: FadeSettings = Field(default_factory=FadeSettings)


class StateResponse(BaseModel):
    """
    Represent the canonical application state returned by the backend.
    """

    scene: ActiveScene | None = None
    music: ActivePlaylist | None = None
    ambiences: dict[str, ActiveAmbience] = Field(default_factory=dict)
    show_debug: bool = True
    fade_settings: dict[str, Any] = Field(default_factory=dict)