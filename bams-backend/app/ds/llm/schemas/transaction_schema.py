from pydantic import BaseModel, Field
from typing import Optional, List


class EmailMetadata(BaseModel):
    forwarded_by_email: Optional[str] = None
    forwarded_by_name: Optional[str] = None
    
    original_from_email: Optional[str] = None
    original_from_name: Optional[str] = None
    original_to_email: Optional[str] = None
    original_subject: Optional[str] = None
    original_sent_at: Optional[str] = None
    
    receiver_from_email: Optional[str] = None
    receiver_from_name: Optional[str] = None
    receiver_to_email: Optional[str] = None
    receiver_subject: Optional[str] = None
    receiver_received_at: Optional[str] = None





class RawData(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None



class ParserMetadata(BaseModel):

    parsed_status: Optional[str] = None

    confidence_score: Optional[float] = None

    missing_optional_fields: List[str] = Field(
        default_factory=list
    )


class Transaction(BaseModel):

    id: Optional[str] = None

    gmail_message_id: Optional[str] = None

    bank_name: Optional[str] = None

    account_holder_name: Optional[str] = None

    account_number: Optional[str] = None

    account_type: Optional[str] = None

    txn_type: Optional[str] = None

    mode: Optional[str] = None

    category: Optional[str] = None

    amount: Optional[float] = None

    currency: Optional[str] = None

    original_currency: Optional[str] = None

    inr_equivalent: Optional[float] = None

    txn_date: Optional[str] = None

    counterparty: Optional[str] = None

    counterparty_kind: Optional[str] = None

    vpa: Optional[str] = None

    ref_number: Optional[str] = None

    balance_after_txn: Optional[float] = None

    balance_label: Optional[str] = None

    place: Optional[str] = None

    narration: Optional[str] = None

    is_forwarded: Optional[bool] = None

    email_metadata: dict = Field(
        default_factory=dict
    )

    parser_metadata: ParserMetadata = Field(
        default_factory=ParserMetadata
    )

    raw_data: dict = Field(
        default_factory=dict
    )