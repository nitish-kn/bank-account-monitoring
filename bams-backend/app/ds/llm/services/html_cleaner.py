from bs4 import BeautifulSoup
import re


def clean_email_body(body: str) -> str:

    if "<html" in body.lower() or "<body" in body.lower():
        body = BeautifulSoup(body, "html.parser").get_text(
            separator="\n"
        )

    body = re.sub(r"http[s]?://\S+", "", body)

    body = re.sub(r"\s+", " ", body)

    return body.strip()                                                                                                                                                         