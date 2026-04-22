from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

from app.core.config import settings
from app.models.state import AppState
from app.schemas.api import LibraryResponse, RootResponse, StateResponse
from app.schemas.events import (
    ActiveAmbience,
    ActivePlaylist,
    ActiveScene,
    AmbienceUpdateRequest,
    FadeUpdateRequest,
    MusicUpdateRequest,
    SceneUpdateRequest,
    VolumeUpdateRequest,
)

router = APIRouter()
templates = Jinja2Templates(directory=str(settings.templates_dir))


@router.get("/", response_model=RootResponse)
async def root() -> RootResponse:
    """
    Return a basic health-style response for the application root.

    Returns:
        A small payload describing the application and available pages.
    """
    return RootResponse(
        name=settings.app_name,
        status="ok",
        routes=["/gm", "/display"],
    )


@router.get("/gm", response_class=HTMLResponse)
async def gm_page(request: Request) -> HTMLResponse:
    """
    Render the Game Master control page.

    Args:
        request: The active HTTP request.

    Returns:
        The rendered GM page HTML response.
    """
    return templates.TemplateResponse(
        request=request,
        name="gm.html",
        context={},
    )


@router.get("/display", response_class=HTMLResponse)
async def display_page(request: Request) -> HTMLResponse:
    """
    Render the display page used for the streamed output.

    Args:
        request: The active HTTP request.

    Returns:
        The rendered display page HTML response.
    """
    return templates.TemplateResponse(
        request=request,
        name="display.html",
        context={},
    )


@router.get("/events")
async def event_stream(request: Request):
    """
    Stream live application events to connected clients.

    Returns:
        An SSE response stream.
    """
    event_service = request.app.state.event_service

    async def generator():
        yield f"event: state_snapshot\ndata: {request.app.state.app_state.model_dump_json()}\n\n"
        async for message in event_service.connect():
            yield message

    return StreamingResponse(generator(), media_type="text/event-stream")


@router.get("/api/state", response_model=StateResponse)
async def get_state(request: Request) -> StateResponse:
    """
    Return the current live application state.

    Args:
        request: The active HTTP request.

    Returns:
        The shared app state.
    """
    return request.app.state.app_state


@router.get("/api/library", response_model=LibraryResponse)
async def get_library(request: Request) -> LibraryResponse:
    """
    Return the discovered scene and audio library data.

    Args:
        request: The active HTTP request.

    Returns:
        The music, ambience, and scene catalogs.
    """
    return LibraryResponse(
        music_playlists=request.app.state.music_playlists,
        ambience_folders=request.app.state.ambience_folders,
        scenes=request.app.state.scenes,
    )


@router.post("/api/state/scene", response_model=StateResponse)
async def set_scene(request: Request, body: SceneUpdateRequest) -> StateResponse:
    """
    Update the current scene and broadcast the change.
    """
    request.app.state.app_state.current_scene = (
        ActiveScene(scene_id=body.scene_id)
        if body.scene_id is not None
        else None
    )

    await request.app.state.event_service.broadcast(
        "scene_changed",
        {
            "scene": (
                request.app.state.app_state.current_scene.model_dump()
                if request.app.state.app_state.current_scene
                else None
            ),
        },
    )
    return request.app.state.app_state


@router.post("/api/state/music", response_model=StateResponse)
async def set_music(request: Request, body: MusicUpdateRequest) -> StateResponse:
    """
    Update the current music playlist and broadcast the change.
    """
    request.app.state.app_state.current_music_playlist = (
        ActivePlaylist(playlist_id=body.music_playlist, volume=1.0)
        if body.music_playlist is not None
        else None
    )

    await request.app.state.event_service.broadcast(
        "music_changed",
        {
            "music_playlist": (
                request.app.state.app_state.current_music_playlist.model_dump()
                if request.app.state.app_state.current_music_playlist
                else None
            ),
        },
    )
    return request.app.state.app_state


@router.post("/api/state/ambience", response_model=StateResponse)
async def set_ambience(request: Request, body: AmbienceUpdateRequest) -> StateResponse:
    """
    Update the active ambience map and broadcast the change.
    """
    request.app.state.app_state.active_ambiences = body.active_ambiences

    await request.app.state.event_service.broadcast(
        "ambience_changed",
        {
            "active_ambiences": {
                ambience_id: ambience.model_dump()
                for ambience_id, ambience in request.app.state.app_state.active_ambiences.items()
            },
        },
    )
    return request.app.state.app_state


@router.post("/api/state/fade", response_model=StateResponse)
async def set_fade_settings(request: Request, body: FadeUpdateRequest) -> StateResponse:
    """
    Update fade settings and broadcast the change.
    """
    request.app.state.app_state.fade_settings = body.fade_settings
    await request.app.state.event_service.broadcast(
        "fade_settings_changed",
        {"fade_settings": body.fade_settings},
    )
    return request.app.state.app_state


@router.post("/api/state/volume", response_model=StateResponse)
async def set_volumes(request: Request, body: VolumeUpdateRequest) -> StateResponse:
    """
    Update runtime volumes for the selected music playlist and active ambience items.
    """
    if request.app.state.app_state.current_music_playlist is not None:
        request.app.state.app_state.current_music_playlist.volume = body.music_volume

    for ambience_id, volume in body.ambience_volumes.items():
        if ambience_id in request.app.state.app_state.active_ambiences:
            request.app.state.app_state.active_ambiences[ambience_id].volume = volume

    await request.app.state.event_service.broadcast(
        "volume_changed",
        {
            "music_playlist": (
                request.app.state.app_state.current_music_playlist.model_dump()
                if request.app.state.app_state.current_music_playlist
                else None
            ),
            "active_ambiences": {
                ambience_id: ambience.model_dump()
                for ambience_id, ambience in request.app.state.app_state.active_ambiences.items()
            },
        },
    )
    return request.app.state.app_state