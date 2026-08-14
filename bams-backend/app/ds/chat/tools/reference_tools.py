import difflib

from ....services.accounts_service import get_paginated_accounts
from ....services.transaction_service import get_filter_options
from ...llm.utils.account_lookup import find_account_in_excel, fuzzy_find_accounts_in_excel, load_bank_accounts_data
from ...llm.utils.credit_card_lookup import (
    find_credit_card_in_excel,
    fuzzy_find_credit_cards_in_excel,
    load_credit_card_data,
)
from ..schemas.chat_dto import ToolContext
from ..schemas.tool_params import ResolveAccountParams
from .base import tool


def _digits(text: str) -> str:
    return "".join(ch for ch in str(text or "") if ch.isdigit())


@tool(
    name="resolve_account_or_card",
    description=(
        "Resolve a vague natural-language reference to a bank account or credit card (e.g. 'my HDFC "
        "card', 'axis salary account') into its canonical account number / card last-4, bank/issuer, "
        "and holder name -- cross-referencing both the reference sheets and the accounts actually "
        "present in the user's own data. Call this first when a question references an account or "
        "card ambiguously, before calling other tools."
    ),
    params_model=ResolveAccountParams,
    cache_tier="medium",
)
def resolve_account_or_card(ctx: ToolContext, query_text: str) -> dict:
    matches: list[dict] = []
    digits = _digits(query_text)
    last_four = digits[-4:] if len(digits) >= 4 else None

    # Reference sheets: the source of truth for accounts/cards we monitor,
    # but a manually-created account (added straight in the app) may not
    # have a row here -- the DB fallback below covers that gap.
    #
    # The digit-based lookups only ever match a last-4 suffix -- a query with
    # no usable digits at all ("my HDFC card", "Arvind's account") would
    # otherwise get zero grounding from these sheets no matter how many rows
    # they have. When the digit path comes up empty, fall back to scanning
    # every row by name/bank/issuer similarity instead.
    try:
        accounts_df = load_bank_accounts_data()
        account_match = find_account_in_excel(last_four, accounts_df) if last_four else None
        if account_match:
            matches.append({"kind": "bank_account", "source": "reference_sheet", **account_match})
        else:
            for fuzzy_match in fuzzy_find_accounts_in_excel(query_text, accounts_df):
                matches.append({"kind": "bank_account", "source": "reference_sheet_fuzzy", **fuzzy_match})
    except Exception:
        pass

    try:
        cards_df = load_credit_card_data()
        card_match = find_credit_card_in_excel(query_text, cards_df, owner_hint=query_text)
        if card_match:
            matches.append({"kind": "credit_card", "source": "reference_sheet", **card_match})
        else:
            for fuzzy_match in fuzzy_find_credit_cards_in_excel(query_text, cards_df):
                matches.append({"kind": "credit_card", "source": "reference_sheet_fuzzy", **fuzzy_match})
    except Exception:
        pass

    db_accounts = get_paginated_accounts(ctx.db, ctx.user_id, {"search": query_text}, page=1, page_size=5)
    for account in db_accounts.get("accounts", []):
        matches.append(
            {
                "kind": "bank_account",
                "source": "user_data",
                "bank_name": account["bank_name"],
                "account_holder_name": account["account_holder_name"],
                "account_type": account["account_type"],
                "account_number": account["account_number"],
            }
        )

    if not matches:
        filter_options = get_filter_options(ctx.db, ctx.user_id)
        suggestions = difflib.get_close_matches(query_text, filter_options.get("entities", []), n=3)
        return {"matches": [], "suggestions": suggestions}

    return {"matches": matches}
