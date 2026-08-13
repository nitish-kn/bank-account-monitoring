from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_database, check_connection
from . import models
from .routes import accounts, auth, chat, family, gmail, invites, sheets, setup, statements, transactions
from fastapi.responses import FileResponse, JSONResponse
from fastapi import status
from .core.constants import FRONTEND_DIST_DIR, FRONTEND_INDEX_FILE, PROJECT_ROOT

check_connection()
init_database()

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
app.include_router(transactions.router)
app.include_router(accounts.router)
app.include_router(chat.router)


# @app.get("/", tags=["Root"])
# async def root():
#     """Root endpoint."""
#     print(f"FRONTEND_INDEX_FILE: {FRONTEND_INDEX_FILE}")
#     print(f"Project root: {PROJECT_ROOT}")

#     if FRONTEND_INDEX_FILE.exists():
#         return FileResponse(FRONTEND_INDEX_FILE)

#     return {
#         "message": f"Welcome to flodata",
#         "version": "1.0",
#         "docs": "/api/docs",
#         "health": "/health"
#     }


# @app.get("/{full_path:path}", include_in_schema=False)
# async def serve_frontend(full_path: str):
#     """Serve frontend build files and fall back to the SPA entrypoint."""
#     if not FRONTEND_INDEX_FILE.exists():
#         return JSONResponse(
#             status_code=status.HTTP_404_NOT_FOUND,
#             content={"detail": "Frontend build not found. Run the client build first."},
#         )

#     requested_path = (FRONTEND_DIST_DIR / full_path).resolve()
#     if FRONTEND_DIST_DIR.resolve() not in requested_path.parents and requested_path != FRONTEND_DIST_DIR.resolve():
#         return JSONResponse(
#             status_code=status.HTTP_404_NOT_FOUND,
#             content={"detail": "Not found"},
#         )

#     if requested_path.is_file():
#         return FileResponse(requested_path)

#     return FileResponse(FRONTEND_INDEX_FILE)

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint."""
    return {
        "message": f"Welcome to flodata",
        "version": "1.0",
        "docs": "/api/docs",
        "health": "/health"
    }


@app.get("/health")
def health_check():
    return {
        "message": "Health check endpoint working correctly",
        "status": "success"
    }

