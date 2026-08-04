import asyncio
import hashlib
from pathlib import Path

from fastapi import HTTPException


def parse_statement_pdf_sync(pdf_path: Path, user_id: int) -> list[dict]:
    """Parse a statement PDF through the shared LLM statement function."""
    try:
        from ..ds.llm.main import process_statement
    except ModuleNotFoundError as error:
        missing_dependency = error.name or "PDF extraction dependency"
        raise HTTPException(
            status_code=500,
            detail=(
                f"Statement PDF extraction dependency missing: {missing_dependency}. "
                "Install backend PDF LLM dependencies from requirements.txt."
            ),
        ) from error

    return asyncio.run(process_statement(file_path=str(pdf_path), user_id=user_id))


def _fallback_reference(transaction: dict) -> str:
    raw_key = "|".join(
        str(transaction.get(field) or "").strip()
        for field in (
            "bank_name",
            "account_number",
            "txn_date",
            "txn_type",
            "amount",
            "balance_after_txn",
            "narration",
        )
    )
    return f"stmt_{hashlib.sha256(raw_key.encode('utf-8')).hexdigest()[:20]}"


def normalize_statement_transaction(
    transaction: dict,
    source_file: str,
    gmail_message_id: str | None = None,
    email_metadata: dict | None = None,
) -> dict:
    """Make statement parser output look like a parsed transaction."""

    normalized = dict(transaction or {})
    ref_number = str(normalized.get("ref_number") or "").strip() or _fallback_reference(normalized)
    parser_metadata = normalized.get("parser_metadata") or {}
    optional_fields = normalized.get("optional_fields") or None

    if hasattr(parser_metadata, "model_dump"):
        parser_metadata = parser_metadata.model_dump()

    parser_metadata = {
        **(parser_metadata if isinstance(parser_metadata, dict) else {}),
        "parsed_status": "parsed",
        "source_file": source_file,
    }

    existing_email_metadata = normalized.get("email_metadata") or {}
    if hasattr(existing_email_metadata, "model_dump"):
        existing_email_metadata = existing_email_metadata.model_dump()
    if not isinstance(existing_email_metadata, dict):
        existing_email_metadata = {}

    normalized["ref_number"] = ref_number
    normalized["gmail_message_id"] = gmail_message_id or normalized.get("gmail_message_id")
    normalized["source"] = "statement"
    normalized["email_metadata"] = {
        **existing_email_metadata,
        **(email_metadata or {}),
    } or None
    normalized["parser_metadata"] = parser_metadata
    normalized["optional_fields"] = optional_fields

    return normalized
