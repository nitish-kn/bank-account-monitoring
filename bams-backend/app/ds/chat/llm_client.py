from openai import OpenAI

from .config import CHAT_MODEL_NAME, OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)


def create_response(instructions: str, input_items: list, tools: list):
    return client.responses.create(
        model=CHAT_MODEL_NAME,
        instructions=instructions,
        input=input_items,
        tools=tools,
        tool_choice="auto",
    )
