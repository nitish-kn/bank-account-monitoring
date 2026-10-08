import logging
import shutil
import subprocess
import time
from collections import Counter
from datetime import date, datetime, timedelta
from decimal import Decimal
from hashlib import sha256
from urllib.parse import urlparse
from uuid import uuid4
from xml.sax.saxutils import escape

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..core.constants import PROJECT_ROOT
from ..models.transactions import Transactions
from ..utils.date_utils import IST, ist_day, utc_now
from ..utils.db_utils import _find_fallback_amount_date_match

logger = logging.getLogger(__name__)

BRIDGE_DIR = PROJECT_ROOT / "tally-bridge"

VOUCHER_TYPES = {"Payment", "Receipt", "Contra", "Journal"}


TALLY_NOT_CONNECTED = "Tally not connected"


class TallyBridgeError(Exception):
    def __init__(self, message: str, not_connected: bool = False):
        super().__init__(message)
        self.not_connected = not_connected


def _call_bridge(method: str, path: str, auth=None, **kwargs) -> dict:
    # Credentials always come from the user (Configure User); only /health works without them.
    try:
        resp = httpx.request(method, f"{settings.TALLY_BRIDGE_URL}{path}", auth=auth, timeout=30, **kwargs)
    except httpx.HTTPError as err:
        logger.warning("Tally bridge unreachable: %s", err)
        raise TallyBridgeError(TALLY_NOT_CONNECTED, not_connected=True) from err

    try:
        body = resp.json()
    except ValueError:
        body = {}
    # The bridge answers 5xx when it can't reach Tally itself (Tally closed, no company open).
    if resp.status_code >= 500:
        logger.warning("Tally bridge %s %s failed: %s", method, path, body.get("error") or resp.status_code)
        raise TallyBridgeError(TALLY_NOT_CONNECTED, not_connected=True)
    if resp.status_code == 401:
        raise TallyBridgeError("Tally username or password is incorrect. Update it in Configure User.")
    if resp.status_code >= 400:
        raise TallyBridgeError(body.get("error") or f"Tally bridge returned HTTP {resp.status_code}")
    return body


def _bridge_is_up() -> bool:
    try:
        httpx.get(settings.TALLY_BRIDGE_URL, timeout=2)
        return True
    except httpx.HTTPError:
        return False


def start_bridge() -> subprocess.Popen | None:
    """Start the local tally-bridge if it isn't already running. Returns the
    process only when this call started it, so the caller can stop it."""
    if _bridge_is_up():
        logger.info("Tally bridge already running at %s", settings.TALLY_BRIDGE_URL)
        return None

    node = shutil.which("node")
    is_local = urlparse(settings.TALLY_BRIDGE_URL).hostname in ("127.0.0.1", "localhost")
    if not (is_local and node and (BRIDGE_DIR / "index.js").exists()):
        logger.warning("Tally bridge not reachable at %s and can't be started from here", settings.TALLY_BRIDGE_URL)
        return None

    log_file = open(BRIDGE_DIR / "bridge.log", "a", encoding="utf-8")
    proc = subprocess.Popen([node, "index.js"], cwd=BRIDGE_DIR, stdout=log_file, stderr=subprocess.STDOUT)

    for _ in range(20):
        if proc.poll() is not None:
            logger.error("Tally bridge exited on startup (code %s), see %s", proc.returncode, BRIDGE_DIR / "bridge.log")
            return None
        if _bridge_is_up():
            break
        time.sleep(0.5)

    try:
        health = _call_bridge("GET", "/health")
        logger.info("Tally bridge started (pid %s), Tally running: %s", proc.pid, health.get("tallyRunning"))
    except TallyBridgeError as err:
        logger.warning("Tally bridge started (pid %s) but health check failed: %s", proc.pid, err)
    return proc


def get_ledgers(auth=None) -> list[dict]:
    body = _call_bridge("GET", "/ledgers", auth=auth)
    ledgers = [{"name": l["name"], "parent": l.get("parent")} for l in body.get("ledgers", []) if l.get("name")]
    return sorted(ledgers, key=lambda l: l["name"].lower())


def get_companies(auth=None) -> list[str]:
    # The bridge only exposes the company currently open in Tally.
    name = (_call_bridge("GET", "/company", auth=auth).get("company") or "").strip()
    return [name] if name and name != "Unknown Company" else []


