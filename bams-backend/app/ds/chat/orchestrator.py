import json
import uuid

from ...models.chat_message import ChatMessage
from .config import MAX_TOOL_HOPS
from .context_builder import build_input_messages
from .llm_client import create_response
from .prompts import SYSTEM_PROMPT
from .schemas.chat_dto import AgentTurnResult, ToolContext
from .tools import TOOL_SPECS
from .tools.base import run_tool

FALLBACK_MESSAGE = (
    "I wasn't able to fully answer that within the allowed number of lookups. "
    "Could you narrow the question down (e.g. a specific account or date range)?"
)


def run_chat_turn(ctx: ToolContext, history: list[ChatMessage]) -> AgentTurnResult:
    """Runs one full agent turn: calls the model, executes any tool calls it
    requests (chaining up to MAX_TOOL_HOPS round-trips), and returns the
    final answer plus a record of every tool call made along the way."""
    input_items = build_input_messages(history)
    tool_call_records: list[dict] = []

    for _hop in range(MAX_TOOL_HOPS):
        response = create_response(SYSTEM_PROMPT, input_items, TOOL_SPECS)

        function_calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]

        if not function_calls:
            content = getattr(response, "output_text", "") or ""
            return AgentTurnResult(content=content.strip(), tool_calls=tool_call_records)

        for call in function_calls:
            input_items.append(
                {
                    "type": "function_call",
                    "call_id": call.call_id,
                    "name": call.name,
                    "arguments": call.arguments,
                }
            )

            try:
                arguments = json.loads(call.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}

            result, cache_hit, latency_ms = run_tool(ctx, call.name, arguments)

            tool_call_records.append(
                {
                    "id": str(uuid.uuid4()),
                    "tool_name": call.name,
                    "arguments": arguments,
                    "result": result,
                    "cache_hit": cache_hit,
                    "latency_ms": latency_ms,
                    "error": result.get("error") if isinstance(result, dict) else None,
                }
            )

            input_items.append(
                {
                    "type": "function_call_output",
                    "call_id": call.call_id,
                    "output": json.dumps(result),
                }
            )

    return AgentTurnResult(content=FALLBACK_MESSAGE, tool_calls=tool_call_records)
