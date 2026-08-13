"""
Credit card lookup utility for matching and filling credit card details from Excel file.
"""

import difflib
import os
import re
from typing import Any, Dict, List, Optional

import pandas as pd


def load_credit_card_data() -> pd.DataFrame:
    """
    Load credit card mapping data from the Excel file.

    Returns:
        DataFrame: Credit card data with columns:
            S No, Credit Card Owner, Credit Card No., Credit Card Issuer, Card Name, Type
    """
    excel_path = os.path.join(
        os.path.dirname(__file__),
        "Credit Card Mapping.xlsx",
    )

    if not os.path.exists(excel_path):
        raise FileNotFoundError(f"Credit card mapping file not found: {excel_path}")

    try:
        return pd.read_excel(excel_path, engine="openpyxl")
    except Exception as exc:
        raise ValueError(f"Error loading credit card mapping file: {exc}") from exc


def _digits_only(value: Any) -> str:
    """
    Strip everything but digits. The sheet's "Credit Card No." column is
    formatted inconsistently (dashes grouped as 4-4-4-4, 4-6-5, or no
    separators at all) — comparing on digits only makes matching reliable
    regardless of formatting, without needing to rewrite the source file.
    """
    if value is None:
        return ""
    return re.sub(r"\D", "", str(value))


def _clean_cell(value: Any) -> Optional[str]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def extract_last_four_digits(card_number: str) -> Optional[str]:
    """
    Extract last 4 digits from a card number, ignoring any dashes/spaces
    (e.g. "4111-4606-0080-5976" or "XXXX XXXX XXXX 5976" -> "5976").
    """
    digits = _digits_only(card_number)

    if len(digits) >= 4:
        return digits[-4:]

    return None


_MASK_CHARS_RE = re.compile(r"[Xx*•]")


def _visible_card_digits(value: Any) -> str:
    """
    Extract the digits we can trust from a (possibly masked) card number.

    If the string contains explicit mask characters (X/x/*/•), only the
    TRAILING contiguous run of real digits is trusted — masking can hide a
    gap between separate visible groups (e.g. "4111 XXXX XXXX 5976"), so
    blending the leading "4111" into the trailing "5976" would fabricate a
    bogus 8-digit suffix that doesn't actually appear on the card.

    Otherwise (plain digits with only space/dash formatting, no mask
    chars), the number is fully revealed and every digit can be safely
    concatenated, e.g. "4111-4606-0080-5976" -> the true full 16 digits.
    """
    if value is None:
        return ""

    text = str(value)
    if _MASK_CHARS_RE.search(text):
        match = re.search(r"(\d+)\D*$", text)
        return match.group(1) if match else ""

    return re.sub(r"\D", "", text)


def _best_credit_card_candidate(
    candidates: pd.DataFrame,
    owner_hint: Optional[str],
    issuer_hint: Optional[str],
    card_type_hint: Optional[str],
) -> pd.Series:
    """
    Multiple cards share the same digit suffix (e.g. last-4 "1005" matches
    3 different cards) — score each candidate against whichever hints are
    available (cardholder name, issuer, card product name/type) and pick
    the best match, so we don't attribute a transaction to the wrong
    cardholder. Falls back to the first candidate (previous behavior) when
    no hint distinguishes them.
    """
    best_row = candidates.iloc[0]
    best_score = -1.0

    for _, row in candidates.iterrows():
        score = 0.0

        if owner_hint:
            score += difflib.SequenceMatcher(
                None, str(owner_hint).lower(), str(row.get("Credit Card Owner") or "").lower()
            ).ratio()

        if issuer_hint:
            score += difflib.SequenceMatcher(
                None, str(issuer_hint).lower(), str(row.get("Credit Card Issuer") or "").lower()
            ).ratio()

        if card_type_hint:
            name_score = difflib.SequenceMatcher(
                None, str(card_type_hint).lower(), str(row.get("Card Name") or "").lower()
            ).ratio()
            type_score = difflib.SequenceMatcher(
                None, str(card_type_hint).lower(), str(row.get("Type") or "").lower()
            ).ratio()
            score += max(name_score, type_score)

        if score > best_score:
            best_score, best_row = score, row

    return best_row


