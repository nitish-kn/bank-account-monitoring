from pydantic import BaseModel, Field
from typing import Optional, List


class EmailMetadata(BaseModel):

    original_from_email: Optional[str] = None
    original_from_name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class ParserMetadata(BaseModel):

    parsed_status: Optional[str] = None

    confidence_score: Optional[str] = None

    missing_optional_fields: List[str] = Field(
        default_factory=list
    )

    source_file: Optional[str] = None


class OptionalFields(BaseModel):

    trips_left: Optional[str] = Field(
        default=None,
        description=(
            "Remaining FASTag/toll-plaza trips left on the tag. "
            "Only filled via email when the mail is a toll plaza notification."
        ),
    )

    vehicle_number: Optional[str] = Field(
        default=None,
        description=(
            "Vehicle registration number tagged to the FASTag. "
            "Only filled via email when the mail is a toll plaza notification."
        ),
    )

    credit_card_number: Optional[str] = Field(
        default=None,
        description=(
            "Card number (masked or full) for credit card transactions. "
            "Filled only when txn_via is 'Credit Card' — account_number stays null in that case."
        ),
    )


class Transaction(BaseModel):
    """
    Single canonical transaction shape, shared by both the email extractor
    and the bank-statement extractor. Mirrors app/models/transactions.py.
    """

    id: Optional[str] = None

    gmail_message_id: Optional[str] = None

    bank_name: Optional[str] = None

    account_holder_name: Optional[str] = None

    account_type: Optional[str] = None

    account_number: Optional[str] = None

    txn_type: Optional[str] = None

    mode: Optional[str] = None

    category: Optional[str] = None

    amount: Optional[str] = None

    currency: Optional[str] = "INR"

    txn_date: Optional[str] = None

    counterparty: Optional[str] = None

    counterparty_kind: Optional[str] = None

    narration: Optional[str] = None

    txn_via: Optional[str] = None

    ref_number: Optional[str] = None

    place: Optional[str] = None

    balance_after_txn: Optional[float] = None

    source: Optional[str] = Field(
        default=None,
        description="Where this transaction was extracted from: 'email' or 'statement'.",
    )

    dedupe_key: Optional[str] = None

    email_metadata: EmailMetadata = Field(
        default_factory=EmailMetadata
    )

    parser_metadata: ParserMetadata = Field(
        default_factory=ParserMetadata
    )

    optional_fields: OptionalFields = Field(
        default_factory=OptionalFields
    )
