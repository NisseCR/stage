from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.web.routes import router as web_router


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application instance.

    Returns:
        A fully configured FastAPI application.
    """
    app = FastAPI(title=settings.app_name, version=settings.app_version)

    app.include_router(web_router)

    app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")

    return app