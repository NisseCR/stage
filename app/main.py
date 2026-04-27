from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.models.state import AppState
from app.services.art_service import ArtService
from app.services.audio_service import AudioService
from app.services.event_service import EventService
from app.services.scene_service import SceneService
from app.services.scene_service import (
    SceneNotFoundError,
    SceneAlreadyExistsError,
    InvalidSceneIdError,
)
from app.web.routes import router as web_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize and tear down application resources.

    This runs once when the app starts and once when it shuts down.
    """
    audio_service: AudioService = AudioService(settings.audio_dir)
    art_service: ArtService = ArtService(settings.art_dir)
    scene_service: SceneService = SceneService(
        settings.images_dir,
        settings.video_dir,
        settings.scenes_dir,
    )

    app.state.app_state = AppState()
    app.state.event_service = EventService()
    app.state.audio_service = audio_service
    app.state.art_service = art_service
    app.state.scene_service = scene_service
    app.state.music_playlists = [
        playlist.model_dump() for playlist in audio_service.scan_music_playlists()
    ]
    app.state.ambience_folders = [
        folder.model_dump() for folder in audio_service.scan_ambience_folders()
    ]
    app.state.art_library = [
        art.model_dump() for art in art_service.scan_art_library()
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

    @app.exception_handler(SceneNotFoundError)
    async def scene_not_found_handler(request: Request, exc: SceneNotFoundError):
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"message": str(exc)},
        )

    @app.exception_handler(SceneAlreadyExistsError)
    async def scene_already_exists_handler(request: Request, exc: SceneAlreadyExistsError):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"message": str(exc)},
        )

    @app.exception_handler(InvalidSceneIdError)
    async def invalid_scene_id_handler(request: Request, exc: InvalidSceneIdError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"message": str(exc)},
        )

    app.include_router(web_router)

    if settings.static_dir.exists():
        app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")

    return app