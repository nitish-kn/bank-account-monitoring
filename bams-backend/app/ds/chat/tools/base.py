"""Tool registration + execution.

Every tool is registered here via @tool(...), which is also where the
per-org cache key is built (tools never build their own cache key) and
where a tool's JSON-schema `parameters` block is generated -- since that
schema never includes a org_id field, there is no argument the model could
be prompted into supplying that would let a tool call reach another org's
data.
"""

from __future__ import annotations

import json
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Callable

from pydantic import BaseModel, ValidationError

from ..cache import cache_get, cache_set
from ..schemas.chat_dto import ToolContext

TOOL_SPECS: list[dict] = []
TOOL_IMPL: dict[str, Callable] = {}
TOOL_PARAMS_MODEL: dict[str, type[BaseModel]] = {}
TOOL_CACHE_TIER: dict[str, str | None] = {}


class ToolError(Exception):
    """Raised by a tool implementation for an expected, org-facing failure
    (e.g. "no account found") -- caught here and turned into a normal
    {"error": ...} result so the model can react within the conversation
    instead of the turn crashing."""


def tool(name: str, description: str, params_model: type[BaseModel], cache_tier: str | None = None):
    def decorator(func: Callable):
        schema = params_model.model_json_schema()
        schema.pop("title", None)
        for prop in schema.get("properties", {}).values():
            prop.pop("title", None)
        schema.setdefault("additionalProperties", False)

        TOOL_SPECS.append(
            {
                "type": "function",
                "name": name,
                "description": description,
                "parameters": schema,
                # Strict mode requires every property to be in "required" (optional
                # fields modeled as nullable unions instead of omission) -- our
                # params models use plain Optional-with-default fields instead, so
                # strict validation stays off rather than hand-rewriting every schema.
                "strict": False,
            }
        )
        TOOL_IMPL[name] = func
        TOOL_PARAMS_MODEL[name] = params_model
        TOOL_CACHE_TIER[name] = cache_tier
        return func

    return decorator


def _json_safe(value):
    """Tool implementations return service-layer dicts as-is, which can
    contain Decimal/datetime values (see accounts_service/transaction_service).
    Those aren't JSON-serializable, but tool results get json.dumps'd for the
    model and stored in a JSONB column, so normalize recursively before either."""
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _cache_key(tool_name: str, org_id: int, arguments: dict) -> str:
    canonical = json.dumps(arguments, sort_keys=True, separators=(",", ":"), default=str)
    return f"{tool_name}:{org_id}:{canonical}"


def validate_arguments(tool_name: str, raw_arguments: dict) -> dict:
    params_model = TOOL_PARAMS_MODEL[tool_name]
    validated = params_model.model_validate(raw_arguments or {})
    return validated.model_dump(exclude_none=True)


def run_tool(ctx: ToolContext, tool_name: str, arguments: dict) -> tuple[dict, bool, int]:
    """Validates + executes a tool, applying its cache tier if any. Returns
    (result, cache_hit, latency_ms). Never raises -- any failure (bad
    arguments, unknown tool, tool exception) comes back as a JSON-safe
    {"error": ...} result dict."""
    start = time.monotonic()

    if tool_name not in TOOL_IMPL:
        return {"error": f"Unknown tool: {tool_name}"}, False, int((time.monotonic() - start) * 1000)

    try:
        validated_args = validate_arguments(tool_name, arguments)
    except ValidationError as exc:
        return {"error": f"Invalid arguments: {exc.errors()}"}, False, int((time.monotonic() - start) * 1000)

    cache_tier = TOOL_CACHE_TIER.get(tool_name)
    cache_key = _cache_key(tool_name, ctx.org_id, validated_args) if cache_tier else None

    if cache_tier:
        cached = cache_get(cache_tier, cache_key)
        if cached is not None:
            return cached, True, int((time.monotonic() - start) * 1000)

    try:
        result = _json_safe(TOOL_IMPL[tool_name](ctx, **validated_args))
    except ToolError as exc:
        result = {"error": str(exc)}
    except Exception as exc:  # a tool implementation must never crash the turn
        result = {"error": f"Tool '{tool_name}' failed: {exc}"}

    if cache_tier and isinstance(result, dict) and "error" not in result:
        cache_set(cache_tier, cache_key, result)

    return result, False, int((time.monotonic() - start) * 1000)
