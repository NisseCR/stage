from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from app.core.config import settings
from app.models.library import SceneDefinition, AssetEntry
from app.models.state import AppState
from app.schemas.api import LibraryResponse, RootResponse, AppStateResponse
from app.schemas.events import AppStateSyncRequest
from app.services.scene_service import (
    SceneNotFoundError,
    SceneAlreadyExistsError,
    InvalidSceneIdError,
)

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


@router.get("/editor", response_class=HTMLResponse)
async def editor_list_page(request: Request) -> HTMLResponse:
    """
    Render the scene editor list page.
    """
    return templates.TemplateResponse(
        request=request,
        name="editor.html",
        context={"edit_mode": False},
    )


@router.get("/editor/new", response_class=HTMLResponse)
async def editor_new_page(request: Request) -> HTMLResponse:
    """
    Render the scene editor for a new scene.
    """
    return templates.TemplateResponse(
        request=request,
        name="editor.html",
        context={"edit_mode": True, "scene_id": "new"},
    )


@router.get("/editor/{scene_id}", response_class=HTMLResponse)
async def editor_edit_page(request: Request, scene_id: str) -> HTMLResponse:
    """
    Render the scene editor for an existing scene.
    """
    return templates.TemplateResponse(
        request=request,
        name="editor.html",
        context={"edit_mode": True, "scene_id": scene_id},
    )


@router.get("/editor/preview", response_class=HTMLResponse)
async def editor_preview_live_page(request: Request):
    """
    Render a live preview page for the scene editor (BroadcastChannel based).
    """
    return templates.TemplateResponse(
        request=request,
        name="editor_preview.html",
        context={},
    )


@router.get("/editor/{scene_id}/preview", response_class=HTMLResponse)
async def editor_preview_page(request: Request, scene_id: str):
    """
    Render a dedicated preview page for a scene.
    """
    return templates.TemplateResponse(
        request=request,
        name="editor_preview.html",
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


@router.get("/api/scenes", response_model=list[SceneDefinition])
async def list_scenes(request: Request) -> list[SceneDefinition]:
    """
    List all available scenes.
    """
    return request.app.state.scene_service.load_scenes()


@router.get("/api/scenes/{scene_id}", response_model=SceneDefinition)
async def get_scene(request: Request, scene_id: str) -> SceneDefinition:
    """
    Get a single scene by ID.
    """
    scene = request.app.state.scene_service.load_scene(scene_id)
    if scene is None:
        raise SceneNotFoundError(f"Scene {scene_id} not found")
    return scene


@router.post("/api/scenes", response_model=SceneDefinition, status_code=status.HTTP_201_CREATED)
async def create_scene(request: Request, scene: SceneDefinition) -> SceneDefinition:
    """
    Create a new scene.
    """
    return request.app.state.scene_service.save_scene(scene, allow_overwrite=False)


@router.put("/api/scenes/{scene_id}", response_model=SceneDefinition)
async def update_scene(request: Request, scene_id: str, scene: SceneDefinition) -> SceneDefinition:
    """
    Update an existing scene.
    """
    if scene_id != scene.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Path ID {scene_id} does not match body ID {scene.id}",
        )
    return request.app.state.scene_service.save_scene(scene, allow_overwrite=True)


@router.delete("/api/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scene(request: Request, scene_id: str):
    """
    Delete a scene.
    """
    request.app.state.scene_service.delete_scene(scene_id)


@router.get("/api/assets/images", response_model=list[AssetEntry])
async def list_images(request: Request) -> list[AssetEntry]:
    """
    List available image assets.
    """
    return request.app.state.scene_service.list_image_assets()


@router.get("/api/assets/videos", response_model=list[AssetEntry])
async def list_videos(request: Request) -> list[AssetEntry]:
    """
    List available video assets.
    """
    return request.app.state.scene_service.list_video_assets()


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
        art_library=request.app.state.art_library,
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
        art=body.art,
        show_debug=body.show_debug,
        fade_settings=body.fade_settings.model_dump(),
        volume_settings=body.volume_settings.model_dump(),
    )

    await request.app.state.event_service.broadcast(
        "state_updated",
        request.app.state.app_state.model_dump(),
    )
    return AppStateResponse.model_validate(request.app.state.app_state)