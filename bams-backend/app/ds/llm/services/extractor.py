import json
import re
import difflib

from .html_cleaner import clean_email_body
from .prompt_builder import build_batch_prompt
from .llm_client import call_llm

from ..utils.hashing import generate_hash
from ..utils.datetime_utils import get_current_timestamp
from ..utils.account_lookup import fill_missing_account_details

from ..schemas.transaction_schema import Transaction

from ....config import settings


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

        if result.get("inr_equivalent") is not None:
            result["inr_equivalent"] = str(
                result["inr_equivalent"]
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

        # Default forwarded flag

        if not result.get(
            "is_forwarded"
        ):
            result[
                "is_forwarded"
            ] = "No"

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

        result[
            "parser_name"
        ] = settings.PARSER_NAME

        result[
            "parser_version"
        ] = settings.PARSER_VERSION

        result[
            "parsed_at"
        ] = get_current_timestamp()

        # Raw data enrichment

        if "raw_data" not in result:
            result["raw_data"] = {}

        result["raw_data"][
            "body"
        ] = email.get("body")

        result["raw_text_hash"] = (
            generate_hash(
                email.get("body", "")
            )
        )

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

        # Append details like account_number or ref_number in parentheses if present
        for member in g["members"]:
            suffix_parts = []
            acct = member.get("account_number")
            ref = member.get("ref_number")
            if acct:
                suffix_parts.append(f"Account: {acct}")
            if ref:
                suffix_parts.append(f"Ref: {ref}")

            suffix = ""
            if suffix_parts:
                suffix = " (" + ", ".join(suffix_parts) + ")"

            member["counterparty"] = canonical + suffix if canonical else member.get("counterparty")

    return final_results
