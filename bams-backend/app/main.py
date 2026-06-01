from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, run_migrations
from . import models
from .routes import auth, family, gmail, invites, sheets, setup

# Create tables
Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # frontend URL
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

@app.get("/")
def root():
    return {
        "message": "root endpoint working correctly",
        "status": "success"
    }
