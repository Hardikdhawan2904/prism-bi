"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.error_handlers import register_error_handlers
from app.api.routes import health, profile_runs, rule_suggestions


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()
    setup_logging(settings)

    app = FastAPI(
        title="Data Profiling Engine",
        description="Multi-Variance Analysis — Schema, Quality, Hierarchy, Readiness, and Chart Intelligence",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register error handlers
    register_error_handlers(app)

    # Register routers
    prefix = settings.api_prefix
    app.include_router(health.router, prefix=prefix)
    app.include_router(profile_runs.router, prefix=prefix)
    app.include_router(rule_suggestions.router, prefix=prefix)

    return app


app = create_app()
