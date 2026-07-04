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
        "txn_via": None,
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

Your task is to determine whether each email contains an ACTUAL COMPLETED financial transaction and extract its details.

Return exactly one JSON object for every email.

Return ONLY a JSON array.
Return ONLY valid JSON.
Do NOT return markdown.
Do NOT return explanations.

==================================================
GENERAL EXTRACTION RULES
==================================================

1. Populate EVERY field from the schema.

2. If a field is unavailable, return null unless a rule below specifies otherwise.

3. For non-transaction emails, all transaction-specific fields should be null.

4. Preserve original values whenever possible.

==================================================
TRANSACTION DETECTION (MOST IMPORTANT)
==================================================

A transaction exists ONLY if money has actually moved.

Examples of VALID transactions include:

- UPI payment successful
- IMPS successful
- NEFT successful
- RTGS successful
- Card purchase
- ATM withdrawal
- Cash deposit
- Cash withdrawal
- Salary credited
- Interest credited
- Refund credited
- Merchant payment
- Auto debit
- ECS debit
- NACH debit
- Standing instruction debit
- Loan EMI debit
- Wallet load
- Fastag recharge
- Fastag deduction
- Credit card payment
- Credit card spend
- Credit card refund

Only these should be marked as:

parser_metadata.parsed_status = "parsed"

==================================================
DO NOT COUNT AS TRANSACTIONS
==================================================

The following are NOT transactions and must be treated as non-transaction emails.

Examples include:

- Monthly account statements
- Mini statements
- Statement of payments
- Credit card statements
- Balance statements
- eStatements
- Passbook emails
- Future payment reminders
- Upcoming EMI reminders
- Upcoming recharge reminders
- Payment due reminders
- Payment scheduled for a future date
- Bill generation emails
- Promotional emails
- OTP emails
- Login alerts
- Password reset emails
- Welcome emails
- KYC emails
- Limit increase emails
- Service requests
- Cashback offers
- Reward point updates
- Marketing emails
- Account verification emails
- Profile update emails
- Tax certificates
- TDS certificates

These must return:

parser_metadata.parsed_status = "not_transaction"

==================================================
FAILED / CANCELLED TRANSACTIONS
==================================================

If the email indicates ANY of the following:

- Failed
- Failure
- Declined
- Cancelled
- Canceled
- Reversed
- Reversal
- Timed out
- Expired
- Aborted
- Unsuccessful
- Could not be processed
- Payment pending
- Awaiting confirmation

DO NOT count it as a transaction.

Return:

parser_metadata.parsed_status = "not_transaction"

All transaction fields should be null.

==================================================
FUTURE TRANSACTIONS
==================================================

If the email is merely informing the customer that:

- a payment WILL happen
- an EMI WILL be deducted
- a recharge WILL occur
- a mandate WILL execute
- a scheduled payment is upcoming

then it is NOT a transaction.

Return:

parser_metadata.parsed_status = "not_transaction"

==================================================
SPECIAL RULE FOR NEFT / IMPS / RTGS
==================================================

If the email says something like:

"Your NEFT transaction has been successfully credited to the beneficiary..."

Example:

"Your NEFT transaction with reference no. AXSK261760003127 for INR 166000.00 has been successfully credited to the beneficiary : INTERHOSPITALITY LLP"

This means money has left the customer's account.

Therefore:

txn_type = "Debit"

NOT Credit.

==================================================
txn_via CLASSIFICATION
==================================================

txn_via MUST ALWAYS be one of these three values:

"Bank Transaction"
"Credit Card"
"FASTag"

Classification rules:

Use "Credit Card" if the transaction belongs to a credit card.

Examples:

- Credit card purchase
- POS purchase
- Credit card payment
- Credit card refund
- Credit card EMI
- Credit card spend

Use "FASTag" if it relates to toll or FASTag.

Examples:

- Toll deduction
- FASTag recharge
- FASTag payment

Everything else must be

"Bank Transaction"

Examples:

- UPI
- NEFT
- RTGS
- IMPS
- Salary
- Cash deposit
- Cash withdrawal
- Interest
- ECS
- NACH
- ATM
- Wallet
- Refund
- Merchant payment

==================================================
MONETARY FIELDS
==================================================

All monetary fields MUST be strings.

Correct:

"amount": "1700.00"

Wrong:

"amount": 1700

==================================================
ACCOUNT HOLDER
==================================================

If account holder name is unavailable:

"account_holder_name": "Customer"

Never return null.

==================================================
FORWARDED EMAIL
==================================================

Always return

"Yes"

or

"No"

Never null.

==================================================
CONFIDENCE SCORE
==================================================

Always return a STRING.

Example:

"0.98"

Never numeric.

==================================================
txn_type
==================================================

Only:

"Credit"

or

"Debit"

==================================================
currency
==================================================

Use ISO codes.

Examples:

INR
USD
EUR
GBP
AED
SGD

==================================================
COUNTERPARTY NORMALIZATION
==================================================

