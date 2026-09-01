"""add is_active to equipment

Revision ID: 002_add_is_active_to_equipment
Revises: 001_add_expiry_date
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = "002_add_is_active_to_equipment"
down_revision = "001_add_expiry_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("equipment", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("equipment", "is_active")
