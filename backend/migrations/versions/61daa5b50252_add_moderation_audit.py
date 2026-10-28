"""add moderation audit

Revision ID: 61daa5b50252
Revises: 20261026_add_user_role
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "61daa5b50252"
down_revision: Union[str, Sequence[str], None] = "20261026_add_user_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "moderation_audits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("moderator_id", sa.Integer(), nullable=False),
        sa.Column("old_status", sa.String(length=20), nullable=False),
        sa.Column("new_status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
        sa.ForeignKeyConstraint(["moderator_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "ix_moderation_audits_report_id",
        "moderation_audits",
        ["report_id"],
        unique=False,
    )

    op.create_index(
        "ix_moderation_audits_moderator_id",
        "moderation_audits",
        ["moderator_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_moderation_audits_moderator_id",
        table_name="moderation_audits",
    )
    op.drop_index(
        "ix_moderation_audits_report_id",
        table_name="moderation_audits",
    )
    op.drop_table("moderation_audits")