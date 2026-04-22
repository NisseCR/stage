from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.events import ActiveAmbience, ActivePlaylist, ActiveScene


class AppState(BaseModel):
    """
    Shared in-memory application state.

    This holds the live selections and settings that will later be broadcast
    through SSE to the GM and display pages.
    """

    model_config = ConfigDict(extra="ignore")

    current_scene: ActiveScene | None = None
    current_music_playlist: ActivePlaylist | None = None
    active_ambiences: dict[str, ActiveAmbience] = Field(default_factory=dict)
    fade_settings: dict[str, Any] = Field(
        default_factory=lambda: {
            "music": 5.0,
            "ambience": 10.0,
            "scene": 5.0,
        }
    )