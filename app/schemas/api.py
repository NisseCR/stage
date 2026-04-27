from pydantic import BaseModel, ConfigDict

from app.schemas.events import ActiveAmbience, ActivePlaylist, ActiveScene, StateResponse


class RootResponse(BaseModel):
    """
    Represent the application root response.
    """

    name: str
    status: str
    routes: list[str]


class LibraryResponse(BaseModel):
    """
    Represent the discovered media library.
    """

    music_playlists: list[dict]
    ambience_folders: list[dict]
    scenes: list[dict]
    art_library: list[dict]


class AppStateResponse(StateResponse):
    """
    Represent the canonical app state returned by state endpoints.
    """

    model_config = ConfigDict(from_attributes=True)