from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

from app.core.config import settings
from app.models.state import AppState
from app.schemas.api import LibraryResponse, RootResponse, AppStateResponse
from app.schemas.events import AppStateSyncRequest

router = APIRouter()
templates = Jinja2Templates(directory=str(settings.templates_dir))


@router.get("/", response_class=HTMLResponse)
async def root(request: Request) -> HTMLResponse:
    """
    Render the home page.

    Args:
        request: The active HTTP request.

    Returns:
        The rendered home page HTML response.
    """
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={},
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


@router.get("/api/state", response_model=AppStateResponse)
async def get_state(request: Request) -> AppStateResponse:
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


@router.post("/api/state/sync", response_model=AppStateResponse)
async def sync_state(request: Request, body: AppStateSyncRequest) -> AppStateResponse:
    """
    Replace the current application state with a full synced state payload.

    Args:
        request: The active HTTP request.
        body: The full desired application state from the GM page.

    Returns:
        The canonical shared application state.
    """
    request.app.state.app_state = AppState(
        scene=body.scene,
        music=body.music,
        ambiences=body.ambiences,
        show_debug=body.show_debug,
        fade_settings=body.fade_settings.model_dump(),
    )

    await request.app.state.event_service.broadcast(
        "state_updated",
        request.app.state.app_state.model_dump(),
    )
    return AppStateResponse.model_validate(request.app.state.app_state)