from typing import Literal
from pydantic import BaseModel, Field


class AssetEntry(BaseModel):
    name: str       # file name, e.g. "gate.jpg"
    url: str        # "/static/assets/images/gate.jpg"
    size_bytes: int
    kind: Literal["image", "video"]


class SceneLayer(BaseModel):
    """
    Represent a single visual layer in a scene definition.

    Layers may be images or videos, and each layer can define optional visual
    adjustments such as opacity, brightness, grayscale, blur, flip, and blend mode.
    """

    src: str
    type: str | None = None
    opacity: float = 1.0
    brightness: float = 1.0
    grayscale: float = 0.0
    blur: float = 0.0
    flip: bool = False
    blend_mode: str = "normal"


class SceneDefinition(BaseModel):
    """
    Represent a scene definition loaded from the scene JSON file.
    """

    id: str
    name: str
    background: str
    layers: list[SceneLayer] = Field(default_factory=list)


class MusicTrack(BaseModel):
    """
    Represent a single music track discovered from the file system.
    """

    name: str
    file_name: str
    file_path: str
    url: str


class MusicPlaylist(BaseModel):
    """
    Represent a music playlist discovered from the file system.
    """

    id: str
    name: str
    cover_url: str | None = None
    tracks: list[MusicTrack] = Field(default_factory=list)


class AmbienceTrack(BaseModel):
    """
    Represent a single ambience file discovered from the file system.
    """

    name: str
    file_name: str
    file_path: str
    url: str


class AmbienceFolder(BaseModel):
    """
    Represent a folder of ambience tracks discovered from the file system.
    """

    id: str
    name: str
    tracks: list[AmbienceTrack] = Field(default_factory=list)


class ArtItem(BaseModel):
    """
    Represent a single art handout discovered from the file system.
    """

    id: str
    name: str
    src: str
    category: str