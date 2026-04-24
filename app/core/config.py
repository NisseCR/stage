from pathlib import Path


class Settings:
    def __init__(self) -> None:
        self.base_dir = Path(__file__).resolve().parents[2]
        self.app_name = "Paracosm"
        self.app_version = "0.1.0"

        self.static_dir = self.base_dir / "static"
        self.templates_dir = self.base_dir / "templates"

        self.assets_dir = self.static_dir / "assets"
        self.audio_dir = self.assets_dir / "audio"
        self.images_dir = self.assets_dir / "images"
        self.scenes_dir = self.base_dir / "data" / "scenes"
        self.video_dir = self.assets_dir / "video"


settings = Settings()