def find_credit_card_in_excel(
    card_number: str,
    df: pd.DataFrame,
    owner_hint: Optional[str] = None,
    issuer_hint: Optional[str] = None,
    card_type_hint: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Find credit card details in the Excel data, matching on as many digits
    of `card_number` as are actually visible (most-specific first) — e.g.
    a bare last-4 "1005" matches 3 different cards, but a longer visible
    suffix like "91005" narrows it to exactly one. If multiple cards still
    share the matched suffix, `owner_hint` / `issuer_hint` / `card_type_hint`
    (whatever the statement/transaction gives us) break the tie so we don't
    end up on the wrong cardholder.

    Returns:
        dict: Card details (credit_card_number, credit_card_owner, credit_card_issuer,
              card_name, card_type) or None if not found
    """
    if not card_number or not isinstance(df, pd.DataFrame) or df.empty:
        return None

    card_col = "Credit Card No."
    if card_col not in df.columns:
        return None

    digits = _visible_card_digits(card_number)
    if len(digits) < 4:
        return None

    cleaned_numbers = df[card_col].map(_digits_only)

    candidates = pd.DataFrame()
    for suffix_len in range(len(digits), 3, -1):
        suffix = digits[-suffix_len:]
        rows = df[cleaned_numbers.str.endswith(suffix)]
        if not rows.empty:
            candidates = rows
            break

    if candidates.empty:
        return None

    if len(candidates) == 1:
        match = candidates.iloc[0]
    else:
        match = _best_credit_card_candidate(candidates, owner_hint, issuer_hint, card_type_hint)

    return {
        "credit_card_number": _clean_cell(_digits_only(match.get(card_col)) or None),
        "credit_card_owner": _clean_cell(match.get("Credit Card Owner")),
        "credit_card_issuer": _clean_cell(match.get("Credit Card Issuer")),
        "card_name": _clean_cell(match.get("Card Name")),
        "card_type": _clean_cell(match.get("Type")),
    }


_FUZZY_FILLER_WORDS = {
    "my", "the", "a", "an", "for", "of", "is", "are", "and", "or", "to", "in",
    "on", "at", "account", "accounts", "card", "cards", "bank", "credit", "debit",
    "please", "whats",
}


def _significant_tokens(text: str) -> List[str]:
    return [
        token for token in str(text or "").lower().split()
        if len(token) >= 3 and token not in _FUZZY_FILLER_WORDS
    ]


def _token_substring_boost(query_tokens: List[str], *candidate_texts: str) -> float:
    """See fuzzy_find_accounts_in_excel's sibling helper -- a whole-string
    ratio can bury a strong single-keyword hit (e.g. "axis" in "Axis Bank
    Debit Card") under filler words; a verbatim token hit is worth crossing
    the threshold on its own."""
    for token in query_tokens:
        for candidate in candidate_texts:
            if token in candidate.lower():
                return 0.68
    return 0.0


def fuzzy_find_credit_cards_in_excel(
    query_text: str,
    df: pd.DataFrame,
    threshold: float = 0.6,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    """
    Fallback for when there's no usable digit signal (e.g. "my HDFC card",
    not "card ending 1234") -- find_credit_card_in_excel() bails out before
    scanning a single row when fewer than 4 digits are visible, so a
    name/issuer-only query gets zero grounding from this sheet no matter how
    many rows it has. Scans every row's Owner/Issuer/Card Name and ranks by
    similarity instead. Threshold is a loose floor, not a precision cutoff --
    see fuzzy_find_accounts_in_excel's docstring for why.
    """
    if not query_text or not isinstance(df, pd.DataFrame) or df.empty:
        return []

    card_col = "Credit Card No."
    if card_col not in df.columns:
        return []

    query = str(query_text).strip().lower()
    if not query:
        return []

    query_tokens = _significant_tokens(query)

    scored: list[tuple[float, Dict[str, Any]]] = []
    for _, row in df.iterrows():
        owner = str(row.get("Credit Card Owner") or "").strip()
        issuer = str(row.get("Credit Card Issuer") or "").strip()
        card_name = str(row.get("Card Name") or "").strip()
        candidate_text = f"{owner} {issuer} {card_name}".strip().lower()
        if not candidate_text:
            continue

        score = max(
            difflib.SequenceMatcher(None, query, owner.lower()).ratio(),
            difflib.SequenceMatcher(None, query, issuer.lower()).ratio(),
            difflib.SequenceMatcher(None, query, card_name.lower()).ratio(),
            difflib.SequenceMatcher(None, query, candidate_text).ratio(),
            _token_substring_boost(query_tokens, owner, issuer, card_name),
        )
        if score < threshold:
            continue

        scored.append((score, {
            "credit_card_number": _clean_cell(_digits_only(row.get(card_col)) or None),
            "credit_card_owner": _clean_cell(row.get("Credit Card Owner")),
            "credit_card_issuer": _clean_cell(row.get("Credit Card Issuer")),
            "card_name": _clean_cell(row.get("Card Name")),
            "card_type": _clean_cell(row.get("Type")),
        }))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [match for _, match in scored[:limit]]


def get_all_credit_card_passwords(df: pd.DataFrame = None) -> list[str]:
    """
    Credit card statement PDFs are password-protected with the first 4
    letters of the cardholder's name (uppercase, letters only) plus the
    last 4 digits of the card number — e.g. "Arvind Kumar Gupta" + card
    ending 1000 -> "ARVI1000". Returns the derived password for every row
    in the mapping sheet (skipping rows missing either piece).
    """
    if df is None:
        try:
            df = load_credit_card_data()
        except Exception as exc:
            print(f"Warning: Could not load credit card mapping data: {exc}")
            return []

    if not isinstance(df, pd.DataFrame) or df.empty:
        return []

    owner_col, card_col = "Credit Card Owner", "Credit Card No."
    if owner_col not in df.columns or card_col not in df.columns:
        return []

    passwords = []
    for _, row in df.iterrows():
        owner = _clean_cell(row.get(owner_col))
        card_number = row.get(card_col)
        if not owner:
            continue

        first_four = re.sub(r"[^A-Za-z]", "", owner).upper()[:4]
        last_four = _digits_only(card_number)[-4:]

        if len(first_four) == 4 and len(last_four) == 4:
            passwords.append(f"{first_four}{last_four}")

    # Dedupe while preserving order.
    return list(dict.fromkeys(passwords))


def fill_missing_credit_card_details(transaction: Dict[str, Any], df: pd.DataFrame = None) -> Dict[str, Any]:
    """
    For credit card transactions, look up the full card details from the
    mapping sheet using as many digits of the card number as the LLM
    captured (not just the last 4 — a longer visible suffix narrows down
    to fewer candidate cards), and fill optional_fields with the
    owner/issuer/card name/type plus the full card number. If multiple
    cards still share that digit suffix, whatever's on the transaction
    (account holder name, bank/issuer name, account type) is used to break
    the tie so a transaction doesn't get attributed to the wrong cardholder.

    No-op for anything that isn't a credit card transaction, or where we
    don't have at least a partial card number to match on.
    """
    if str(transaction.get("txn_via") or "").strip().lower() != "credit card":
        return transaction

    optional_fields = transaction.get("optional_fields")
    if not isinstance(optional_fields, dict):
        optional_fields = {}
        transaction["optional_fields"] = optional_fields

    card_number = optional_fields.get("credit_card_number")
    if not card_number:
        return transaction

    if df is None:
        try:
            df = load_credit_card_data()
        except Exception as exc:
            print(f"Warning: Could not load credit card mapping data: {exc}")
            return transaction

    match = find_credit_card_in_excel(
        card_number,
        df,
        owner_hint=transaction.get("account_holder_name"),
        issuer_hint=transaction.get("bank_name"),
        card_type_hint=transaction.get("account_type"),
    )
    if not match:
        return transaction

    if match.get("credit_card_number"):
        optional_fields["credit_card_number"] = match["credit_card_number"]

    if match.get("credit_card_owner"):
        optional_fields["credit_card_owner"] = match["credit_card_owner"]

    if match.get("credit_card_issuer"):
        optional_fields["credit_card_issuer"] = match["credit_card_issuer"]

    if match.get("card_name"):
        optional_fields["card_name"] = match["card_name"]

    if match.get("card_type"):
        optional_fields["card_type"] = match["card_type"]

    return transaction
