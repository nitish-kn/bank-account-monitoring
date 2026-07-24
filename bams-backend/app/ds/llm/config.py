import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

OPENAI_MODEL_NAME = "gpt-5.4-mini"
GROQ_MODEL_NAME = "llama-3.3-70b-versatile"

PARSER_NAME = "bank_transaction_extractor"
PARSER_VERSION = "1.0.0"