from pathlib import Path
from typing import Any

from app.models.library import SceneDefinition, SceneLayer


class SceneService:
    """
    Handle scene discovery and scene metadata loading.

    Scene definitions come from a JSON file, while assets are stored under the
    static art directory.
    """

    IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    VIDEO_EXTENSIONS = {".webm", ".mp4", ".mkv", ".mov", ".avi"}

    def __init__(self, images_dir: Path, video_dir: Path, scenes_dir: Path) -> None:
        self.images_dir = images_dir
        self.video_dir = video_dir
        self.scenes_dir = scenes_dir

    def load_scenes(self) -> list[SceneDefinition]:
        """
        Load scene definitions from the configured scenes directory.

        Scene asset paths are kept relative so scene files stay easy to write.

        Returns:
            A list of scene definitions, or an empty list if nothing is available.
        """
        if not self.scenes_dir.exists():
            return []

        import json

        scenes: list[SceneDefinition] = []
        for scene_file in self.scenes_dir.glob("*.json"):
            with scene_file.open("r", encoding="utf-8") as file:
                scene = json.load(file)

            scenes.append(
                SceneDefinition(
                    id=scene["id"],
                    name=scene["name"],
                    background=self._to_static_url(scene["background"]),
                    layers=[self._parse_layer(layer) for layer in scene.get("layers", [])],
                )
            )

        return scenes

    def _parse_layer(self, layer: Any) -> SceneLayer:
        """
        Convert a raw JSON layer entry into a SceneLayer model.

        Args:
            layer: A raw layer entry from the scene JSON file.

        Returns:
            A normalized scene layer model.
        """
        if isinstance(layer, str):
            return SceneLayer(
                src=self._to_static_url(layer),
            )

        src = layer["src"]
        resolved_type = layer.get("type")
        if resolved_type is None:
            resolved_type = self._infer_layer_type(src)

        return SceneLayer(
            src=self._to_static_url(src),
            type=resolved_type,
            opacity=layer.get("opacity", 1.0),
            brightness=layer.get("brightness", 1.0),
            grayscale=layer.get("grayscale", 0.0),
            blur=layer.get("blur", 0.0),
            flip=layer.get("flip", False),
            blend_mode=layer.get("blend_mode", "normal"),
        )

    def _infer_layer_type(self, asset_name: str) -> str:
        """
        Infer a layer type from the asset extension.

        Args:
            asset_name: A file name or relative asset path.

        Returns:
            The inferred layer type.
        """
        normalized_name = asset_name.replace("\\", "/")
        suffix = Path(normalized_name).suffix.lower()

        if suffix in self.VIDEO_EXTENSIONS:
            return "video"
        if suffix in self.IMAGE_EXTENSIONS:
            return "image"
        return "image"

    def _to_static_url(self, asset_name: str) -> str:
        """
        Convert an asset name into a static URL.

        Args:
            asset_name: A file name or relative asset path.

        Returns:
            A browser-accessible static URL.
        """
        normalized_name = asset_name.replace("\\", "/")

        if "/" in normalized_name:
            return f"/static/assets/{normalized_name}"

        suffix = Path(normalized_name).suffix.lower()

        if suffix in self.IMAGE_EXTENSIONS:
            return f"/static/assets/images/{normalized_name}"
        if suffix in self.VIDEO_EXTENSIONS:
            return f"/static/assets/video/{normalized_name}"

        return f"/static/assets/images/{normalized_name}"