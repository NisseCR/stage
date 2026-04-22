from pathlib import Path
from typing import Any


class SceneService:
    """
    Handle scene discovery and scene metadata loading.

    Scene definitions will later come from JSON files, while assets are stored
    under the static art directory.
    """

    def __init__(self, art_dir: Path, scenes_file: Path) -> None:
        self.art_dir = art_dir
        self.scenes_file = scenes_file

    def load_scenes(self) -> list[dict[str, Any]]:
        """
        Load scene definitions from the configured JSON file.

        Returns:
            A list of scene dictionaries, or an empty list if nothing is available.
        """
        if not self.scenes_file.exists():
            return []

        import json

        with self.scenes_file.open("r", encoding="utf-8") as file:
            return json.load(file)