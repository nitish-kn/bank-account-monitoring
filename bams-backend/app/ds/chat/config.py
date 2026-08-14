from ...config import settings

CHAT_MODEL_NAME = "gpt-5.4-mini"
OPENAI_API_KEY = settings.openai_api_key

# Safety cap on tool-call round-trips within a single turn, so a pathological
# tool-chaining loop can't run away with API cost.
MAX_TOOL_HOPS = 6

# How many past messages are fed back into the model as conversation history.
# Kept verbatim (no summarization, no weighting) -- see context_builder.py. Kept
# small deliberately: the most recent exchange should dominate what the model
# attends to, and a shorter window means less chance of an older, unrelated
# turn distracting it from the current question.
MAX_HISTORY_MESSAGES = 6
