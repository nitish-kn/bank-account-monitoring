import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

MODEL_NAME = "openai/gpt-oss-120b"

PARSER_NAME = "bank_transaction_extractor"
PARSER_VERSION = "1.0.0"