from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from app.core.config import settings

router = APIRouter()
templates = Jinja2Templates(directory=str(settings.templates_dir))


@router.get("/", response_class=JSONResponse)
async def root() -> dict:
    """
    Return a basic health-style response for the application root.

    Returns:
        A small JSON payload describing the application and available pages.
    """
    return {
        "name": settings.app_name,
        "status": "ok",
        "routes": ["/gm", "/display"],
    }


@router.get("/gm", response_class=HTMLResponse)
async def gm_page(request: Request) -> HTMLResponse:
    """
    Render the Game Master control page.

    Args:
        request: The active HTTP request.

    Returns:
        The rendered GM page HTML response.
    """
    return templates.TemplateResponse("gm.html", {"request": request})


@router.get("/display", response_class=HTMLResponse)
async def display_page(request: Request) -> HTMLResponse:
    """
    Render the display page used for the streamed output.

    Args:
        request: The active HTTP request.

    Returns:
        The rendered display page HTML response.
    """
    return templates.TemplateResponse("display.html", {"request": request})