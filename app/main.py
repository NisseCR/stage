from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.models.state import AppState
from app.services.audio_service import AudioService
from app.services.event_service import EventService
from app.services.scene_service import SceneService
from app.web.routes import router as web_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize and tear down application resources.

    This runs once when the app starts and once when it shuts down.
    """
    audio_service: AudioService = AudioService(settings.audio_dir)
    scene_service: SceneService = SceneService(
        settings.images_dir,
        settings.video_dir,
        settings.scenes_dir,
    )

    app.state.app_state = AppState()
    app.state.event_service = EventService()
    app.state.audio_service = audio_service
    app.state.scene_service = scene_service
    app.state.music_playlists = [
        playlist.model_dump() for playlist in audio_service.scan_music_playlists()
    ]
    app.state.ambience_folders = [
        folder.model_dump() for folder in audio_service.scan_ambience_folders()
    ]
    app.state.scenes = [scene.model_dump() for scene in scene_service.load_scenes()]

    yield


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application instance.

    Returns:
        A fully configured FastAPI application.
    """
    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

    app.include_router(web_router)

    if settings.static_dir.exists():
        app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")

    return app