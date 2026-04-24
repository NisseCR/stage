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

    scene: ActiveScene | None = None
    music: ActivePlaylist | None = None
    ambiences: dict[str, ActiveAmbience] = Field(default_factory=dict)
    show_debug: bool = False
    fade_settings: dict[str, Any] = Field(
        default_factory=lambda: {
            "music": 5.0,
            "ambience": 5.0,
            "scene": 5.0,
        }
    )