from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def run_migrations():
    """Dynamically add missing columns to users table for SQLite development database."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    try:
        if inspector.has_table("users"):
            columns = [col["name"] for col in inspector.get_columns("users")]
            with engine.begin() as conn:
                if "is_setup_completed" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_setup_completed BOOLEAN DEFAULT 0 NOT NULL"))
                if "spreadsheet_id" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN spreadsheet_id VARCHAR"))
                if "family_id" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN family_id INTEGER"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_family_id ON users (family_id)"))
                if "last_synced_at" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN last_synced_at DATETIME"))
                if "last_synced_status" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN last_synced_status VARCHAR DEFAULT 'not_started' NOT NULL"))
                if "last_synced_email_date" not in columns:
                    conn.execute(text("ALTER TABLE users ADD COLUMN last_synced_email_date DATETIME"))
    except Exception as e:
        print(f"Migration error: {e}")
