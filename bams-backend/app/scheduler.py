from apscheduler.schedulers.background import BackgroundScheduler

from .scripts.clean_parsed_rows import clean_parsed_rows

# BackgroundScheduler runs jobs in their own worker thread, not on FastAPI's
# event loop -- matches how the rest of this app offloads blocking work
# (see setup_service.py's background sync threads). AsyncIOScheduler would
# instead run `clean_parsed_rows` inline on the event loop, freezing every
# other request for as long as the cleanup takes.
scheduler = BackgroundScheduler()


def start_scheduler() -> None:
    scheduler.add_job(
        clean_parsed_rows,
        trigger="cron",
        hour=2,
        minute=0,
        id="clean_parsed_rows",
        replace_existing=True,
        max_instances=1,
    )
    
    scheduler.start()
