from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import feedback, forum, health, me, media, moderation, requests


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Coral Study API",
        version="0.1.0",
        description="Backend for the Coral Study peer homework-help platform",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(requests.router)
    app.include_router(feedback.router)
    app.include_router(forum.router)
    app.include_router(media.router)
    app.include_router(moderation.router)
    app.include_router(moderation.internal_router)

    return app


app = create_app()
