from app.utils.transaction_utils import normalize_transaction_date, transaction_timestamp


def test_normalize_transaction_date_converts_various_inputs_to_iso_date():
    assert normalize_transaction_date("2024-01-15T10:30:00Z") == "2024-01-15"
    assert normalize_transaction_date("15/01/2024") == "2024-01-15"
    assert normalize_transaction_date("01 Jan 2024") == "2024-01-01"
    assert normalize_transaction_date(None) == ""


def test_transaction_timestamp_parses_iso_date():
    timestamp = transaction_timestamp({"txn_date": "2024-01-15"})
    assert timestamp > 0
