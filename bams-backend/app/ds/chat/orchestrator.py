import json
import uuid

from ...models.chat_message import ChatMessage
from .config import MAX_TOOL_HOPS
from .context_builder import build_input_messages
from .llm_client import create_response
from .prompts import build_system_prompt
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
    system_prompt = build_system_prompt()

    for _hop in range(MAX_TOOL_HOPS):

        # print(f"INPUT ITEMS - {input_items}")
        # print(f"TOOL SPECS - {TOOL_SPECS}")

        response = create_response(system_prompt, input_items, TOOL_SPECS)

        # print(f"LLM RESPONSE - {response.output_text}")

        function_calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]

        # print(f"FUNCTION CALLS - {function_calls}")

        if not function_calls:
            content = getattr(response, "output_text", "") or ""
            final_resp = AgentTurnResult(content=content.strip(), tool_calls=tool_call_records)
            # print(f"FINAL RESPONE - {final_resp}")
            return final_resp

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

            # print("--------------TOOL RUNNING ---------")

            result, cache_hit, latency_ms = run_tool(ctx, call.name, arguments)

            # print(f"TOOL RESULTS - {result}")
            # print(f"CACHE - {cache_hit}")
            
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

    final_resp = AgentTurnResult(content=FALLBACK_MESSAGE, tool_calls=tool_call_records)
    # print(f"FINAL RESPONSE - {final_resp}")
    return final_resp
