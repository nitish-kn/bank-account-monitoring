from bs4 import BeautifulSoup
import re


def clean_email_body(body: str) -> str:
    """
    Aggressively clean email body HTML to extract only meaningful transaction content.
    Removes nested tables, excessive whitespace, HTML tags, links, and disclaimers.
    """
    
    if not body:
        return ""
    
    # Remove carriage returns and newlines first
    body = body.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    
    # Parse HTML if present
    if "<html" in body.lower() or "<body" in body.lower() or "<table" in body.lower():
        soup = BeautifulSoup(body, "html.parser")
        
        # Remove script and style tags
        for tag in soup(["script", "style"]):
            tag.decompose()
        
        # Extract text
        body = soup.get_text(separator=" ")
    
    # Remove URLs
    body = re.sub(r"http[s]?://\S+", "", body)
    
    # Remove email addresses that aren't useful
    body = re.sub(r"[\w\.-]+@[\w\.-]+\.\w+", "", body)
    
    # Remove multiple spaces
    body = re.sub(r"\s+", " ", body)
    
    # Remove common footer patterns (disclaimers, contact info, etc.)
    footer_patterns = [
        r"This e-mail is confidential.*",
        r"Please do not share your.*",
        r"Know more.*",
        r"Copyright.*",
        r"Terms & Conditions.*",
        r"Reach us at.*",
        r"RBI never deals.*",
        r"Do not click on.*",
        r"Chat.*Web Support.*",
        r"Always open to help you.*",
        r"Internet communications cannot.*",
    ]
    
    for pattern in footer_patterns:
        body = re.sub(pattern, "", body, flags=re.IGNORECASE | re.DOTALL)
    
    # Clean up leftover multiple spaces again
    body = re.sub(r"\s+", " ", body)
    
    return body.strip()


def clean_payload_whitespace(text: str) -> str:
    """Clean whitespace from payload text - removes \\r\\n and extra spaces."""
    if not text:
        return text
    
    # Remove carriage returns and newlines
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    
    # Replace multiple spaces with single space
    text = re.sub(r"\s+", " ", text)
    
    # Strip leading and trailing whitespace
    return text.strip()