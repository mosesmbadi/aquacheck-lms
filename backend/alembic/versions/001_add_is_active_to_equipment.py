"""add is_active to equipment

Revision ID: 001_add_is_active_to_equipment
Revises:
Create Date: 2026-05-06
"""
from alembic import op
import sqlalchemy as sa

revision = "001_add_is_active_to_equipment"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Fresh install: table doesn't exist yet — create_all in the backend will
    # create it with is_active already in the model definition, so we skip.
    if "equipment" not in inspector.get_table_names():
        return

    # Existing install: table exists but column may be missing — add it.
    existing_cols = [c["name"] for c in inspector.get_columns("equipment")]
    if "is_active" not in existing_cols:
        op.add_column(
            "equipment",
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "equipment" not in inspector.get_table_names():
        return
    existing_cols = [c["name"] for c in inspector.get_columns("equipment")]
    if "is_active" in existing_cols:
        op.drop_column("equipment", "is_active")
