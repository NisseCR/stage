from pathlib import Path


class Settings:
    """
    Application configuration values.

    This keeps project-wide paths and metadata in one place so the rest of the
    application can stay clean and easy to change.
    """

    def __init__(self) -> None:
        self.base_dir = Path(__file__).resolve().parents[2]
        self.app_name = "Immersion"
        self.app_version = "0.1.0"
        self.static_dir = self.base_dir / "static"
        self.templates_dir = self.base_dir / "templates"


settings = Settings()