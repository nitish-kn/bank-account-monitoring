def validate_email_batch(emails):

    if not emails:
        raise ValueError(
            "No emails received"
        )

    if len(emails) > 10:
        raise ValueError(
            "Maximum 10 emails allowed"
        )

    return True