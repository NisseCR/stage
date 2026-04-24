import json
import os
import re
from pathlib import Path
from typing import Any, Literal

from app.models.library import SceneDefinition, SceneLayer, AssetEntry


class SceneError(Exception):
    """Base exception for scene-related errors."""


class SceneNotFoundError(SceneError):
    """Raised when a scene cannot be found."""


class SceneAlreadyExistsError(SceneError):
    """Raised when trying to create a scene that already exists."""


class InvalidSceneIdError(SceneError):
    """Raised when a scene ID is invalid."""


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
            scene_def = self.load_scene(scene_file.stem)
            if scene_def:
                scenes.append(scene_def)

        return scenes

    def load_scene(self, scene_id: str) -> SceneDefinition | None:
        """
        Load a single scene definition by ID.

        Args:
            scene_id: The unique ID of the scene.

        Returns:
            The loaded scene definition, or None if it doesn't exist.
        """
        scene_file = self.scenes_dir / f"{scene_id}.json"
        if not scene_file.exists():
            return None

        with scene_file.open("r", encoding="utf-8") as file:
            scene = json.load(file)

        return SceneDefinition(
            id=scene["id"],
            name=scene["name"],
            background=self._to_static_url(scene["background"]),
            layers=[self._parse_layer(layer) for layer in scene.get("layers", [])],
        )

    def save_scene(self, scene: SceneDefinition, *, allow_overwrite: bool) -> SceneDefinition:
        """
        Save a scene definition to the configured scenes directory.

        Args:
            scene: The scene definition to save.
            allow_overwrite: Whether to overwrite an existing scene file.

        Returns:
            The saved scene definition.

        Raises:
            InvalidSceneIdError: If the scene ID is invalid.
            SceneAlreadyExistsError: If allow_overwrite is False and the file exists.
            SceneNotFoundError: If allow_overwrite is True and the file does not exist.
        """
        if not re.match(r"^[a-z0-9][a-z0-9-]*$", scene.id):
            raise InvalidSceneIdError(f"Invalid scene ID: {scene.id}")

        scene_file = self.scenes_dir / f"{scene.id}.json"
        exists = scene_file.exists()

        if not allow_overwrite and exists:
            raise SceneAlreadyExistsError(f"Scene {scene.id} already exists")
        if allow_overwrite and not exists:
            raise SceneNotFoundError(f"Scene {scene.id} not found")

        # Prepare storage form
        storage_data = {
            "id": scene.id,
            "name": scene.name,
            "background": self._to_storage_form(scene.background),
            "layers": [
                {
                    **layer.model_dump(exclude={"src"}),
                    "src": self._to_storage_form(layer.src),
                }
                for layer in scene.layers
            ],
        }

        # Atomic write
        tmp_file = self.scenes_dir / f"{scene.id}.json.tmp"
        self.scenes_dir.mkdir(parents=True, exist_ok=True)
        with tmp_file.open("w", encoding="utf-8") as f:
            json.dump(storage_data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        os.replace(tmp_file, scene_file)

        return self.load_scene(scene.id)  # Return loaded version with static URLs

    def delete_scene(self, scene_id: str) -> None:
        """
        Delete a scene definition.

        Args:
            scene_id: The ID of the scene to delete.

        Raises:
            SceneNotFoundError: If the scene file does not exist.
        """
        scene_file = self.scenes_dir / f"{scene_id}.json"
        if not scene_file.exists():
            raise SceneNotFoundError(f"Scene {scene_id} not found")

        scene_file.unlink()

    def list_image_assets(self) -> list[AssetEntry]:
        """
        List all available image assets.

        Returns:
            A list of AssetEntry objects.
        """
        return self._list_assets(self.images_dir, "image", self.IMAGE_EXTENSIONS)

    def list_video_assets(self) -> list[AssetEntry]:
        """
        List all available video assets.

        Returns:
            A list of AssetEntry objects.
        """
        return self._list_assets(self.video_dir, "video", self.VIDEO_EXTENSIONS)

    def _list_assets(self, directory: Path, kind: Literal["image", "video"], extensions: set[str]) -> list[AssetEntry]:
        if not directory.exists():
            return []

        assets: list[AssetEntry] = []
        for entry in directory.iterdir():
            if entry.is_file() and entry.suffix.lower() in extensions:
                assets.append(
                    AssetEntry(
                        name=entry.name,
                        url=self._to_static_url(entry.name),
                        size_bytes=entry.stat().st_size,
                        kind=kind,
                    )
                )

        return sorted(assets, key=lambda a: a.name.lower())

    def _to_storage_form(self, asset_url: str) -> str:
        """
        Convert a static URL back to a short storage path.

        Args:
            asset_url: The browser-accessible static URL.

        Returns:
            The short asset path for storage.
        """
        for prefix in ["/static/assets/images/", "/static/assets/video/", "/static/assets/"]:
            if asset_url.startswith(prefix):
                return asset_url[len(prefix) :]
        return asset_url

    def _parse_layer(self, layer: Any) -> SceneLayer:
        """
        Convert a raw JSON layer entry into a SceneLayer model.

        Supports one-shot migration from legacy 'transform' and 'filter' keys.

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

        # Base attributes
        data = {
            "src": self._to_static_url(src),
            "type": resolved_type,
            "opacity": layer.get("opacity", 1.0),
            "brightness": layer.get("brightness", 1.0),
            "grayscale": layer.get("grayscale", 0.0),
            "blur": layer.get("blur", 0.0),
            "flip": layer.get("flip", False),
            "blend_mode": layer.get("blend_mode", "normal"),
        }

        # Legacy migration: transform
        if "transform" in layer:
            transform = layer["transform"]
            if transform == "scaleX(-1)":
                data["flip"] = True
            elif transform and transform != "none":
                import logging
                logging.warning(f"Could not migrate legacy transform: {transform}")

        # Legacy migration: filter
        if "filter" in layer:
            filter_str = layer["filter"]
            if filter_str and filter_str != "none":
                import re
                
                # blur(Npx)
                blur_match = re.search(r"blur\((\d+(?:\.\d+)?)px\)", filter_str)
                if blur_match:
                    data["blur"] = float(blur_match.group(1))
                
                # brightness(N)
                bright_match = re.search(r"brightness\((\d+(?:\.\d+)?)\)", filter_str)
                if bright_match:
                    data["brightness"] = float(bright_match.group(1))
                
                # grayscale(N)
                gray_match = re.search(r"grayscale\((\d+(?:\.\d+)?)\)", filter_str)
                if gray_match:
                    data["grayscale"] = float(gray_match.group(1))
                
                # Log what we couldn't migrate
                known_patterns = [r"blur\(.*?\)", r"brightness\(.*?\)", r"grayscale\(.*?\)"]
                remaining = filter_str
                for pattern in known_patterns:
                    remaining = re.sub(pattern, "", remaining).strip()
                
                if remaining:
                    import logging
                    logging.warning(f"Could not migrate legacy filter components: {remaining}")

        return SceneLayer(**data)

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