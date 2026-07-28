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
SPECIAL RULE — "credited to the beneficiary" (money the customer SENT)
==================================================

Emails like "Your NEFT transaction ... has been successfully credited to the beneficiary: X, A/c No XXXX"
(also IMPS / RTGS / UPI "transferred to" / "sent to" / "paid to" a beneficiary) mean money LEFT the customer's account.

→ txn_type = "Debit", NOT Credit.

In this case every account detail printed in the email (the name, the "A/c No ...", the account type)
describes the BENEFICIARY / COUNTERPARTY — it is NOT the customer's own account. So:
- account_holder_name = null
- account_number      = null
- account_type        = null
- Put the beneficiary's name in counterparty, and set counterparty_kind accordingly (e.g. "Beneficiary", person, or merchant).

Never copy a beneficiary's account number into account_number — that field is only ever the customer's own account.

==================================================
ANOTHER SPECIAL RULE — "raised by JAIDEEP JAIDEEP" (payment approved by another person)
==================================================

Emails like "raised by JAIDEEP JAIDEEP has been seccessfully processed" 
These emails should be mapped to a specific bank account number 
Bank Name - AXIS BANK
Account Holder's name - Modern Flour Mills Private Limited 
Account number - 925020009337222

Do not Leave these fields blank whenever you do see such statement in any email "raised by JAIDEEP JAIDEEP has been successfully processed."
Also Do not classify Jaideep as Counterparty , Counterparty name will be written in the email

==================================================
txn_via CLASSIFICATION (drives downstream routing — must be exact)
==================================================

txn_via MUST be exactly one of these three literal strings, and NOTHING else:
    "Bank Transaction" | "Credit Card" | "FASTag"

Never output any other value (not "UPI", "NEFT", "IMPS", "RTGS", "Wallet", "Debit Card", "POS", "Toll", null, or anything else).
If none of the three obviously applies, default to "Bank Transaction".

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

txn_date — if the email states a time for the transaction (many bank alert emails do, e.g. "at 14:32:10 on 12-Jul-2026"), return it as "YYYY-MM-DD HH:MM:SS" (24-hour clock). If no time is stated, return "YYYY-MM-DD" only. Never invent a time that isn't shown, and never use the email's received/sent timestamp as a substitute for a transaction time the email itself doesn't state.

account_holder_name — the name of the CUSTOMER's OWN account this email is about (best-effort from the email). Set it to null when the only name shown belongs to the counterparty/beneficiary (see the "credited to the beneficiary" rule) rather than to the customer's own account.

bank_name — the issuing bank. Look for it in the message body/signature, or infer it from the sender's email domain (e.g. alerts@axis.bank.in → "Axis Bank", alerts@hdfcbank.net → "HDFC Bank"). Only return null if there is truly no evidence.

account_number — the CUSTOMER's OWN account number, extracted exactly as shown, including masked forms (e.g. "XX6744", "XXXXXX1234"). Look for labels like "A/c No", "Account Number", "Account ending", "linked to a/c". Return null only if no account number for the customer's own account appears anywhere in the email. Never put a beneficiary's / counterparty's account number here (see the "credited to the beneficiary" rule). For credit card transactions (txn_via = "Credit Card"), leave this null — the card number goes in optional_fields.credit_card_number instead.

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
- ATM withdrawal / cash withdrawal (category = "Cash Withdrawal") — counterparty MUST be "Self". The account holder is withdrawing their own cash, so it is not a real third-party counterparty.

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

id, gmail_message_id, source, dedupe_key, email_metadata, parser_metadata.source_file, optional_fields.credit_card_owner, optional_fields.credit_card_issuer, optional_fields.card_name, optional_fields.card_type — these are populated outside the LLM (the card fields are resolved from our records using optional_fields.credit_card_number). Do not attempt to fill them.

==================================================
OUTPUT SCHEMA
==================================================

{json.dumps(schema, indent=2)}

==================================================
EMAILS
==================================================

{json.dumps(emails, indent=2, ensure_ascii=False)}
"""
