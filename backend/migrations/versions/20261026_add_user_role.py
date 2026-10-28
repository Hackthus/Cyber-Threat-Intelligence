"""Add role to users."""

from alembic import op
import sqlalchemy as sa

revision = "20261026_add_user_role"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(length=20),
            nullable=False,
            server_default="user",
        ),
    )


def downgrade():
    op.drop_column("users", "role")
