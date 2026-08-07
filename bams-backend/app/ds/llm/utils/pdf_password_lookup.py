"""
Aggregates every password worth trying against an encrypted statement PDF,
from all known sources, so the caller can just brute-force through the
combined list rather than figuring out up front which account/card a PDF
belongs to. Expected to stay well under ~100 total passwords.
"""

import json
import os

from .account_lookup import get_all_bank_account_passwords
from .credit_card_lookup import get_all_credit_card_passwords

EXTRA_PASSWORDS_FILE = os.path.join(os.path.dirname(__file__), "extra_passwords.json")


def load_extra_passwords() -> list[str]:
    """
    Manually-maintained passwords that don't come from either mapping
    sheet. Add more by editing extra_passwords.json — a plain JSON array
    of strings, e.g. ["SOMEPASS123", "ANOTHER456"].
    """
    if not os.path.exists(EXTRA_PASSWORDS_FILE):
        return []

    try:
        with open(EXTRA_PASSWORDS_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:
        print(f"Warning: Could not load extra passwords file: {exc}")
        return []

    if not isinstance(data, list):
        return []

    return [cleaned for value in data if (cleaned := str(value or "").strip())]


def get_all_known_pdf_passwords() -> list[str]:
    """
    Every password worth trying against an encrypted statement PDF, combined
    from: the Bank Accounts V1 mapping sheet, derived credit-card statement
    passwords (first 4 letters of the cardholder name + last 4 card digits),
    and the manually-maintained extra_passwords.json list. Deduplicated,
    order preserved (bank accounts first, then credit cards, then manual).
    """
    combined = [
        *get_all_bank_account_passwords(),
        *get_all_credit_card_passwords(),
        *load_extra_passwords(),
    ]
    return list(dict.fromkeys(combined))
