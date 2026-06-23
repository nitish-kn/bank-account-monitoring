from langchain_groq import ChatGroq

from ..config import (
    GROQ_API_KEY,
    MODEL_NAME
)

llm = ChatGroq(
    groq_api_key=GROQ_API_KEY,
    model_name=MODEL_NAME,
    temperature=0,
)


def call_llm(prompt: str):

    response = llm.invoke(prompt)

    content = response.content.strip()

    content = content.replace(
        "```json", ""
    )

    content = content.replace(
        "```", ""
    )

    return content.strip()