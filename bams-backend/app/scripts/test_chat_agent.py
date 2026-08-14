"""
Manual, throwaway test script for the agentic chat layer backend milestone.
Not wired into CI -- run by hand against a live `uvicorn app.main:app` instance.

Exercises: session lifecycle, a spread of basic/medium/complex queries across
one session (including follow-ups that depend on prior turns), cross-user
session isolation, and the chat_tool_calls debug/cache log.

Usage (from bams-backend/, with the server already running):
    .venv/Scripts/python -m app.scripts.test_chat_agent
"""

import sys
import uuid

import requests

from ..core.auth import create_access_token
from ..database import SessionLocal
from ..models.chat_tool_call import ChatToolCall
from ..models.user import User

BASE_URL = "http://127.0.0.1:8000"


def _token_for(user_id: int) -> str:
    return create_access_token({"sub": str(user_id)})


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _print_step(label: str) -> None:
    print(f"\n=== {label} ===")


def _ask(session_id: str, token: str, message: str) -> dict:
    print(f"> {message}")
    resp = requests.post(
        f"{BASE_URL}/api/chat/sessions/{session_id}/messages",
        json={"message": message},
        headers=_headers(token),
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"< {data['message']['content']}")
    tool_names = [t["tool_name"] for t in data["message"].get("tool_calls", [])]
    if tool_names:
        print(f"  (tools used: {tool_names})")
    return data


def main() -> None:
    db = SessionLocal()
    primary_user = db.query(User).order_by(User.id.asc()).first()
    if not primary_user:
        print("No users in the database -- nothing to test against.")
        sys.exit(1)

    print(f"Testing as user_id={primary_user.id} ({primary_user.email})")
    token = _token_for(primary_user.id)

    # --- Session lifecycle -------------------------------------------------
    _print_step("Session lifecycle")
    resp = requests.post(f"{BASE_URL}/api/chat/sessions", json={}, headers=_headers(token))
    resp.raise_for_status()
    session = resp.json()
    session_id = session["id"]
    print("Created session:", session_id)

    resp = requests.get(f"{BASE_URL}/api/chat/sessions", headers=_headers(token))
    resp.raise_for_status()
    assert any(s["id"] == session_id for s in resp.json()["sessions"]), "new session missing from list"
    print("Session appears in list: OK")

    resp = requests.get(f"{BASE_URL}/api/chat/sessions/{session_id}", headers=_headers(token))
    resp.raise_for_status()
    print("Get owned session: OK")

    resp = requests.get(f"{BASE_URL}/api/chat/sessions/{uuid.uuid4()}", headers=_headers(token))
    assert resp.status_code == 404, f"expected 404 for unknown session id, got {resp.status_code}"
    print("Get unknown session -> 404: OK")

    # --- Basic tier: balance, as-of follow-up, recent transactions ---------
    _print_step("Basic queries")
    _ask(session_id, token, "List my bank accounts.")
    _ask(session_id, token, "What's the current balance on my first Axis Bank account?")
    _ask(session_id, token, "And what was it as of a month ago?")
    _ask(session_id, token, "Show me the last 5 transactions on it.")

    # --- Medium tier: category/mode breakdown, dashboard summary -----------
    _print_step("Medium queries")
    _ask(session_id, token, "How much did I spend in total this year?")
    _ask(session_id, token, "Break that down by category.")
    _ask(session_id, token, "Give me the full dashboard summary for this year.")

    # --- Complex tier: balance drop, period comparison, multi-account ------
    _print_step("Complex queries")
    _ask(session_id, token, "Which of my accounts had the biggest balance drop this year?")
    _ask(session_id, token, "Compare my spend this year vs an equivalent earlier period.")

    # --- Ambiguous question: should ask for clarification, not hallucinate -
    _print_step("Ambiguous question handling")
    _ask(session_id, token, "What's my card balance?")

    # --- Cross-user isolation -----------------------------------------------
    _print_step("Cross-user isolation")
    other_user = User(
        google_id=f"chat-test-{uuid.uuid4()}",
        email=f"chat-test-{uuid.uuid4()}@example.invalid",
        name="Chat Test Isolation User",
    )
    db.add(other_user)
    db.commit()
    db.refresh(other_user)
    other_token = _token_for(other_user.id)

    try:
        resp = requests.get(f"{BASE_URL}/api/chat/sessions/{session_id}", headers=_headers(other_token))
        assert resp.status_code == 404, f"expected 404 leaking session across users, got {resp.status_code}"
        print("Foreign GET session -> 404: OK")

        resp = requests.post(
            f"{BASE_URL}/api/chat/sessions/{session_id}/messages",
            json={"message": "leak test"},
            headers=_headers(other_token),
        )
        assert resp.status_code == 404, f"expected 404 posting into another user's session, got {resp.status_code}"
        print("Foreign POST message -> 404: OK")
    finally:
        db.delete(other_user)
        db.commit()

    # --- Debug/replay + cache check -----------------------------------------
    _print_step("chat_tool_calls debug log + cache check")
    logged = (
        db.query(ChatToolCall)
        .filter(ChatToolCall.session_id == session_id)
        .order_by(ChatToolCall.created_at.asc())
        .all()
    )
    print(f"Logged {len(logged)} tool calls for this session:")
    for row in logged:
        print(f"  - {row.tool_name} cache_hit={row.cache_hit} latency_ms={row.latency_ms} error={row.error}")

    if any(row.cache_hit for row in logged):
        print("At least one cache hit observed: OK")
    else:
        print("No cache hits observed (may be expected if no repeated identical calls occurred).")

    db.close()
    print("\nAll checks completed.")


if __name__ == "__main__":
    main()
