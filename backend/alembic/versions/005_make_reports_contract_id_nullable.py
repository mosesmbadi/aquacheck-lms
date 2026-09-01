"""Make reports.contract_id nullable so standalone samples (no contract) can have reports

Revision ID: 005_make_reports_contract_id_nullable
Revises: 004_add_test_packages
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = "005_reports_contract_nullable"
down_revision = "004_add_test_packages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "reports" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("reports")}
        if "contract_id" in columns:
            op.alter_column("reports", "contract_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "reports" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("reports")}
        if "contract_id" in columns:
            op.alter_column("reports", "contract_id", existing_type=sa.Integer(), nullable=False)