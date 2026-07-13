from openai import OpenAI

from ..config import (
    OPENAI_MODEL_NAME,
    OPENAI_API_KEY,
)

client = OpenAI(api_key=OPENAI_API_KEY)


def call_llm(prompt: str):
    response = client.responses.create(
        model=OPENAI_MODEL_NAME,
        instructions=(
            "You are a helpful assistant. Return the answer as valid JSON "
            "when the prompt requests structured output."
        ),
        input=prompt,
    )

    content = getattr(response, "output_text", "") or ""
    content = content.strip()

    content = content.replace(
        "```json", ""
    )

    content = content.replace(
        "```", ""
    )

    return content.strip()
