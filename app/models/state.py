from dataclasses import dataclass, field
from typing import Any


@dataclass
class AppState:
    """
    Shared in-memory application state.

    This will later hold the currently selected scene, music playlist,
    active ambience tracks, and other live UI state.
    """

    current_scene_id: str | None = None
    current_music_playlist: str | None = None
    active_ambiences: dict[str, float] = field(default_factory=dict)
    fade_settings: dict[str, Any] = field(default_factory=lambda: {
        "music": 5.0,
        "ambience": 10.0,
        "scene": 5.0,
    })