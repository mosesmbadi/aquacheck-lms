"""add expiry_date to inventory_items

Revision ID: 001_add_expiry_date
Revises: 
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = "001_add_expiry_date"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_items", sa.Column("expiry_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_items", "expiry_date")
