"""SOC-W1 SQLI: dynamic `filter` AST pada `GET /items/{collection}`.

Kontrak api-w1 §2/§5: Filter AST → SQL terparameterisasi (QueryBuilder
push_bind), kedalaman ≤ 8, ≤ 64 node, peta field server-side, identifier
tervalidasi. Audit mengirim 12 probe (tautology, stacked, pg_sleep, union,
injeksi identifier/operator, depth/node overflow, cross-tenant) dan
memastikan TIDAK ADA yang menyebabkan 5xx atau bocor error SQL.
"""

from __future__ import annotations

import pytest

from application.w1_audit import audit_filter_sqli
from application.w1_vectors import filter_ast_sql_injection
from infrastructure.w1_soc_client import W1SecurityClient

pytestmark = [pytest.mark.soc, pytest.mark.injection, pytest.mark.wave1]

API = "/api/v1"


def _items_path(collection: str, filter_ast: dict) -> str:
    from urllib.parse import quote
    import json

    return f"{API}/items/{collection}?filter={quote(json.dumps(filter_ast, separators=(',', ':')), safe='')}"


@pytest.mark.parametrize(
    "probe", filter_ast_sql_injection(), ids=[p.probe_id for p in filter_ast_sql_injection()]
)
def test_soc_w1_sqli_filter_ast_probes(
    soc_w1: W1SecurityClient, soc_session_token, soc_collection, probe
):
    evidence = soc_w1.get_json(
        _items_path(soc_collection, dict(probe.filter_ast)), token=soc_session_token
    )
    finding = audit_filter_sqli(evidence, probe.probe_id)
    assert finding.passed, (
        f"SQLi/probe {probe.probe_id} ({probe.note}): {finding.observed} — "
        f"{evidence.body_excerpt[:160]!r}"
    )


def test_soc_w1_sqli_no_auth_probe(soc_w1, soc_collection):
    """Tanpa token: endpoint tetap menolak (401/403) — probe tidak melewati auth."""
    evidence = soc_w1.get_json(_items_path(soc_collection, {"and": [{"field": "name", "op": "eq", "value": "' OR '1'='1' --"}]}))
    assert evidence.status_code in {400, 401, 403, 404}, (
        f"items tanpa auth merespons HTTP {evidence.status_code}"
    )
