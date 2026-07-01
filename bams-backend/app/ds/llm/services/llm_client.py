from langchain_groq import ChatGroq

from ....config import settings

llm = ChatGroq(
    groq_api_key=settings.GROQ_API_KEY,
    model_name=settings.MODEL_NAME,
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
