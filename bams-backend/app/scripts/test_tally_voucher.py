"""Run: python -m app.scripts.test_tally_voucher"""
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from app.services.tally_service import _call_bridge, _validation_error, _voucher_payload
from app.routes.tally import tally_credentials, tally_health
from app.services.transaction_service import apply_transaction_filters
from app.models.transactions import Transactions
from sqlalchemy import select


def _txn(txn_type, is_flag=False):
    # 20:00 UTC on Sep 28 is Sep 29 in IST -- Tally must get the IST day.
    return SimpleNamespace(
        txn_type=txn_type, amount=Decimal("-5000.50"), narration="A & B",
        txn_date=datetime(2026, 9, 28, 20, 0, tzinfo=timezone.utc), tally_synced_at=None,
        is_flag=is_flag,
    )


item = SimpleNamespace(company="Dummy", debit_ledger="M&M Ltd", credit_ledger="HDFC Bank", voucher_type="Payment", narration=None)

out = _voucher_payload(_txn("DEBIT"), item)
assert out["date"] == "20260929"
assert out["narration"] == "A &amp; B"
assert out["entries"] == [
    {"ledger": "M&amp;M Ltd", "amount": 5000.5, "isDebit": True},
    {"ledger": "HDFC Bank", "amount": 5000.5, "isDebit": False},
]

inp = _voucher_payload(_txn("credit"), item)
assert inp["entries"] == out["entries"]  # Explicit mappings do not reverse with txn_type.

assert _validation_error(_txn("debit"), item, ["Dummy"]) is None
assert _validation_error(_txn("debit", is_flag=True), item, ["Dummy"]) is None
assert _validation_error(_txn("carry_forward"), item, ["Dummy"]).startswith("Unsupported transaction type")
assert _validation_error(_txn("debit"), SimpleNamespace(**{**vars(item), "debit_ledger": "HDFC Bank"}), ["Dummy"])
assert _validation_error(_txn("debit"), SimpleNamespace(**{**vars(item), "debit_ledger": " "}), ["Dummy"])
assert _validation_error(_txn("debit"), item, ["Other Co"]).startswith("Company 'Dummy'")

assert tally_credentials("Basic dXNlcjpwYXNzOndpdGg6Y29sb24=") == ("user", "pass:with:colon")
# No credentials yet: only the bridge's open /health is asked, and "Tally down" is a 503.
with patch("app.routes.tally._call_bridge", return_value={"tallyRunning": True}) as bridge:
    assert tally_health(None)["tallyRunning"] is True
    bridge.assert_called_once_with("GET", "/health")
with patch("app.routes.tally._call_bridge", return_value={"tallyRunning": False}):
    try:
        tally_health(None)
        raise AssertionError("expected 503")
    except HTTPException as err:
        assert err.status_code == 503
with patch("app.routes.tally.get_ledgers", return_value=[]) as ledgers:
    assert tally_health("Basic dXNlcjpwYXNzOndpdGg6Y29sb24=")["status"] == "connected"
    ledgers.assert_called_once_with(("user", "pass:with:colon"))
with patch("app.services.tally_service.httpx.request") as request:
    request.return_value = httpx.Response(200, json={"ledgers": []})
    _call_bridge("GET", "/ledgers", auth=("test-user", "test-password"))
    assert request.call_args.kwargs["auth"] == ("test-user", "test-password")

for status, expected in (("pending", "IS NULL"), ("pushed", "IS NOT NULL")):
    query = apply_transaction_filters(select(Transactions), {"tallyStatus": status, "excludeFlagged": False})
    assert f"transactions.tally_synced_at {expected}" in str(query)
    assert "transactions.is_flag IS false" not in str(query)

# --- Bulk push: our voucher and Tally's Day Book copy of it must look the same.
from app.services import tally_service as ts

txn = _txn("debit")
txn.id = "t1"
day_book_copy = {"date": "20260929", "type": "Payment", "narration": "A & B", "entries": [
    {"ledger": "M&M Ltd", "amount": -5000.5, "isDebit": True},
    {"ledger": "HDFC Bank", "amount": 5000.5, "isDebit": False},
]}
assert ts._day_book_key(day_book_copy) == ts._pushed_key(txn, "M&M Ltd", "HDFC Bank", "Payment")

other = _txn("debit")
other.amount = Decimal("10")
batch = [(txn, item, _voucher_payload(txn, item)), (other, item, _voucher_payload(other, item))]

# Whole batch created -> no second Day Book read needed.
with patch.object(ts, "fetch_vouchers", return_value=[]) as day_book, \
        patch.object(ts, "_call_bridge", return_value={"results": {"vouchers": {"success": True, "created": 2}}}):
    assert ts._created_in_tally(batch, None) == ([True, True], None)
    assert day_book.call_count == 1

# Tally created only the first one: the before/after Day Book diff must say exactly that.
with patch.object(ts, "fetch_vouchers", side_effect=[[], [day_book_copy]]), \
        patch.object(ts, "_call_bridge", return_value={"results": {"vouchers": {"success": False, "error": "Voucher date is missing"}}}):
    assert ts._created_in_tally(batch, None) == ([True, False], "Voucher date is missing")

assert "transactions.source = " in str(apply_transaction_filters(select(Transactions), {"tallyStatus": "imported"}))
assert "transactions.source != " in str(apply_transaction_filters(select(Transactions), {"tallyStatus": "pushed"}))

