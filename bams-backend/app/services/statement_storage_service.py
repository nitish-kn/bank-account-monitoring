"""
RustFS (S3-compatible) storage for statement PDFs.

This is the only module that talks to RustFS. Uploads are best-effort: if
storage isn't configured or an upload fails, `store_statement_file` returns
None and the caller keeps saving transactions -- they just won't have a
previewable file.
"""

import logging
import re
import threading
from datetime import date, datetime, timezone
from pathlib import PurePosixPath

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..models.bank_accounts import BankAccounts
from .ledger_service import _as_day, _as_decimal

logger = logging.getLogger(__name__)

PDF_CONTENT_TYPE = "application/pdf"

_client = None
_client_lock = threading.Lock()


def is_storage_configured() -> bool:
    return all((
        settings.RUSTFS_ENDPOINT_URL,
        settings.RUSTFS_ACCESS_KEY,
        settings.RUSTFS_SECRET_KEY,
        settings.RUSTFS_BUCKET,
    ))


def _get_client():
    """One shared client -- boto3 clients are thread-safe, and Gmail sync
    uploads statement attachments from several worker threads at once."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = boto3.client(
                    "s3",
                    endpoint_url=settings.RUSTFS_ENDPOINT_URL,
                    aws_access_key_id=settings.RUSTFS_ACCESS_KEY,
                    aws_secret_access_key=settings.RUSTFS_SECRET_KEY,
                    region_name=settings.RUSTFS_REGION,
                    # RustFS serves buckets at /<bucket>/<key>, not <bucket>.<host>.
                    config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
                )
    return _client


def _storage_path_part(value: object, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "")).strip("._")
    return (cleaned or fallback).lower()


def _first_meaningful_value(transactions: list[dict], field: str, fallback: str) -> str:
    placeholders = {"unknown", "unknown_holder", "customer", "n/a", "none", "null"}
    for transaction in transactions:
        value = str(transaction.get(field) or "").strip()
        normalized_value = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
        if value and normalized_value not in placeholders:
            return value
    return fallback


def _statement_storage_key(
    org_id: int,
    filename: str | None,
    statement_transactions: list[dict] | None = None,
) -> str:
    """Build an org-scoped, human-readable path for the statement PDF."""
    transactions = statement_transactions or []
    period_from_values = [
        day
        for transaction in transactions
        if (day := _as_day(transaction.get("period_from"))) is not None
    ]
    period_to_values = [
        day
        for transaction in transactions
        if (day := _as_day(transaction.get("period_to"))) is not None
    ]
    transaction_dates = [
        day
        for transaction in transactions
        if (day := _as_day(transaction.get("txn_date"))) is not None
    ]
    period_from = (
        min(period_from_values).isoformat()
        if period_from_values
        else min(transaction_dates).isoformat() if transaction_dates else "unknown"
    )
    period_to = (
        max(period_to_values).isoformat()
        if period_to_values
        else max(transaction_dates).isoformat() if transaction_dates else "unknown"
    )
    original_name = PurePosixPath(str(filename or "statement.pdf").replace("\\", "/")).name
    file_name = original_name or "statement.pdf"
    bank_name = _storage_path_part(
        _first_meaningful_value(transactions, "bank_name", "unknown_bank"),
        "unknown_bank",
    )
    account_holder = _storage_path_part(
        _first_meaningful_value(transactions, "account_holder_name", "unknown_holder"),
        "unknown_holder",
    )
    return (
        f"org_{org_id}/{bank_name}/{account_holder}/"
        f"period_{period_from}_to_{period_to}/{file_name}"
    )


def store_statement_file(
    org_id: int,
    content: bytes,
    filename: str | None,
    source: str,
    uploaded_by: dict | None = None,
    gmail_message_id: str | None = None,
    statement_transactions: list[dict] | None = None,
) -> dict | None:
    """Upload a statement PDF and return the metadata to keep for it, or
    None if it couldn't be stored."""
    if not is_storage_configured():
        logger.warning("Statement file not stored, RustFS is not configured | org=%s file=%s", org_id, filename)
        return None

    storage_key = _statement_storage_key(org_id, filename, statement_transactions)
    try:
        _get_client().put_object(
            Bucket=settings.RUSTFS_BUCKET,
            Key=storage_key,
            Body=content,
            ContentType=PDF_CONTENT_TYPE,
        )
    except (BotoCoreError, ClientError) as error:
        logger.error("Statement file upload failed | org=%s file=%s error=%s", org_id, filename, error)
        return None

    size_bytes = len(content)
    logger.info(
        "Statement file stored | org=%s file=%s key=%s bytes=%d",
        org_id, filename, storage_key, size_bytes,
    )
    return {
        "storage_key": storage_key,
        "filename": filename,
        "size_bytes": size_bytes,
        "content_type": PDF_CONTENT_TYPE,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": uploaded_by,
        "source": source,
        "gmail_message_id": gmail_message_id,
    }


def discard_statement_file(file_metadata: dict | None) -> None:
    """Delete an uploaded PDF whose transactions failed to save, so it isn't
    left behind with nothing pointing at it."""
    storage_key = (file_metadata or {}).get("storage_key")
    if not storage_key or not is_storage_configured():
        return

    try:
        _get_client().delete_object(Bucket=settings.RUSTFS_BUCKET, Key=storage_key)
        logger.info("Statement file discarded | key=%s", storage_key)
    except (BotoCoreError, ClientError) as error:
        logger.error("Failed to discard statement file | key=%s error=%s", storage_key, error)


