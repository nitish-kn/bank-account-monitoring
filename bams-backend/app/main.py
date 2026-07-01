from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, run_migrations
from . import models
from .routes import auth, family, gmail, invites, sheets, setup, statements
from fastapi.responses import FileResponse, JSONResponse
from fastapi import status
    
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIST_DIR = PROJECT_ROOT / "bams-frontend" / "dist"
FRONTEND_INDEX_FILE = FRONTEND_DIST_DIR / "index.html"
# Create tables
Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(family.router)
app.include_router(gmail.router)
app.include_router(invites.router)
app.include_router(sheets.router)
app.include_router(setup.router)
app.include_router(statements.router)


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint."""
    print(f"FRONTEND_INDEX_FILE: {FRONTEND_INDEX_FILE}")
    print(f"Project root: {PROJECT_ROOT}")

    if FRONTEND_INDEX_FILE.exists():
        return FileResponse(FRONTEND_INDEX_FILE)

    return {
        "message": f"Welcome to flodata",
        "version": "1.0",
        "docs": "/api/docs",
        "health": "/health"
    }


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    """Serve frontend build files and fall back to the SPA entrypoint."""
    if not FRONTEND_INDEX_FILE.exists():
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Frontend build not found. Run the client build first."},
        )

    requested_path = (FRONTEND_DIST_DIR / full_path).resolve()
    if FRONTEND_DIST_DIR.resolve() not in requested_path.parents and requested_path != FRONTEND_DIST_DIR.resolve():
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Not found"},
        )

    if requested_path.is_file():
        return FileResponse(requested_path)

    return FileResponse(FRONTEND_INDEX_FILE)


@app.get("/health")
def health_check():
    return {
        "message": "Health check endpoint working correctly",
        "status": "success"
    }

