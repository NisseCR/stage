import pytest
from pathlib import Path
from app.services.art_service import ArtService

@pytest.fixture
def temp_art_dir(tmp_path):
    art_dir = tmp_path / "art"
    art_dir.mkdir()
    
    # Root level art
    (art_dir / "root-image.png").write_text("dummy")
    
    # NPCs category
    npcs_dir = art_dir / "NPCs"
    npcs_dir.mkdir()
    (npcs_dir / "elara.jpg").write_text("dummy")
    (npcs_dir / "blacksmith.webp").write_text("dummy")
    
    # Nested category
    maps_dir = art_dir / "Maps"
    maps_dir.mkdir()
    dungeons_dir = maps_dir / "Dungeons"
    dungeons_dir.mkdir()
    (dungeons_dir / "ruined-temple.png").write_text("dummy")
    
    # Unsupported file
    (art_dir / "notes.txt").write_text("dummy")
    
    return art_dir

def test_art_library_discovery(temp_art_dir):
    service = ArtService(temp_art_dir)
    library = service.scan_art_library()
    
    # Should find 4 images
    assert len(library) == 4
    
    # Check root image
    root_img = next(item for item in library if item.id == "root-image.png")
    assert root_img.name == "Root Image"
    assert root_img.category == "Art"
    assert root_img.src == "/static/assets/art/root-image.png"
    
    # Check NPC images
    elara = next(item for item in library if item.id == "NPCs/elara.jpg")
    assert elara.name == "Elara"
    assert elara.category == "Npcs"
    assert elara.src == "/static/assets/art/NPCs/elara.jpg"
    
    # Check nested images
    temple = next(item for item in library if item.id == "Maps/Dungeons/ruined-temple.png")
    assert temple.name == "Ruined Temple"
    assert temple.category == "Maps / Dungeons"
    assert temple.src == "/static/assets/art/Maps/Dungeons/ruined-temple.png"

def test_art_library_sorting(temp_art_dir):
    service = ArtService(temp_art_dir)
    library = service.scan_art_library()
    
    # Sorted by category then name
    # Categories: "Art", "Maps / Dungeons", "Npcs"
    assert library[0].category == "Art"
    assert library[1].category == "Maps / Dungeons"
    assert library[2].category == "Npcs"
    assert library[3].category == "Npcs"
    
    # Within Npcs: "Blacksmith", "Elara"
    assert library[2].name == "Blacksmith"
    assert library[3].name == "Elara"

def test_art_library_unsupported_ignored(temp_art_dir):
    service = ArtService(temp_art_dir)
    library = service.scan_art_library()
    
    # "notes.txt" should not be in the library
    assert not any(item.id == "notes.txt" for item in library)