def attach_statement_metadata(
    db: Session,
    org_id: int,
    transactions: list[dict],
    file_metadata: dict,
) -> int:
    """Write `file_metadata` onto each account's last statement day-row.

    That's the row reconcile_statement_batch stamps with the statement's
    closing balance. Carry-forward-only statements have no transaction amount,
    so account number and date are sufficient to locate their latest day-row.
    Caller commits. Returns how many rows got it.
    """
    last_day_per_account: dict[str, date] = {}
    for transaction in transactions or []:
        account_number = transaction.get("account_number")
        txn_day = _as_day(transaction.get("txn_date"))
        if (
            not account_number
            or txn_day is None
        ):
            continue
        if account_number not in last_day_per_account or txn_day > last_day_per_account[account_number]:
            last_day_per_account[account_number] = txn_day

    attached = 0
    for account_number, day in last_day_per_account.items():
        row_id = f"{org_id}_{account_number}_{day.strftime('%Y%m%d')}"
        row = (
            db.query(BankAccounts)
            .filter(BankAccounts.id == row_id, BankAccounts.org_id == org_id)
            .first()
        )
        if row is None:
            logger.warning(
                "Statement metadata not attached, no bank_accounts row | org=%s row_id=%s key=%s",
                org_id, row_id, file_metadata.get("storage_key"),
            )
            continue
        row.statement_metadata = file_metadata
        attached += 1

    return attached


def store_and_link_statement_file(
    db: Session,
    org_id: int,
    content: bytes,
    filename: str,
    source: str,
    statement_transactions: list[dict],
    saved_transactions: list,
    uploaded_by: dict | None = None,
    gmail_message_id: str | None = None,
    store_without_new_transactions: bool = False,
) -> str | None:
    """Store a statement PDF only if it brought new transactions, then point
    those transactions (parser_metadata.source_file_path) and the statement's
    last bank_accounts day-row (metadata) at it.

    Runs after the transactions are committed, so re-uploading an
    already-saved statement inserts nothing and stores nothing. Rows that
    already existed (e.g. from an email) are left as they are. Never raises --
    the transactions are saved either way. Returns the storage key, or None
    if nothing was stored.
    """
    inserted = [
        model for model in saved_transactions
        if getattr(model, "_is_insert", False)
        and (model.parser_metadata or {}).get("source_file") == filename
        and (gmail_message_id is None or model.gmail_message_id == gmail_message_id)
    ]
    if not inserted and not store_without_new_transactions:
        logger.info("Statement file not stored, no new transactions | org=%s file=%s", org_id, filename)
        return None

    storage_transactions = [
        *statement_transactions,
        *[
            {
                "bank_name": getattr(model, "bank_name", None),
                "account_holder_name": getattr(model, "account_holder_name", None),
                "txn_date": getattr(model, "txn_date", None),
                "period_from": getattr(model, "period_from", None),
                "period_to": getattr(model, "period_to", None),
            }
            for model in inserted
        ],
    ]
    account_numbers = {
        transaction.get("account_number")
        for transaction in statement_transactions
        if transaction.get("account_number")
    }
    account_rows = (
        db.query(BankAccounts)
        .filter(
            BankAccounts.org_id == org_id,
            BankAccounts.account_number.in_(account_numbers),
        )
        .all()
        if account_numbers
        else []
    )
    storage_transactions.extend(
        {
            "bank_name": row.bank_name,
            "account_holder_name": row.account_holder_name,
            "period_from": row.period_from,
            "period_to": row.period_to,
        }
        for row in account_rows
    )
    file_metadata = store_statement_file(
        org_id,
        content,
        filename,
        source,
        uploaded_by=uploaded_by,
        gmail_message_id=gmail_message_id,
        statement_transactions=storage_transactions,
    )
    if not file_metadata:
        return None

    storage_key = file_metadata["storage_key"]
    try:
        for model in inserted:
            # Reassigned rather than mutated -- a plain JSONB column doesn't
            # notice in-place dict changes.
            model.parser_metadata = {**(model.parser_metadata or {}), "source_file_path": storage_key}
        attach_statement_metadata(db, org_id, statement_transactions, file_metadata)
        db.commit()
    except Exception as error:
        db.rollback()
        # Nothing references the uploaded PDF now, so don't leave it behind.
        discard_statement_file(file_metadata)
        logger.error("Statement file link failed | org=%s file=%s error=%s", org_id, filename, error)
        return None

    logger.info(
        "Statement file linked | org=%s file=%s key=%s new_transactions=%d",
        org_id, filename, storage_key, len(inserted),
    )
    return storage_key


def open_statement_file(org_id: int, storage_key: str) -> dict:
    """Fetch a stored statement for preview. Keys are org-scoped, so a key
    belonging to another org is treated as not found rather than served."""
    if not is_storage_configured():
        raise HTTPException(status_code=503, detail="Statement storage is not configured.")

    if not storage_key.startswith(f"org_{org_id}/") or ".." in storage_key:
        raise HTTPException(status_code=404, detail="Statement file not found.")

    try:
        stored = _get_client().get_object(Bucket=settings.RUSTFS_BUCKET, Key=storage_key)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            raise HTTPException(status_code=404, detail="Statement file not found.")
        logger.error("Statement file fetch failed | key=%s error=%s", storage_key, error)
        raise HTTPException(status_code=502, detail="Could not fetch the statement file.")
    except BotoCoreError as error:
        logger.error("Statement file fetch failed | key=%s error=%s", storage_key, error)
        raise HTTPException(status_code=502, detail="Could not fetch the statement file.")

    return {
        "body": stored["Body"],
        "content_type": stored.get("ContentType") or PDF_CONTENT_TYPE,
        "content_length": stored.get("ContentLength"),
        "filename": PurePosixPath(storage_key).name,
    }
