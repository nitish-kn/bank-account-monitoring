"""add chat tables

Revision ID: 20260813_0001
Revises: 646e7a6164a1
Create Date: 2026-08-13

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260813_0001"
down_revision: Union[str, Sequence[str], None] = "646e7a6164a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id VARCHAR PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id),
            title VARCHAR,
            last_message_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_messages (
            id VARCHAR PRIMARY KEY,
            session_id VARCHAR NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id),
            role VARCHAR NOT NULL,
            content TEXT NOT NULL,
            tool_calls JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS chat_tool_calls (
            id VARCHAR PRIMARY KEY,
            message_id VARCHAR NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
            session_id VARCHAR NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id),
            tool_name VARCHAR NOT NULL,
            arguments JSONB,
            result JSONB,
            cache_hit BOOLEAN NOT NULL DEFAULT false,
            latency_ms INTEGER,
            error VARCHAR,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
        """
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_id ON chat_sessions (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_sessions_user_last_msg ON chat_sessions (user_id, last_message_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_messages_session_created ON chat_messages (session_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_messages_user_id ON chat_messages (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_tool_calls_message_id ON chat_tool_calls (message_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_chat_tool_calls_session_id ON chat_tool_calls (session_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chat_tool_calls")
    op.execute("DROP TABLE IF EXISTS chat_messages")
    op.execute("DROP TABLE IF EXISTS chat_sessions")