# --- Ledger lookups are cached: one bridge call per ledger, however often it's asked for.
ts._ledger_cache.clear()
with patch.object(ts, "_call_bridge", return_value={"found": True, "isBank": True}) as bridge:
    ts.get_ledger_info("Dummy", "HDFC Bank")
    ts.get_ledger_info("Dummy", " hdfc bank ")
    assert bridge.call_count == 1
    ts.get_ledger_info("Other Co", "HDFC Bank")
    assert bridge.call_count == 2
ts._ledger_cache.clear()

# --- Import rules, on the shapes of your real vouchers (dated 2031 so no real rows interfere).
from app.database import SessionLocal
from app.models.organization import Organization

BANKS = {"new bank": "50100111", "indusind bank": "2006", "hdfc bank": "001234567890"}
fake_ledger = lambda company, name, auth=None: {
    "found": True, "isBank": name.strip().lower() in BANKS,
    "accountNumber": BANKS.get(name.strip().lower()), "holderName": "Dummy Pvt Ltd" if name.strip().lower() in BANKS else None,
}
d = "20310101"
transfer = {"type": "Receipt", "number": "2", "date": d, "narration": "UPI/P2M/657904376766/CRED Club", "entries": [
    {"ledger": "New Bank", "amount": -215275, "isDebit": True}, {"ledger": "Indusind Bank", "amount": 215275, "isDebit": False}]}
no_bank_receipt = {"type": "Receipt", "number": "3", "date": d, "narration": "credited", "entries": [
    {"ledger": "Bulk Ledger 2", "amount": -215000, "isDebit": True}, {"ledger": "Bulk Ledger 1", "amount": 215000, "isDebit": False}]}
icici_receipt = {"type": "Receipt", "number": "4", "date": d, "narration": "vendor", "entries": [
    {"ledger": "ICICI Bank", "amount": -245000, "isDebit": True}, {"ledger": "API Ledger", "amount": 245000, "isDebit": False}]}
journal = {"type": "Journal", "number": "5", "date": d, "entries": [
    {"ledger": "Rent", "amount": -900, "isDebit": True}, {"ledger": "Cash", "amount": 900, "isDebit": False}]}
bank_payment = {"type": "Payment", "number": "6", "date": d, "entries": [
    {"ledger": "Vendor", "amount": -777, "isDebit": True}, {"ledger": "HDFC Bank", "amount": 777, "isDebit": False}]}
cash_contra = {"type": "Contra", "number": "7", "date": d, "entries": [
    {"ledger": "Petty Cash", "amount": -50, "isDebit": True}, {"ledger": "Cash", "amount": 50, "isDebit": False}]}
no_ledgers = {"type": "Stock Journal", "number": "8", "date": d, "entries": []}
all_vouchers = [transfer, no_bank_receipt, icici_receipt, journal, bank_payment, cash_contra, no_ledgers]
window = (datetime(2031, 1, 1).date(), datetime(2031, 1, 1).date())

db = SessionLocal()
try:
    org_id = db.query(Organization.id).first()[0]
    db.add(Transactions(  # an email row for the HDFC payment: masked account number, same last 4 digits
        id="test-existing", org_id=org_id, bank_name="HDFC BANK", account_holder_name="x", account_number="XX7890",
        txn_type="debit", amount=Decimal("777"), txn_date=datetime(2031, 1, 1, 6, 0, tzinfo=timezone.utc),
        counterparty="Vendor", narration="x", ref_number="r", source="email", dedupe_key="test-existing",
    ))
    db.flush()
    with patch.object(db, "commit", db.flush), patch.object(ts, "get_companies", return_value=["Dummy"]), \
            patch.object(ts, "get_ledger_info", side_effect=fake_ledger), \
            patch.object(ts, "fetch_vouchers", return_value=all_vouchers):
        first = ts.import_vouchers(db, org_id, *window)
        assert first == {"found": 7, "imported": 7, "already_in_app": 1, "skipped": 1}, first
        got = sorted(
            (r.ref_number, r.bank_name, r.txn_type, r.counterparty, r.amount, r.account_number, r.source)
            for r in db.query(Transactions).filter(Transactions.org_id == org_id, Transactions.source == "tally",
                                                   Transactions.txn_date >= datetime(2031, 1, 1, tzinfo=timezone.utc) - __import__("datetime").timedelta(days=1))
        )
        assert got == sorted([
            # Bank-to-bank: one row per bank. Debited bank = money in (credit), credited bank = money out (debit).
            ("2", "New Bank", "credit", "Indusind Bank", Decimal("215275"), "50100111", "tally"),
            ("2", "Indusind Bank", "debit", "New Bank", Decimal("215275"), "2006", "tally"),
            # No bank ledger: Receipt -> credit on the debited ledger.
            ("3", "Bulk Ledger 2", "credit", "Bulk Ledger 1", Decimal("215000"), "", "tally"),
            ("4", "ICICI Bank", "credit", "API Ledger", Decimal("245000"), "", "tally"),
            # No bank ledger, other type: txn_type is the voucher type.
            ("5", "Rent", "Journal", "Cash", Decimal("900"), "", "tally"),
            # No bank ledger, Contra: both sides, like a transfer.
            ("7", "Petty Cash", "credit", "Cash", Decimal("50"), "", "tally"),
            ("7", "Cash", "debit", "Petty Cash", Decimal("50"), "", "tally"),
        ]), got
        again = ts.import_vouchers(db, org_id, *window)
        assert again == {"found": 7, "imported": 0, "already_in_app": 8, "skipped": 1}, again
finally:
    db.rollback()
    db.close()
print("ok")
