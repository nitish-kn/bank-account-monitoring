import json

from .html_cleaner import clean_email_body
from .prompt_builder import build_batch_prompt
from .llm_client import call_llm

from ..utils.hashing import generate_hash
from ..utils.datetime_utils import get_current_timestamp

from ..schemas.transaction_schema import Transaction

from ..config import (
    PARSER_NAME,
    PARSER_VERSION
)


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
        ] = PARSER_NAME

        result[
            "parser_version"
        ] = PARSER_VERSION

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

    return final_results