The `counterparty` field must contain ONLY the name of the person, merchant, company, organization, beneficiary, sender, or receiver involved in the transaction.

STRICT RULES:

- Return ONLY the clean counterparty name.
- Do NOT include account numbers, masked account numbers, reference numbers, UTR numbers, transaction IDs, IFSC codes, branch names, customer IDs, beneficiary IDs, phone numbers, email addresses, dates, amounts, currencies, balances, payment modes, or any other metadata.
- Do NOT include any text inside parentheses (), square brackets [], or curly braces .
- Do NOT infer or append any additional information to the counterparty name.
- If the transaction description contains identifiers along with the name, extract ONLY the name.
- Normalize spelling variations into a single canonical name.
- Expand abbreviations whenever possible.
- Prefer the longest identifiable organization or person name.

Examples:

Input:
UPI/P2M/654543376651/American Express

Output:
American Express

Input:
MAHARAJA CATERERS (Ref: UTIBR52026062500354403)

Output:
Maharaja Caterers

Input:
INTERHOSPITALITY LLP, A/c XX0806

Output:
INTERHOSPITALITY LLP

Before returning the final JSON, verify that the `counterparty` field contains ONLY the counterparty name. If it contains any identifiers or metadata, remove them before returning the response.


==================================================
CATEGORY CLASSIFICATION
==================================================

The "category" field represents the business purpose of the transaction.

Use one of the following categories whenever applicable:

- Bank Charges
- Cash Withdrawal
- ECS/NACH
- Education
- Food & Dining
- Healthcare
- Interest
- Other
- Payment
- Salary
- Shopping
- Tax Refund
- Taxes
- Transfer
- Travel
- UPI
- Utilities

Classification Guidelines:

- ATM withdrawal or cash withdrawal → Cash Withdrawal
- Salary credit → Salary
- Interest credit → Interest
- UPI transaction → UPI
- NEFT / IMPS / RTGS fund transfer → Transfer (or Transfers if clearly applicable)
- Electricity, Gas, Water, Broadband, Mobile Recharge, DTH, Utility Bills → Utilities
- Income Tax, GST, TDS, Advance Tax payments → Taxes
- Income Tax Refund → Tax Refund
- Merchant purchases → Shopping
- Restaurant, Cafe, Swiggy, Zomato, Food delivery → Food & Dining
- Hospital, Pharmacy, Medical Store, Clinic → Healthcare
- School, College, University, Coaching Fees → Education
- Airline, Hotel, Railway, FASTag Toll, Cab Booking, Travel Booking → Travel
- Bank charges, Annual Fee, SMS Charges, Penalty, Processing Fee → Bank Charges
- ECS/NACH Debit → ECS/NACH
- Generic merchant payment → Payment

If none of the above categories appropriately describe the transaction, create the most suitable descriptive category instead of forcing an incorrect one.

Always choose the most specific category available.

==================================================
MODE CLASSIFICATION
==================================================

The "mode" field represents the banking/payment channel through which the transaction occurred.

Prefer one of the following values whenever applicable:
Try to predict this using counterparty's name and transaction description.

- CH
- Bank Charge
- Cash WDL
- Cheque
- EBA
- ECS/NACH
- ENACH
- IMPS
- IMPS/P2A
- INB
- INB/IFT
- MOB/TPFT
- NEFT
- NEFT/IR
- Net Banking
- RTGS
- RTGS/IR
- SAK/CASH WDL

Mode Classification Rules:

- IMPS transfer → IMPS
- IMPS Person-to-Account transfer → IMPS/P2A
- NEFT transfer → NEFT
- NEFT inward remittance → NEFT/IR
- RTGS transfer → RTGS
- RTGS inward remittance → RTGS/IR
- Internet Banking transfer → INB
- Internet Banking Fund Transfer → INB/IFT
- Mobile Banking Transfer → MOB/TPFT
- Net Banking payment → Net Banking
- ECS Debit → ECS/NACH
- eNACH Debit → ENACH
- Cash Withdrawal → Cash WDL
- SAK Cash Withdrawal → SAK/CASH WDL
- Cheque payment → Cheque
- Bank Charges → Bank Charge
- Electronic Banking Arrangement → EBA
- CH transactions → CH

If the email explicitly mentions another payment mode that is not listed above (for example UPI, Credit Card, Debit Card, POS, ATM, Wallet, FASTag, BBPS, Auto Debit, Standing Instruction, QR Payment, etc.), use that exact payment mode instead of forcing one of the predefined values.

Always prefer the payment mode explicitly mentioned in the email.

Do not guess the mode if there is insufficient evidence.

==================================================

==================================================
OUTPUT
==================================================

Transaction email:

parser_metadata.parsed_status = "parsed"

Non-transaction email:

parser_metadata.parsed_status = "not_transaction"

==================================================
OUTPUT SCHEMA
==================================================

{json.dumps(schema, indent=2)}

==================================================
EMAILS
==================================================

{json.dumps(emails, indent=2, ensure_ascii=False)}
"""