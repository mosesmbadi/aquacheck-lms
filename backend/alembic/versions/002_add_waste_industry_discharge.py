"""add waste_industry_type and discharge_destination to samples

Revision ID: 002_add_waste_industry_discharge
Revises: 001_add_is_active_to_equipment
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "002_add_waste_industry_discharge"
down_revision = "001_add_is_active_to_equipment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Fresh install: table doesn't exist yet — create_all in the backend will
    # create it with these columns already in the model definition, so we skip.
    if "samples" not in inspector.get_table_names():
        return

    existing_cols = [c["name"] for c in inspector.get_columns("samples")]
    if "waste_industry_type" not in existing_cols:
        op.add_column("samples", sa.Column("waste_industry_type", sa.String(), nullable=True))
    if "discharge_destination" not in existing_cols:
        op.add_column("samples", sa.Column("discharge_destination", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "samples" not in inspector.get_table_names():
        return
    existing_cols = [c["name"] for c in inspector.get_columns("samples")]
    if "discharge_destination" in existing_cols:
        op.drop_column("samples", "discharge_destination")
    if "waste_industry_type" in existing_cols:
        op.drop_column("samples", "waste_industry_type")
