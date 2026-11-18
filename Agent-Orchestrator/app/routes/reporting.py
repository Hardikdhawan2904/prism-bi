"""Live reporting summary — queries the same reporting.vw_* views built for
Power BI (see Shared-Postgres/reporting_views.sql), directly from Postgres,
for the Frontend's Reports page. Exists because Power BI's Publish-to-Web
requires either a public Microsoft account (blocked: personal accounts can't
sign up for Power BI at all) or an institutional one (blocked: SRM's tenant
policy rejects self-service Power BI/Fabric signup) for a live embed, and its
On-premises Data Gateway (Personal Mode) has a broken PostgreSQL connector on
this setup (confirmed: direct psycopg2 connections succeed, three separate
gateway-credential paths in the Power BI Service UI all fail identically).
This endpoint sidesteps all of that — same source-of-truth views, no
external service dependency.
"""

from __future__ import annotations

from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/reporting", tags=["Reporting"])


def _get_connection() -> psycopg2.extensions.connection:
    return psycopg2.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        dbname=settings.POSTGRES_DB,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        cursor_factory=psycopg2.extras.RealDictCursor,
        options="-c search_path=reporting",
    )


def _rows(cur, sql: str) -> list[dict]:
    cur.execute(sql)
    return [dict(r) for r in cur.fetchall()]


# Each panel's query. Agent 3's views (anomaly runs) depend on
# agent3.analysis_results existing, so every panel is fetched independently
# and a missing view yields an empty panel instead of failing the page.
_PANELS: dict[str, str] = {
    "domain_breakdown": (
        "SELECT business_domain, COUNT(DISTINCT run_id) AS count "
        "FROM vw_domain_classifications GROUP BY business_domain ORDER BY count DESC"
    ),
    "readiness_totals": (
        "SELECT COUNT(*) AS profile_runs, AVG(ml_readiness) AS avg_ml_readiness, "
        "AVG(llm_readiness) AS avg_llm_readiness, AVG(overall_readiness) AS avg_overall_readiness "
        "FROM vw_readiness_scores"
    ),
    "quality_totals": (
        "SELECT COUNT(*) FILTER (WHERE overall_status = 'PASS')::float / NULLIF(COUNT(*), 0) * 100 "
        "AS quality_pass_rate_pct FROM vw_quality_gate_results"
    ),
    "quality_runs": (
        "SELECT dataset_name, business_domain, upload_timestamp, dataset_score, passing_score, "
        "overall_status, warnings_count FROM vw_quality_gate_results ORDER BY upload_timestamp DESC LIMIT 25"
    ),
    "readiness_by_domain": (
        "SELECT COALESCE(primary_domain, 'Unclassified') AS domain, COUNT(*) AS runs, "
        "AVG(analytics_readiness) AS analytics, AVG(ml_readiness) AS ml, AVG(llm_readiness) AS llm "
        "FROM vw_readiness_scores GROUP BY 1 ORDER BY runs DESC"
    ),
    "runs_per_day": (
        "SELECT created_at::date AS day, COUNT(*) AS runs FROM vw_readiness_scores "
        "WHERE created_at IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 30"
    ),
    "rule_status": "SELECT status, COUNT(*) AS count FROM vw_rule_approvals GROUP BY status ORDER BY count DESC",
    "anomaly_runs": (
        "SELECT dataset_name, model, total_records, anomaly_count, anomaly_rate_pct, created_at "
        "FROM vw_anomaly_runs ORDER BY created_at DESC LIMIT 10"
    ),
}


@router.get("/summary")
def reporting_summary():
    """Live snapshot for the Frontend's Reports dashboard, queried fresh from
    the reporting.vw_* views on every call (no caching). Sync def on purpose:
    psycopg2 blocks, so FastAPI runs this in its threadpool instead of
    stalling the event loop while the page polls."""
    panels: dict[str, list[dict]] = {}
    errors: dict[str, str] = {}
    conn = _get_connection()
    try:
        for name, sql in _PANELS.items():
            try:
                with conn.cursor() as cur:
                    panels[name] = _rows(cur, sql)
            except psycopg2.Error as e:
                conn.rollback()
                panels[name] = []
                errors[name] = e.pgerror or str(e)
    finally:
        conn.close()

    readiness = (panels["readiness_totals"] or [{}])[0]
    quality = (panels["quality_totals"] or [{}])[0]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_runs": sum(r["count"] for r in panels["domain_breakdown"]),
        "profile_runs": readiness.get("profile_runs", 0),
        "domain_breakdown": panels["domain_breakdown"],
        "avg_ml_readiness": readiness.get("avg_ml_readiness"),
        "avg_llm_readiness": readiness.get("avg_llm_readiness"),
        "avg_overall_readiness": readiness.get("avg_overall_readiness"),
        "quality_pass_rate_pct": quality.get("quality_pass_rate_pct"),
        "quality_runs": panels["quality_runs"],
        "readiness_by_domain": panels["readiness_by_domain"],
        "runs_per_day": list(reversed(panels["runs_per_day"])),
        "rule_status": panels["rule_status"],
        "anomaly_runs": panels["anomaly_runs"],
        "errors": errors,
    }
