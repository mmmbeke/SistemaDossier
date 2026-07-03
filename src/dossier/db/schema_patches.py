"""Parches DDL idempotentes para bases ya creadas (``create_all`` no altera tablas existentes)."""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

_PATCHES = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS dossier_output_language VARCHAR(10) NOT NULL DEFAULT 'match';",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS dossier_retention_days INTEGER DEFAULT 30;",
    """
    CREATE TABLE IF NOT EXISTS dossier_shares (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        dossier_id UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
        shared_with_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shared_by_user_id UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dossier_id, shared_with_user_id)
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_dossier_shares_dossier ON dossier_shares(dossier_id);",
    "CREATE INDEX IF NOT EXISTS idx_dossier_shares_user ON dossier_shares(shared_with_user_id);",
    """
    CREATE TABLE IF NOT EXISTS org_invites (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        token VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        invited_by_user_id UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_org_invites_org ON org_invites(organization_id);",
    "CREATE INDEX IF NOT EXISTS idx_org_invites_email ON org_invites(email);",
    "CREATE INDEX IF NOT EXISTS idx_org_invites_status ON org_invites(status);",
)


def apply_schema_patches(engine: Engine) -> None:
    with engine.begin() as conn:
        for sql in _PATCHES:
            conn.execute(text(sql))
