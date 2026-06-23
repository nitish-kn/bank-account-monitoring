import json


def build_batch_prompt(emails):

    schema = {
        "bank_name": None,
        "account_holder_name": None,
        "account_number": None,
        "account_type": None,
        "txn_type": None,
        "mode": None,
        "category": None,
        "amount": None,
        "currency": None,
        "original_currency": None,
        "inr_equivalent": None,
        "txn_date": None,
        "counterparty": None,
        "counterparty_kind": None,
        "vpa": None,
        "ref_number": None,
        "balance_after_txn": None,
        "balance_label": None,
        "place": None,
        "narration": None,
        "is_forwarded": None,
        "email_metadata": {
            "forwarded_by_email": None,
            "forwarded_by_name": None,
            "original_from_email": None,
            "original_from_name": None,
            "original_to_email": None,
            "original_subject": None,
            "original_sent_at": None,
            "receiver_from_email": None,
            "receiver_from_name": None,
            "receiver_to_email": None,
            "receiver_subject": None,
            "receiver_received_at": None
        },
        "parser_metadata": {
            "parsed_status": None,
            "confidence_score": None,
            "missing_optional_fields": []
        },
        "raw_data": {}
    }

    return f"""
You are an expert banking transaction extraction system.

You will receive between 1 and 10 emails.

Your job is to:

1. Identify whether each email contains a banking transaction.
2. Extract all available transaction details.
3. Populate EVERY field from the schema.
4. If a field is unavailable, return null unless a special rule below applies.
5. Return one JSON object per email.
6. Return ONLY valid JSON.
7. Return ONLY a JSON array.
8. Do NOT return markdown.
9. Do NOT return explanations.

SPECIAL RULES:

1. All monetary fields MUST be strings.

Examples:
"amount": "1700.00"
"inr_equivalent": "1700.00"
"balance_after_txn": "25000.50"

Never return:
"amount": 1700
"amount": 1700.00

2. account_holder_name:

If account holder name is not available,
return:

"account_holder_name": "Customer"

Never return null for account_holder_name.

3. is_forwarded:

Must always be either:

"Yes"
or
"No"

Never return null.

Use "Yes" only when the email is clearly a forwarded email.

Otherwise use "No".

4. confidence_score:

Must always be a string.

Examples:

"0.99"
"0.95"
"0.80"

Never return numeric values.

5. txn_type:

Use only:
"Credit"
"Debit"

6. currency:

Use ISO codes:
"INR"
"USD"
"EUR"

For non-transaction emails:

parser_metadata.parsed_status = "not_transaction"

For transaction emails:

parser_metadata.parsed_status = "parsed"

Output Schema:

{json.dumps(schema, indent=2)}

Emails:

{json.dumps(emails, indent=2, ensure_ascii=False)}
"""