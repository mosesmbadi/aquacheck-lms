"""Add notes/contact_person/submitted_by to samples, category to complaints, pricing_type to inventory, quotation_type to quotations

Revision ID: 003_add_new_fields
Revises: 002_add_waste_industry_discharge
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "003_add_new_fields"
down_revision = "002_add_waste_industry_discharge"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ── samples: add notes, contact_person, submitted_by ──────────────────────
    if "samples" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("samples")]
        if "notes" not in existing:
            op.add_column("samples", sa.Column("notes", sa.Text(), nullable=True))
        if "contact_person" not in existing:
            op.add_column("samples", sa.Column("contact_person", sa.String(), nullable=True))
        if "submitted_by" not in existing:
            op.add_column("samples", sa.Column("submitted_by", sa.String(), nullable=True))

    # ── complaints: add category enum column ──────────────────────────────────
    if "complaints" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("complaints")]
        if "category" not in existing:
            op.execute(sa.text(
                "DO $$ BEGIN CREATE TYPE complaintcategory AS ENUM ('complaint', 'feedback');"
                " EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
            op.add_column(
                "complaints",
                sa.Column(
                    "category",
                    sa.Enum("complaint", "feedback", name="complaintcategory", create_type=False),
                    nullable=False,
                    server_default="complaint",
                ),
            )

    # ── inventory_items: add pricing_type enum column ─────────────────────────
    if "inventory_items" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("inventory_items")]
        if "pricing_type" not in existing:
            op.execute(sa.text(
                "DO $$ BEGIN CREATE TYPE pricingtype AS ENUM ('individual', 'package');"
                " EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
            op.add_column(
                "inventory_items",
                sa.Column(
                    "pricing_type",
                    sa.Enum("individual", "package", name="pricingtype", create_type=False),
                    nullable=False,
                    server_default="individual",
                ),
            )

    # ── quotations: add quotation_type enum column ────────────────────────────
    if "quotations" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("quotations")]
        if "quotation_type" not in existing:
            op.execute(sa.text(
                "DO $$ BEGIN CREATE TYPE quotationtype AS ENUM ('individual', 'package');"
                " EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
            op.add_column(
                "quotations",
                sa.Column(
                    "quotation_type",
                    sa.Enum("individual", "package", name="quotationtype", create_type=False),
                    nullable=False,
                    server_default="individual",
                ),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "samples" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("samples")]
        for col in ("notes", "contact_person", "submitted_by"):
            if col in existing:
                op.drop_column("samples", col)

    if "complaints" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("complaints")]
        if "category" in existing:
            op.drop_column("complaints", "category")

    if "inventory_items" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("inventory_items")]
        if "pricing_type" in existing:
            op.drop_column("inventory_items", "pricing_type")

    if "quotations" in inspector.get_table_names():
        existing = [c["name"] for c in inspector.get_columns("quotations")]
        if "quotation_type" in existing:
            op.drop_column("quotations", "quotation_type")
