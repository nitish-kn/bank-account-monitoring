from dataclasses import dataclass, field

from sqlalchemy.orm import Session


@dataclass
class ToolContext:
    """Server-constructed, never model-suppliable. Built exactly once per
    turn from the authenticated org -- no tool's JSON schema exposes a
    org_id field, so there's no argument path for a tool call to target
    another org's data."""

    db: Session
    org_id: int


@dataclass
class AgentTurnResult:
    content: str
    tool_calls: list[dict] = field(default_factory=list)
