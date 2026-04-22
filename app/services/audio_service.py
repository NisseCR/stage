from pathlib import Path


class AudioService:
    """
    Handle audio file discovery for music playlists and ambience folders.

    Music is expected to be stored as MP3 files and ambience as OGG files.
    """

    def __init__(self, music_dir: Path, ambience_dir: Path) -> None:
        self.music_dir = music_dir
        self.ambience_dir = ambience_dir

    def list_playlist_folders(self) -> list[Path]:
        """
        List available music playlist folders.

        Returns:
            A list of playlist directories.
        """
        if not self.music_dir.exists():
            return []

        return [path for path in self.music_dir.iterdir() if path.is_dir()]

    def list_ambience_folders(self) -> list[Path]:
        """
        List available ambience category folders.

        Returns:
            A list of ambience category directories.
        """
        if not self.ambience_dir.exists():
            return []

        return [path for path in self.ambience_dir.iterdir() if path.is_dir()]