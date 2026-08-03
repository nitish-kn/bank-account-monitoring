from pydantic import BaseModel, Field
from typing import Optional, List


class AttachmentMetadata(BaseModel):
    id: str
    filename: str
    mimeType: Optional[str] = None
    size: Optional[int] = 0


class EmailPayload(BaseModel):

    id: str

    threadId: Optional[str] = None
    internalDate: Optional[int] = None

    from_: Optional[str] = Field(
        default=None,
        alias="from"
    )

    subject: str
    body: str

    snippet: Optional[str] = None
    attachments: List[AttachmentMetadata] = Field(
        default_factory=list
    )

    model_config = {
        "populate_by_name": True
    }
