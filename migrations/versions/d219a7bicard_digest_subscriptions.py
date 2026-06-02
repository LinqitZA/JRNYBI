"""digest_subscriptions table (feature #219)

Revision ID: d219a7bicard
Revises: db0aca1ebd32
Create Date: 2026-06-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "d219a7bicard"
down_revision = "db0aca1ebd32"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "digest_subscriptions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column("frequency", sa.String(16), nullable=False, server_default="daily"),
        sa.Column("delivery_hour", sa.Integer, nullable=False, server_default="8"),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_payload", JSONB, nullable=True),
        sa.Column("unsubscribe_token", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "user_id",
            "target_type",
            "target_id",
            "frequency",
            name="digest_subscriptions_unique",
        ),
    )
    op.create_index(
        "ix_digest_subscriptions_dispatch",
        "digest_subscriptions",
        ["active", "frequency", "delivery_hour"],
    )


def downgrade():
    op.drop_index("ix_digest_subscriptions_dispatch", table_name="digest_subscriptions")
    op.drop_table("digest_subscriptions")
