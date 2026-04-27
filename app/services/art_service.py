from pathlib import Path
from app.models.library import ArtItem

class ArtService:
    """
    Handle art handout discovery.
    """

    SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}

    def __init__(self, art_dir: Path) -> None:
        self.art_dir = art_dir

    def scan_art_library(self) -> list[ArtItem]:
        """
        Scan the art directory recursively for image handouts.

        Returns:
            A list of discovered art items.
        """
        if not self.art_dir.exists():
            return []

        art_items: list[ArtItem] = []

        # Use rglob for recursive scanning
        for ext in self.SUPPORTED_EXTENSIONS:
            for file_path in sorted(self.art_dir.rglob(f"*{ext}")):
                if not file_path.is_file():
                    continue

                # Relative path from art_dir for ID and category
                rel_path = file_path.relative_to(self.art_dir)
                
                # ID: NPCs/elara.png
                art_id = rel_path.as_posix()
                
                # Name: Elara (from elara.png)
                name = self._format_label(file_path.stem)
                
                # Category: Subfolder path or "Art"
                if len(rel_path.parts) > 1:
                    # e.g., Maps/Dungeons/ruined-temple.png -> "Maps / Dungeons"
                    category = " / ".join(self._format_label(p) for p in rel_path.parts[:-1])
                else:
                    category = "Art"
                
                # SRC: /static/assets/art/NPCs/elara.png
                src = f"/static/assets/art/{art_id}"

                art_items.append(
                    ArtItem(
                        id=art_id,
                        name=name,
                        src=src,
                        category=category,
                    )
                )

        # Sort by category then name
        art_items.sort(key=lambda x: (x.category, x.name))
        return art_items

    def _format_label(self, raw_name: str) -> str:
        """
        Convert a snake_case or kebab-case name into a UI-friendly title.
        """
        return raw_name.replace("_", " ").replace("-", " ").title()