def _validation_error(txn: Transactions | None, item, active_companies: list[str]) -> str | None:
    if item.company not in active_companies:
        return f"Company '{item.company}' is not the one open in Tally"
    if txn is None:
        return "Transaction not found"
    if txn.tally_synced_at:
        return "Already pushed to Tally"
    if not txn.amount:
        return "Transaction has no amount"
    if not txn.txn_date:
        return "Transaction has no date"
    if (txn.txn_type or "").lower() not in ("credit", "debit"):
        return f"Unsupported transaction type: {txn.txn_type}"
    if not item.debit_ledger.strip() or not item.credit_ledger.strip():
        return "Both ledgers are required"
    if item.debit_ledger.strip().lower() == item.credit_ledger.strip().lower():
        return "Debit and credit ledgers must differ"
    if item.voucher_type not in VOUCHER_TYPES:
        return f"Unsupported voucher type: {item.voucher_type}"
    return None


def _voucher_payload(txn: Transactions, item) -> dict:
    amount = float(abs(txn.amount))
    # The bridge interpolates these straight into its XML without escaping.
    return {
        "date": ist_day(txn.txn_date).strftime("%Y%m%d"),
        "type": item.voucher_type,
        "narration": escape(item.narration or txn.narration or ""),
        "entries": [
            {"ledger": escape(item.debit_ledger), "amount": amount, "isDebit": True},
            {"ledger": escape(item.credit_ledger), "amount": amount, "isDebit": False},
        ],
    }


def _friendly_error(error: str, txn: Transactions) -> str:
    # Tally's wording for a date it won't accept, not a missing field.
    if "voucher date is missing" in error.lower():
        return (
            f"Tally rejected the date {ist_day(txn.txn_date):%d %b %Y}. Educational-mode Tally only accepts "
            "the 1st, 2nd and 31st of a month, and no Tally accepts dates before the company's books begin."
        )
    return error


def _voucher_key(date: str, voucher_type: str, entries) -> tuple:
    """Identifies a voucher by what's in it, the same way for our payloads and Tally's Day Book."""
    return (
        date,
        (voucher_type or "").strip().lower(),
        tuple(sorted(
            ((ledger or "").strip().lower(), bool(is_debit), round(abs(float(amount or 0)), 2))
            for ledger, is_debit, amount in entries
        )),
    )


def _day_book_key(voucher: dict) -> tuple:
    entries = [(e.get("ledger"), e.get("isDebit"), e.get("amount")) for e in voucher.get("entries") or []]
    return _voucher_key(voucher.get("date"), voucher.get("type"), entries)


def _pushed_key(txn: Transactions, debit_ledger: str, credit_ledger: str, voucher_type: str) -> tuple:
    amount = abs(txn.amount)
    return _voucher_key(
        ist_day(txn.txn_date).strftime("%Y%m%d"), voucher_type,
        [(debit_ledger, True, amount), (credit_ledger, False, amount)],
    )


def fetch_vouchers(from_date: str, to_date: str, auth=None) -> list[dict]:
    """Tally's Day Book between two YYYYMMDD dates."""
    return _call_bridge("GET", "/vouchers", auth=auth, params={"from": from_date, "to": to_date}).get("vouchers") or []


def _created_in_tally(batch: list, auth) -> tuple[list[bool], str | None]:
    """Sends the whole batch in one /sync and works out which vouchers Tally created.

    Tally imports each voucher on its own and only reports totals, so when the
    batch isn't fully created we diff the Day Book from before and after the
    import to see which of ours are actually new."""
    dates = [payload["date"] for _, _, payload in batch]
    keys = [_pushed_key(txn, item.debit_ledger, item.credit_ledger, item.voucher_type) for txn, item, _ in batch]
    before = Counter(_day_book_key(v) for v in fetch_vouchers(min(dates), max(dates), auth))

    tally_error = None
    try:
        body = _call_bridge("POST", "/sync", auth=auth, json={"vouchers": [payload for _, _, payload in batch]})
        outcome = (body.get("results") or {}).get("vouchers") or {}
        if outcome.get("success") and outcome.get("created") == len(batch):
            return [True] * len(batch), None
        tally_error = outcome.get("error") or "Tally did not create this voucher"
    except TallyBridgeError as err:
        tally_error = str(err)

    try:
        new = Counter(_day_book_key(v) for v in fetch_vouchers(min(dates), max(dates), auth)) - before
    except TallyBridgeError:
        raise TallyBridgeError(
            "Couldn't confirm which vouchers Tally created. Check Tally's Day Book before pushing these again."
        )
    created = []
    for key in keys:
        created.append(new[key] > 0)
        new[key] -= 1
    return created, tally_error


