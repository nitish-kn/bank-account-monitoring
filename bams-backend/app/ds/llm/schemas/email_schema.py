from pydantic import BaseModel, Field
from typing import Optional


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

    model_config = {
        "populate_by_name": True
    }