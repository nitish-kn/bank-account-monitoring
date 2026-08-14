import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..ds.chat.config import MAX_HISTORY_MESSAGES
from ..ds.chat.orchestrator import run_chat_turn
from ..ds.chat.schemas.chat_dto import ToolContext
from ..models.chat_message import ChatMessage
from ..models.chat_session import ChatSession
from ..models.chat_tool_call import ChatToolCall


def _session_to_dict(session: ChatSession) -> dict:
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
        "last_message_at": session.last_message_at.isoformat() if session.last_message_at else None,
    }


def _message_to_dict(message: ChatMessage) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "tool_calls": message.tool_calls or [],
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def _get_owned_session(db: Session, user_id: int, session_id: str) -> ChatSession:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
        .first()
    )
    if not session:
        # 404, never 403 -- doesn't confirm to the caller that a session with
        # this id exists at all if it belongs to someone else.
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return session


def create_session(db: Session, user_id: int, title: str | None = None) -> dict:
    session = ChatSession(id=str(uuid.uuid4()), user_id=user_id, title=title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_to_dict(session)


def list_sessions(db: Session, user_id: int, page: int = 1, page_size: int = 20) -> dict:
    safe_page = max(int(page or 1), 1)
    safe_page_size = min(max(int(page_size or 20), 1), 100)

    query = db.query(ChatSession).filter(ChatSession.user_id == user_id)
    total_count = query.count()
    sessions = (
        query.order_by(ChatSession.last_message_at.desc().nulls_last(), ChatSession.created_at.desc())
        .offset((safe_page - 1) * safe_page_size)
        .limit(safe_page_size)
        .all()
    )

    return {"sessions": [_session_to_dict(s) for s in sessions], "totalCount": total_count}


def get_session(db: Session, user_id: int, session_id: str) -> dict:
    return _session_to_dict(_get_owned_session(db, user_id, session_id))


def get_session_messages(db: Session, user_id: int, session_id: str, page: int = 1, page_size: int = 50) -> dict:
    _get_owned_session(db, user_id, session_id)

    safe_page = max(int(page or 1), 1)
    safe_page_size = min(max(int(page_size or 50), 1), 200)

    query = db.query(ChatMessage).filter(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id)
    total_count = query.count()
    messages = (
        query.order_by(ChatMessage.created_at.asc())
        .offset((safe_page - 1) * safe_page_size)
        .limit(safe_page_size)
        .all()
    )

    return {"messages": [_message_to_dict(m) for m in messages], "totalCount": total_count}


def delete_session(db: Session, user_id: int, session_id: str) -> None:
    session = _get_owned_session(db, user_id, session_id)
    db.delete(session)
    db.commit()


def dev_send_message(db: Session, user_id: int, message: str, session_id: str | None = None) -> dict:
    """Testing convenience: sends a message without requiring a session to
    already exist -- creates one automatically when session_id is omitted.
    Used only by the no-auth /api/chat/dev/message route; do not call this
    from any authenticated path."""
    if not session_id:
        session_id = create_session(db, user_id)["id"]
    else:
        _get_owned_session(db, user_id, session_id)

    return post_user_message(db, user_id, session_id, message)


def post_user_message(db: Session, user_id: int, session_id: str, message: str) -> dict:
    session = _get_owned_session(db, user_id, session_id)

    # Persist the user's message before calling the LLM at all, so the turn
    # survives an OpenAI failure rather than losing what was asked.
    user_message = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        user_id=user_id,
        role="user",
        content=message,
    )
    db.add(user_message)
    db.commit()

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id, ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY_MESSAGES)
        .all()
    )
    history.reverse()

    ctx = ToolContext(db=db, user_id=user_id)
    turn_result = run_chat_turn(ctx, history)

    assistant_message = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        user_id=user_id,
        role="assistant",
        content=turn_result.content,
        tool_calls=[
            {"tool_name": call["tool_name"], "cached": call["cache_hit"]}
            for call in turn_result.tool_calls
        ],
    )
    db.add(assistant_message)
    db.flush()  # assigns assistant_message.id's row before ChatToolCall FKs reference it

    for call in turn_result.tool_calls:
        db.add(
            ChatToolCall(
                id=call["id"],
                message_id=assistant_message.id,
                session_id=session.id,
                user_id=user_id,
                tool_name=call["tool_name"],
                arguments=call["arguments"],
                result=call["result"],
                cache_hit=call["cache_hit"],
                latency_ms=call["latency_ms"],
                error=call["error"],
            )
        )

    session.last_message_at = datetime.now(timezone.utc)
    if not session.title:
        session.title = message.strip()[:80]

    db.commit()
    db.refresh(assistant_message)

    return {
        "session": _session_to_dict(session),
        "message": _message_to_dict(assistant_message),
        "tool_calls_used": len(turn_result.tool_calls),
    }
