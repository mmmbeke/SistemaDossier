"""Pruebas de sanitización de consultas PDL."""
from __future__ import annotations

import pytest

from dossier.schemas.person_research import PersonResearchRequest, PersonResearchSource
from dossier.services.pdl_search import build_pdl_search_sql


def _req(**kwargs: object) -> PersonResearchRequest:
    base = {
        "full_name": "Jane Doe",
        "research_source": PersonResearchSource.pdl,
    }
    base.update(kwargs)
    return PersonResearchRequest(**base)


def test_build_pdl_search_sql_basic() -> None:
    sql = build_pdl_search_sql(_req(full_name="Jane Doe", company="Acme"), limit=5)
    assert sql is not None
    assert "first_name='Jane'" in sql
    assert "last_name='Doe'" in sql
    assert "job_company_name='Acme'" in sql
    assert "LIMIT" not in sql.upper()


def test_build_pdl_search_sql_rejects_sql_injection() -> None:
    with pytest.raises(ValueError, match="no permitidos"):
        build_pdl_search_sql(_req(full_name="Jane'; DROP TABLE person; --"))


def test_build_pdl_search_sql_escapes_quotes() -> None:
    sql = build_pdl_search_sql(_req(full_name="O'Brien Pat"), limit=3)
    assert sql is not None
    assert "O''Brien" in sql
