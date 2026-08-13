from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.dependencies import get_current_user
from ..database import get_db
from ..models.user import User
from ..services.chat_service import (
    create_session,
    delete_session,
    dev_send_message,
    get_session,
    get_session_messages,
    list_sessions,
    post_user_message,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None


class PostMessageRequest(BaseModel):
    message: str


class DevMessageRequest(BaseModel):
    user_id: int
    message: str
    session_id: Optional[str] = None


@router.post("/sessions")
def create_chat_session(
    req: CreateSessionRequest = CreateSessionRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_session(db, current_user.id, req.title)


@router.get("/sessions")
def list_chat_sessions(
    page: int = 1,
    pageSize: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_sessions(db, current_user.id, page, pageSize)


@router.get("/sessions/{session_id}")
def get_chat_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_session(db, current_user.id, session_id)


@router.get("/sessions/{session_id}/messages")
def list_chat_messages(
    session_id: str,
    page: int = 1,
    pageSize: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_session_messages(db, current_user.id, session_id, page, pageSize)


@router.post("/sessions/{session_id}/messages")
def send_chat_message(
    session_id: str,
    req: PostMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return post_user_message(db, current_user.id, session_id, req.message)


# --- Testing convenience only: no auth, pass any real user_id directly. ---
# --- Do not expose this beyond local/dev use.                           ---
@router.post("/dev/message")
def dev_send_chat_message(req: DevMessageRequest, db: Session = Depends(get_db)):
    """Send a chat message without going through JWT auth or a separate
    session-creation call -- creates a session automatically if session_id
    is omitted, and returns it in the response so you can keep the
    conversation going in a follow-up call."""
    return dev_send_message(db, req.user_id, req.message, req.session_id)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_chat_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_session(db, current_user.id, session_id)
    return Response(status_code=204)