def push_transactions(db: Session, org_id: int, items: list, auth=None) -> list[dict]:
    items = list({item.id: item for item in items}.values())
    # Vouchers land in whichever company Tally has open, so check it still
    # matches what the user picked before creating anything.
    try:
        active_companies = get_companies(auth)
    except TallyBridgeError as err:
        return [{"id": item.id, "ok": False, "error": str(err)} for item in items]

    results = {}
    batch = []
    for item in items:
        # Row lock so two concurrent pushes can't both create a voucher for it.
        txn = (
            db.query(Transactions)
            .filter(Transactions.org_id == org_id, Transactions.id == item.id)
            .with_for_update()
            .first()
        )
        error = _validation_error(txn, item, active_companies)
        if error:
            results[item.id] = {"id": item.id, "ok": False, "error": error}
        else:
            batch.append((txn, item, _voucher_payload(txn, item)))

    if batch:
        try:
            created, tally_error = _created_in_tally(batch, auth)
        except TallyBridgeError as err:
            created, tally_error = [False] * len(batch), str(err)

        for (txn, item, _), ok in zip(batch, created):
            if not ok:
                results[item.id] = {"id": item.id, "ok": False, "error": _friendly_error(tally_error, txn)}
                continue
            txn.tally_synced_at = utc_now()
            txn.tally_voucher = {
                "company": item.company,
                "debit_ledger": item.debit_ledger,
                "credit_ledger": item.credit_ledger,
                "voucher_type": item.voucher_type,
            }
            results[item.id] = {
                "id": txn.id, "ok": True,
                "tally_synced_at": txn.tally_synced_at.isoformat(), "tally_voucher": txn.tally_voucher,
            }
    db.commit()

    ordered = [results[item.id] for item in items]
    logger.info("Tally push for org %s: %s/%s succeeded", org_id, sum(r["ok"] for r in ordered), len(ordered))
    return ordered


# Ledger group + bank details by (company, lowercased ledger name). In memory only: a restart
# or another worker just means one more Tally lookup per ledger.
_ledger_cache: dict[tuple, dict] = {}


def get_ledger_info(company: str | None, name: str, auth=None) -> dict:
    key = (company, name.strip().lower())
    if key not in _ledger_cache:
        _ledger_cache[key] = _call_bridge("GET", "/ledger", auth=auth, params={"name": name.strip()})
    return _ledger_cache[key]


def _voucher_rows(voucher: dict, is_bank) -> list[dict]:
    """The transaction rows one Tally voucher stands for, as dicts of ledger (the account),
    txn_type, amount and counterparty.

    isDebit is Tally's accounting sense: a *debited* bank ledger is money coming *in* to
    that account (a credit in banking terms), a credited one is money going out."""
    entries = [e for e in voucher.get("entries") or [] if e.get("ledger")]
    debits = [e for e in entries if e.get("isDebit")]
    credits = [e for e in entries if not e.get("isDebit")]
    if not debits or not credits:
        return []

    def total(side):
        return sum(Decimal(str(abs(e.get("amount") or 0))) for e in side)

    def names(side):
        return ", ".join(e["ledger"] for e in side)

    def row_per_entry(accounts):
        # A transfer between two of our accounts becomes one row on each side.
        return [
            {"ledger": e["ledger"], "txn_type": "credit" if e.get("isDebit") else "debit",
             "amount": total([e]), "counterparty": names(credits if e.get("isDebit") else debits)}
            for e in accounts
        ]

    banks = [e for e in entries if is_bank(e["ledger"])]
    if banks:
        return row_per_entry(banks)

    # No bank ledger: fall back on the voucher type.
    voucher_type = (voucher.get("type") or "").strip()
    if voucher_type.lower() == "receipt":
        return [{"ledger": debits[0]["ledger"], "txn_type": "credit", "amount": total(debits), "counterparty": names(credits)}]
    if voucher_type.lower() == "payment":
        return [{"ledger": credits[0]["ledger"], "txn_type": "debit", "amount": total(credits), "counterparty": names(debits)}]
    if voucher_type.lower() == "contra":
        return row_per_entry(entries)
    return [{"ledger": debits[0]["ledger"], "txn_type": voucher_type or "Journal", "amount": total(debits),
             "counterparty": names(credits)}]


