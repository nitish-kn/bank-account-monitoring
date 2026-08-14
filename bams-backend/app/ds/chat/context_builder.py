from ...models.chat_message import ChatMessage
from .config import MAX_HISTORY_MESSAGES


def build_input_messages(history: list[ChatMessage]) -> list[dict]:
    """Converts persisted chat history (including the just-saved latest user
    message) into Responses API input items.

    v1 truncation: keep the most recent MAX_HISTORY_MESSAGES verbatim, no
    summarization. The antecedent for a short follow-up question ("and last
    month?") is almost always within the last couple of turns, so a generous
    verbatim window covers it without needing a rolling-summary mechanism in
    this milestone.
    """
    recent_history = history[-MAX_HISTORY_MESSAGES:]
    return [{"role": message.role, "content": message.content} for message in recent_history]
