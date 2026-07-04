import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

MODEL_NAME = "gpt-5.4-nano"

PARSER_NAME = "bank_transaction_extractor"
PARSER_VERSION = "1.0.0"