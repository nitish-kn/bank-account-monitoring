import json
import re
import difflib
from email.utils import parseaddr

from .html_cleaner import clean_email_body
from .prompt_builder import build_batch_prompt
from .llm_client import call_llm

from ..utils.account_lookup import fill_missing_account_details

from ..schemas.transaction_schema import Transaction


def extract_transactions(emails):

    if not emails:
        raise ValueError(
            "No emails received"
        )

    if len(emails) > 10:
        raise ValueError(
            "Maximum 10 emails allowed per request"
        )

    cleaned_emails = []

    for email in emails:

        cleaned_body = clean_email_body(
            email.get("body", "")
        )

        cleaned_emails.append(
            {
                "id": email.get("id"),
                "from": email.get("from"),
                "subject": email.get("subject"),
                "body": cleaned_body
            }
        )

    prompt = build_batch_prompt(
        cleaned_emails
    )

    raw_response = call_llm(
        prompt
    )

    try:
        results = json.loads(
            raw_response
        )

    except Exception as e:

        raise ValueError(
            f"Failed to parse LLM JSON response: {e}"
        )

    if not isinstance(results, list):

        raise ValueError(
            "LLM response must be a JSON array"
        )

    final_results = []

    for email, result in zip(
        cleaned_emails,
        results
    ):

        # Convert numeric fields to strings

        if result.get("amount") is not None:
            result["amount"] = str(
                result["amount"]
            )

        if result.get("balance_after_txn") is not None:
            result["balance_after_txn"] = str(
                result["balance_after_txn"]
            )

        # Default account holder

        if not result.get(
            "account_holder_name"
        ):
            result[
                "account_holder_name"
            ] = "Customer"

        result = fill_missing_account_details(result)

        # Confidence score to string

        if result.get(
            "parser_metadata"
        ):

            score = result[
                "parser_metadata"
            ].get(
                "confidence_score"
            )

            if score is not None:

                result[
                    "parser_metadata"
                ][
                    "confidence_score"
                ] = str(score)

        # System metadata

        result[
            "gmail_message_id"
        ] = email.get("id")

        result["source"] = "email"

        # email_metadata is filled from the raw email, not the LLM, to save tokens
        display_name, from_email = parseaddr(email.get("from") or "")

        result["email_metadata"] = {
            "original_from_email": from_email or None,
            "original_from_name": display_name or None,
            "subject": email.get("subject"),
            "body": email.get("body"),
        }

        validated_result = (
            Transaction.model_validate(
                result
            )
        )

        final_results.append(
            validated_result.model_dump()
        )

    # Normalize / canonicalize counterparty names across this batch
    def _clean_key(name: str) -> str:
        if not name:
            return ""
        return re.sub(r"\W+", "", name.lower())

    # Build groups of similar cleaned keys
    groups: list[dict] = []  # each: {key: cleaned_key, originals: [names]}

    for res in final_results:
        name = res.get("counterparty") or ""
        cleaned = _clean_key(name)
        placed = False
        if not cleaned:
            continue
        for g in groups:
            # compare cleaned strings for similarity
            ratio = difflib.SequenceMatcher(None, cleaned, g["key"]).ratio()
            if ratio >= 0.80:
                g["originals"].append(name)
                g["members"].append(res)
                placed = True
                break
        if not placed:
            groups.append({"key": cleaned, "originals": [name], "members": [res]})

    # For each group, pick a canonical display name (prefer longest non-empty original)
    for g in groups:
        candidates = [n for n in g["originals"] if n]
        if candidates:
            canonical = max(candidates, key=lambda s: len(s))
        else:
            canonical = ""

        for member in g["members"]:
            member["counterparty"] = canonical or member.get("counterparty")

    print(final_results)

    return final_results
