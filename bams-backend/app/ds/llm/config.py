import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

MODEL_NAME = "llama-3.3-70b-versatile"

PARSER_NAME = "bank_transaction_extractor"
PARSER_VERSION = "1.0.0"