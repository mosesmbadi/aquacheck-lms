"""Add test_packages and test_package_items tables

Revision ID: 004_add_test_packages
Revises: 003_add_new_fields
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "004_add_test_packages"
down_revision = "003_add_new_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "test_packages" not in tables:
        op.create_table(
            "test_packages",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False, unique=True),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "test_package_items" not in tables:
        op.create_table(
            "test_package_items",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            # FK to test_packages is safe — that table is created just above.
            # FK to test_catalog is intentionally omitted: test_catalog is created
            # by Base.metadata.create_all() in the backend startup, which runs
            # after migrations. Using a plain Integer avoids a "relation does not
            # exist" error on a fresh database while still preserving ORM-level
            # referential integrity through the SQLAlchemy relationship.
            sa.Column("package_id", sa.Integer, sa.ForeignKey("test_packages.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("catalog_item_id", sa.Integer, nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if "test_package_items" in tables:
        op.drop_table("test_package_items")
    if "test_packages" in tables:
        op.drop_table("test_packages")
