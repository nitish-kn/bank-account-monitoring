from services.html_cleaner import clean_email_body


def prepare_emails(emails):

    cleaned_emails = []

    for email in emails:

        cleaned_emails.append(
            {
                "id": email.get("id"),
                "from": email.get("from"),
                "subject": email.get("subject"),
                "body": clean_email_body(
                    email.get("body", "")
                )
            }
        )

    return cleaned_emails