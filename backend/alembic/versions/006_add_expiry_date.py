"""add expiry_date to inventory_items

Revision ID: 006_add_expiry_date
Revises: 005_reports_contract_nullable
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = "006_add_expiry_date"
down_revision = "005_reports_contract_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "inventory_items" not in inspector.get_table_names():
        return

    existing_cols = [c["name"] for c in inspector.get_columns("inventory_items")]
    if "expiry_date" not in existing_cols:
        op.add_column("inventory_items", sa.Column("expiry_date", sa.Date(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "inventory_items" not in inspector.get_table_names():
        return
    existing_cols = [c["name"] for c in inspector.get_columns("inventory_items")]
    if "expiry_date" in existing_cols:
        op.drop_column("inventory_items", "expiry_date")
