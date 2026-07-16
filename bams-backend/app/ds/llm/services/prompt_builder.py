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
        "txn_date": None,
        "counterparty": None,
        "counterparty_kind": None,
        "txn_via": None,
        "ref_number": None,
        "balance_after_txn": None,
        "place": None,
        "narration": None,
        "parser_metadata": {
            "parsed_status": None,
            "confidence_score": None,
            "missing_optional_fields": []
        },
        "optional_fields": {
            "trips_left": None,
            "vehicle_number": None,
            "credit_card_number": None
        }
    }

    return f"""
You are an expert banking transaction extraction system.

You will receive between 1 and 10 emails. For each one, decide whether it reports an ACTUAL COMPLETED financial transaction and extract its details.

Return ONLY a JSON array with exactly one object per email, in the same order as given. No markdown, no explanations.

==================================================
GENERAL RULES
==================================================

1. Populate every field in the schema for every email.
2. If a field cannot be determined, return null (unless a rule below overrides this).
3. For non-transaction emails, all transaction fields must be null.
4. Preserve original values whenever possible — never invent data.

==================================================
TRANSACTION DETECTION (MOST IMPORTANT)
==================================================

A transaction exists ONLY if money has actually moved: UPI/NEFT/IMPS/RTGS success, card purchase, ATM withdrawal, cash deposit, salary/interest/refund credit, auto-debit/ECS/NACH/EMI, FASTag recharge or deduction, credit card spend/payment/refund.

Mark these: parser_metadata.parsed_status = "parsed"

NOT transactions — mark parser_metadata.parsed_status = "not_transaction" and set all transaction fields to null:

- Statements, mini/passbook statements, eStatements
- Notices about a FUTURE payment/EMI/recharge/mandate (nothing has happened yet)
- Promotional, OTP, login, password-reset, welcome, KYC, limit-change, cashback/reward, marketing, verification, profile-update, or tax-certificate emails
- Any transaction described as Failed, Declined, Cancelled, Reversed, Timed out, Expired, Aborted, Unsuccessful, Pending, or Awaiting confirmation

==================================================
SPECIAL RULE — NEFT / IMPS / RTGS "credited to beneficiary"
==================================================

"Your NEFT transaction ... has been successfully credited to the beneficiary: X" means money LEFT the customer's account.
→ txn_type = "Debit", NOT Credit.

==================================================
txn_via CLASSIFICATION (drives downstream routing — must be exact)
==================================================

Always exactly one of: "Bank Transaction" | "Credit Card" | "FASTag"

- "Credit Card" — credit card purchase, POS spend, payment, refund, or EMI.
  Put the card number (masked or full) in optional_fields.credit_card_number, NOT in account_number. account_number MUST be null for credit card transactions.
- "FASTag" — toll deduction, FASTag recharge or payment.
  If the mail is a toll-plaza deduction/notification:
  - If it states trips remaining (e.g. "Trips Left: 5"), put that number as a string in optional_fields.trips_left.
  - If it states the tagged vehicle's registration number (e.g. "Vehicle No: DL01AB1234"), put it in optional_fields.vehicle_number.
  For every other email, both optional_fields.trips_left and optional_fields.vehicle_number MUST be null.
- Everything else (UPI, NEFT, RTGS, IMPS, salary, cash deposit/withdrawal, interest, ECS/NACH, wallet, refund, merchant payment via bank account) → "Bank Transaction".

==================================================
FIELD RULES
==================================================

amount / balance_after_txn — numeric strings, no currency symbol/commas. e.g. "1700.00", never 1700.

txn_date — date only, format YYYY-MM-DD. Never include a time component even if the email shows one.

account_holder_name — best-effort name from the email; use "Customer" if truly unavailable. Never null.

bank_name — the issuing bank. Look for it in the message body/signature, or infer it from the sender's email domain (e.g. alerts@axis.bank.in → "Axis Bank", alerts@hdfcbank.net → "HDFC Bank"). Only return null if there is truly no evidence.

account_number — extract exactly as shown, including masked forms (e.g. "XX6744", "XXXXXX1234"). Look for labels like "A/c No", "Account Number", "Account ending", "linked to a/c". Return null only if no account number appears anywhere in the email. For credit card transactions (txn_via = "Credit Card"), leave this null — the card number goes in optional_fields.credit_card_number instead.

account_type — e.g. "Savings", "Current", "Credit Card", only if explicitly stated. Otherwise null.

txn_type — "Credit" or "Debit" only.

currency — ISO code (INR, USD, EUR, GBP, AED, SGD, ...).

ref_number — the bank reference/UTR/RRN/cheque number/transaction ID. If not explicitly labelled, look for a 12–18 character numeric or alphanumeric code inside the narration — it is not always present, so return null if none exists. Do not confuse it with a phone number, account number, or amount.
Common pattern: in UPI narrations like "UPI/P2M/655559022350/CRED Club", the digits between the slashes are the reference number.
  e.g. "UPI/P2M/655559022350/CRED Club" → ref_number = "655559022350"

parser_metadata.confidence_score — a STRING like "0.98", never numeric.

counterparty — ONLY the name of the person/merchant/company/bank involved.
- Never include account numbers, masked numbers, reference/UTR numbers, IFSC codes, branch names, IDs, phone numbers, emails, dates, amounts, or anything inside ()/[]/{{}}.
- Normalize spelling variants to one canonical name; expand abbreviations; prefer the fuller name.
  e.g. "UPI/P2M/654543376651/American Express" → "American Express"
       "MAHARAJA CATERERS (Ref: UTIBR52026062500354403)" → "Maharaja Caterers"

==================================================
CATEGORY (business purpose)
==================================================

Prefer one of: Bank Charges, Cash Withdrawal, ECS/NACH, Education, Food & Dining, Healthcare, Interest, Other, Payment, Salary, Shopping, Tax Refund, Taxes, Transfer, Travel, UPI, Utilities.

Guidelines: ATM/cash withdrawal → Cash Withdrawal · salary credit → Salary · interest credit → Interest · UPI → UPI · NEFT/IMPS/RTGS transfer → Transfer · utility bills (electricity/gas/water/broadband/recharge/DTH) → Utilities · GST/TDS/income tax → Taxes · income tax refund → Tax Refund · merchant purchase → Shopping · restaurant/food delivery → Food & Dining · hospital/pharmacy → Healthcare · school/college fees → Education · airline/hotel/railway/cab/FASTag toll → Travel · annual fee/SMS charge/penalty → Bank Charges · ECS/NACH debit → ECS/NACH · generic payment → Payment.

If none fit, create the most specific descriptive category instead of forcing a wrong one.

==================================================
MODE (payment channel)
==================================================

Prefer: CH, Bank Charge, Cash WDL, Cheque, EBA, ECS/NACH, ENACH, IMPS, IMPS/P2A, INB, INB/IFT, MOB/TPFT, NEFT, NEFT/IR, Net Banking, RTGS, RTGS/IR, SAK/CASH WDL — matched to the transaction description (e.g. IMPS transfer → IMPS, NEFT inward remittance → NEFT/IR, internet banking transfer → INB, cash withdrawal → Cash WDL).

If the email states a different mode not in this list (UPI, Credit Card, Debit Card, POS, ATM, Wallet, FASTag, BBPS, Auto Debit, Standing Instruction, QR Payment, etc.), use that exact value instead. Never guess without evidence.

==================================================
FIELDS FILLED BY OUR SYSTEM — always leave null
==================================================

id, gmail_message_id, source, dedupe_key, email_metadata, parser_metadata.source_file — these are populated outside the LLM. Do not attempt to fill them.

==================================================
OUTPUT SCHEMA
==================================================

{json.dumps(schema, indent=2)}

==================================================
EMAILS
==================================================

{json.dumps(emails, indent=2, ensure_ascii=False)}
"""
