import os
import re
from pathlib import Path

def to_kebab_case(name):
    # Remove extension for name conversion
    stem = Path(name).stem
    suffix = Path(name).suffix
    
    # Replace non-alphanumeric (except . and -) with space
    s = re.sub(r'[^a-zA-Z0-9\.]', ' ', stem)
    # Convert to lowercase and split into words
    words = s.lower().split()
    # Join with hyphens
    return '-'.join(words) + suffix.lower()

def rename_audio_files(base_dir):
    audio_dir = Path(base_dir)
    if not audio_dir.exists():
        print(f'Error: {audio_dir} does not exist')
        return

    for category_folder in audio_dir.iterdir():
        if not category_folder.is_dir():
            continue
        
        print(f'Processing category/playlist: {category_folder.name}')
        for track in category_folder.iterdir():
            if not track.is_file() or track.name == 'cover.jpg' or track.suffix.lower() not in {'.mp3', '.wav', '.ogg'}:
                continue
            
            new_name = to_kebab_case(track.name)
            if new_name != track.name:
                new_path = track.with_name(new_name)
                # On Windows, new_path.exists() is true if track exists but with different case
                if new_path.exists() and not track.samefile(new_path):
                    print(f'  Warning: {new_path} already exists, skipping {track.name}')
                else:
                    print(f'  Renaming: {track.name} -> {new_name}')
                    track.rename(new_path)

if __name__ == "__main__":
    rename_audio_files('../static/assets/audio/music')
    rename_audio_files('../static/assets/audio/ambience')