def import_vouchers(db: Session, org_id: int, from_date: date, to_date: date, auth=None) -> dict:
    companies = get_companies(auth)
    company = companies[0] if companies else None
    vouchers = fetch_vouchers(f"{from_date:%Y%m%d}", f"{to_date:%Y%m%d}", auth)

    def ledger(name):
        return get_ledger_info(company, name, auth)

    # Vouchers this app pushed, or imported earlier, are already transactions here.
    window_start = datetime.combine(from_date - timedelta(days=1), datetime.min.time(), IST)
    window_end = datetime.combine(to_date + timedelta(days=2), datetime.min.time(), IST)
    pushed, imported_before = Counter(), set()
    for txn in db.query(Transactions).filter(
        Transactions.org_id == org_id,
        Transactions.tally_voucher.isnot(None),
        Transactions.txn_date >= window_start,
        Transactions.txn_date < window_end,
    ):
        if txn.amount is None or not txn.txn_date:
            continue
        key = _pushed_key(txn, txn.tally_voucher.get("debit_ledger"), txn.tally_voucher.get("credit_ledger"),
                          txn.tally_voucher.get("voucher_type"))
        if txn.source == "tally":
            imported_before.add((key, txn.ref_number))
        else:
            pushed[key] += 1

    new_rows, new_dedupe_keys, matched_ids = [], set(), set()
    already_in_app = skipped = 0
    for voucher in vouchers:
        rows = _voucher_rows(voucher, lambda name: bool(ledger(name).get("isBank"))) if voucher.get("date") else []
        if not rows:
            skipped += 1
            continue

        key = _day_book_key(voucher)
        number = str(voucher.get("number") or "")
        if (key, number) in imported_before:
            already_in_app += len(rows)
            continue
        if pushed[key] > 0:
            pushed[key] -= 1
            already_in_app += len(rows)
            continue

        entries = voucher.get("entries") or []
        txn_date = datetime.strptime(voucher["date"], "%Y%m%d").replace(tzinfo=IST)
        tally_voucher = {
            "company": company,
            "debit_ledger": next(e["ledger"] for e in entries if e.get("isDebit") and e.get("ledger")),
            "credit_ledger": next(e["ledger"] for e in entries if not e.get("isDebit") and e.get("ledger")),
            "voucher_type": voucher.get("type"),
        }
        for row in rows:
            details = ledger(row["ledger"])
            account_number = details.get("accountNumber") or ""
            dedupe_key = sha256(
                f"tally|{org_id}|{company}|{key!r}|{number}|{row['ledger']}|{row['txn_type']}".encode()
            ).hexdigest()
            if dedupe_key in new_dedupe_keys or db.query(Transactions.id).filter(
                Transactions.org_id == org_id, Transactions.dedupe_key == dedupe_key,
            ).first():
                already_in_app += 1
                continue

            # Same check the email/statement import uses (amount, day, debit/credit, account number).
            # Rows typed after the voucher (e.g. "Journal") never moved bank money, so there's nothing to match.
            if row["txn_type"] in ("credit", "debit"):
                match = _find_fallback_amount_date_match({
                    "amount": row["amount"], "txn_date": txn_date, "txn_type": row["txn_type"],
                    "counterparty": row["counterparty"], "account_number": account_number,
                }, org_id, db)
                if match and match.id not in matched_ids:
                    matched_ids.add(match.id)
                    already_in_app += 1
                    continue

            new_dedupe_keys.add(dedupe_key)
            new_rows.append(Transactions(
                id=str(uuid4()),
                org_id=org_id,
                bank_name=row["ledger"],
                account_holder_name=details.get("holderName") or company or "",
                account_number=account_number,
                txn_type=row["txn_type"],
                amount=row["amount"],
                txn_date=txn_date,
                counterparty=row["counterparty"],
                narration=voucher.get("narration") or "",
                ref_number=number,
                source="tally",
                dedupe_key=dedupe_key,
                tally_synced_at=utc_now(),
                tally_voucher=tally_voucher,
            ))

    # Added only after every check, so this run's own new rows can't count as "already in the app".
    db.add_all(new_rows)
    db.commit()
    result = {"found": len(vouchers), "imported": len(new_rows), "already_in_app": already_in_app, "skipped": skipped}
    logger.info("Tally import for org %s: %s", org_id, result)
    return result
