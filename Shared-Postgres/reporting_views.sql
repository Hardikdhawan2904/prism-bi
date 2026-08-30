-- Shared-Postgres/reporting_views.sql
--
-- Read-only Power BI reporting layer on top of the three agents' existing
-- tables. Views only — no new tables here (analysis_results in agent3 is
-- created by Analytics-Agent/app/services/database.py::init_db(), not by
-- this file), no changes to any agent-owned table.
--
-- Run once against the shared instance:
--   $env:PGPASSWORD = "postgres"
--   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5433 -U postgres -d mva_pipeline -f Shared-Postgres/reporting_views.sql
--
-- Known limitations (see also README's Evaluation > Known Limitations):
--   * There is no shared run_id across agents. Agent 1 keys by dataset_id
--     (one row per filename, updated in place on re-upload); Agent 2's
--     profile_runs.id is an independently generated UUID with no reference
--     back to Agent 1. The only cross-agent join key is filename
--     (dataset_name / source_filename / dataset_filename below) — join on
--     it in Power BI, but treat it as approximate, not a strict 1:1 run
--     link, since Agent 1 collapses re-uploads of the same filename into
--     one row while Agent 2 and Agent 3 create a new row every time.
--   * vw_domain_classifications.confidence_score is always NULL — Agent 1
--     classifies business_domain/sub_domain but never persists the LLM's
--     confidence value for that classification.
--   * vw_rule_approvals has no reviewed_by — Agent 2's rule_suggestions
--     table doesn't track who reviewed a suggestion, only when
--     (reviewed_at) and the outcome (status/rejection_reason).
--   * vw_kpis / vw_forecasts / vw_anomalies read from agent3.analysis_results,
--     which only exists after Analytics-Agent has been restarted with the
--     insert_analysis_result() persistence hook (this change) and has
--     actually served at least one /analyze call. Each row is one Q&A
--     turn's evidence, not a full per-dataset KPI/forecast/anomaly sweep —
--     this system answers one business question at a time.
--   * A loosely-worded question (e.g. "Forecast revenue") often schedules
--     several analyses at once ("report mode") rather than one — evidence
--     is then {"analyses": {"forecast": {...}, "anomaly_detection": {...},
--     ...}} instead of the flat single-analysis shape. The three views
--     below normalize both shapes via reporting._agent3_evidence_slice()
--     so a row is never silently dropped just because the question wasn't
--     narrow enough to resolve to a single scheduled analysis.

CREATE SCHEMA IF NOT EXISTS reporting;

-- Normalizes agent3.analysis_results.evidence to one analysis type's flat
-- shape, whether the row came from a single-scheduled-analysis call (the
-- whole `evidence` blob already is that analysis's flat evidence) or a
-- "report mode" call (evidence = {"analyses": {analysis_type: {...}, ...}}).
CREATE OR REPLACE FUNCTION reporting._agent3_evidence_slice(evidence jsonb, analysis_type text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN evidence ? 'analyses' THEN evidence -> 'analyses' -> analysis_type
        ELSE evidence
    END;
$$;

-- ── Agent 1 — quality gate (the real "10 checks", see
-- Schema-Intelligence-Layer/app/services/quality_validator.py::QUALITY_CHECKS) ──
CREATE OR REPLACE VIEW reporting.vw_quality_gate_results AS
SELECT
    dataset_id                                              AS run_id,
    dataset_name,
    upload_timestamp,
    business_domain,
    processing_status,
    (quality_report::jsonb ->> 'dataset_score')::numeric    AS dataset_score,
    (quality_report::jsonb ->> 'passing_score')::numeric    AS passing_score,
    quality_report::jsonb ->> 'decision'                    AS overall_status,
    (SELECT count(*) FROM jsonb_object_keys(quality_report::jsonb -> 'checks'))
                                                             AS checks_total,
    jsonb_array_length(COALESCE(quality_report::jsonb -> 'warnings', '[]'::jsonb))
                                                             AS warnings_count
FROM agent1.dataset_metadata
WHERE quality_report IS NOT NULL;

-- ── Agent 1 — business domain classification ────────────────────────────────
CREATE OR REPLACE VIEW reporting.vw_domain_classifications AS
SELECT
    dataset_id      AS run_id,
    dataset_name,
    business_domain,
    sub_domain,
    NULL::numeric   AS confidence_score,  -- not persisted by Agent 1, see header note
    upload_timestamp
FROM agent1.dataset_metadata;

-- ── Agent 2 — AI readiness scores, one row per profile run ──────────────────
CREATE OR REPLACE VIEW reporting.vw_readiness_scores AS
SELECT
    pr.id                                                        AS run_id,
    pr.source_filename                                           AS dataset_name,
    pr.primary_domain,
    MAX(ra.score) FILTER (WHERE ra.assessment_type = 'ml_readiness')   AS ml_readiness,
    MAX(ra.score) FILTER (WHERE ra.assessment_type = 'llm_readiness')  AS llm_readiness,
    MAX(ra.score) FILTER (WHERE ra.assessment_type = 'analytics_readiness') AS analytics_readiness,
    MAX(ra.score) FILTER (WHERE ra.assessment_type = 'overall_ai_readiness') AS overall_readiness,
    (SELECT jsonb_agg(elem) FROM agent2.readiness_assessments ra2,
            jsonb_array_elements(ra2.strengths_json) elem WHERE ra2.run_id = pr.id) AS strengths,
    (SELECT jsonb_agg(elem) FROM agent2.readiness_assessments ra2,
            jsonb_array_elements(ra2.blockers_json) elem WHERE ra2.run_id = pr.id)  AS blocking_issues,
    pr.created_at,
    pr.completed_at
FROM agent2.profile_runs pr
LEFT JOIN agent2.readiness_assessments ra ON ra.run_id = pr.id
GROUP BY pr.id, pr.source_filename, pr.primary_domain, pr.created_at, pr.completed_at;

-- ── Agent 2 — proposed business rules & human approve/reject decisions ──────
CREATE OR REPLACE VIEW reporting.vw_rule_approvals AS
SELECT
    rs.id                       AS suggestion_id,
    rs.run_id,
    pr.source_filename          AS dataset_name,
    rs.suggested_definition_json AS proposed_rule,
    rs.confidence,
    rs.status,
    rs.comment,
    rs.rejection_reason,
    rs.created_at,
    rs.reviewed_at
FROM agent2.rule_suggestions rs
JOIN agent2.profile_runs pr ON pr.id = rs.run_id;

-- ── Agent 3 — KPI lookups actually asked about (evidence.kpi/unit/actual,
-- see app/services/analyzers/kpi_strategies.py::KPISummaryStrategy) ─────────
CREATE OR REPLACE VIEW reporting.vw_kpis AS
SELECT
    id                                AS result_id,
    dataset_filename                  AS dataset_name,
    kpi_name,
    slice ->> 'kpi'                   AS kpi_label,
    (slice ->> 'actual')::numeric     AS kpi_value,
    slice ->> 'unit'                  AS kpi_category,
    created_at                        AS computed_at
FROM (
    SELECT *, reporting._agent3_evidence_slice(evidence, 'kpi_summary') AS slice
    FROM agent3.analysis_results
) ar
WHERE slice ? 'actual';

-- ── Agent 3 — forecasts. All four forecast strategies (Prophet, Moving
-- Average, Linear Trend, Exponential Smoothing) converge on the same
-- evidence.forecast: [{ds, yhat, yhat_lower, yhat_upper}] shape. ───────────
CREATE OR REPLACE VIEW reporting.vw_forecasts AS
SELECT
    ar.id                                       AS result_id,
    ar.dataset_filename                         AS dataset_name,
    COALESCE(ar.kpi_name, ar.slice ->> 'model') AS metric_name,
    (elem ->> 'ds')::date                       AS forecast_date,
    (elem ->> 'yhat')::numeric                  AS predicted_value,
    (elem ->> 'yhat_lower')::numeric            AS lower_bound,
    (elem ->> 'yhat_upper')::numeric            AS upper_bound,
    ar.created_at
FROM (
    SELECT *, reporting._agent3_evidence_slice(evidence, 'forecast') AS slice
    FROM agent3.analysis_results
) ar,
     jsonb_array_elements(ar.slice -> 'forecast') elem
WHERE ar.slice ? 'forecast';

-- ── Agent 3 — anomalies (app/services/ml/anomaly_detector.py::detect, or
-- the Z-Score deterministic fallback used when report mode doesn't budget
-- an ML slot for this analysis — both return an evidence.anomalies list,
-- just with different member keys per record). ─────────────────────────────
CREATE OR REPLACE VIEW reporting.vw_anomalies AS
SELECT
    ar.id                                AS result_id,
    ar.dataset_filename                  AS dataset_name,
    row_number() OVER (PARTITION BY ar.id ORDER BY (elem ->> 'anomaly_score')::numeric) AS record_ordinal,
    (elem ->> 'anomaly_score')::numeric  AS anomaly_score,
    elem                                 AS record_json,
    ar.created_at                        AS flagged_at
FROM (
    SELECT *, reporting._agent3_evidence_slice(evidence, 'anomaly_detection') AS slice
    FROM agent3.analysis_results
) ar,
     jsonb_array_elements(ar.slice -> 'anomalies') elem
WHERE ar.slice ? 'anomalies';

-- ── Agent 3 — one row per anomaly-detection run, carrying the run-level
-- totals (total_records/anomaly_count/anomaly_rate_pct) that live
-- alongside — not inside — the `anomalies` array vw_anomalies unnests.
-- Needed as the denominator for an Anomaly Rate % DAX measure; vw_anomalies
-- alone only has the flagged rows, never the total scored.
CREATE OR REPLACE VIEW reporting.vw_anomaly_runs AS
SELECT
    ar.id                                  AS result_id,
    ar.dataset_filename                    AS dataset_name,
    ar.slice ->> 'model'                   AS model,
    (ar.slice ->> 'total_records')::int    AS total_records,
    (ar.slice ->> 'anomaly_count')::int    AS anomaly_count,
    (ar.slice ->> 'anomaly_rate_pct')::numeric AS anomaly_rate_pct,
    ar.slice -> 'feature_columns'          AS feature_columns,
    ar.created_at
FROM (
    SELECT *, reporting._agent3_evidence_slice(evidence, 'anomaly_detection') AS slice
    FROM agent3.analysis_results
) ar
WHERE ar.slice ? 'anomalies';
