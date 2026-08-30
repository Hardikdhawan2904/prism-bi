# PrismBI Power BI Report — Build Spec

Working spec for the `.pbix` this folder will eventually hold
(`Reporting/PrismBI-Report.pbix`), built against the 8 views in
[`Shared-Postgres/reporting_views.sql`](../Shared-Postgres/reporting_views.sql).
Get Data → PostgreSQL database → `localhost:5433` / `mva_pipeline` → Import
mode → select only the `reporting` schema.

## Tables and how they relate

| View | Source | Grain |
|---|---|---|
| `vw_quality_gate_results` | Agent 1 | 1 row per uploaded dataset (`run_id` = `dataset_id`) |
| `vw_domain_classifications` | Agent 1 | 1 row per uploaded dataset, same `run_id` |
| `vw_readiness_scores` | Agent 2 | 1 row per profile run (`run_id` = Agent 2's UUID) |
| `vw_rule_approvals` | Agent 2 | 1 row per proposed rule, `run_id` FK to the profile run |
| `vw_kpis` | Agent 3 | 1 row per KPI lookup actually asked about |
| `vw_forecasts` | Agent 3 | 1 row per forecast point (multiple per `result_id`) |
| `vw_anomalies` | Agent 3 | 1 row per flagged record (multiple per `result_id`) |
| `vw_anomaly_runs` | Agent 3 | 1 row per anomaly-detection run, with the totals `vw_anomalies` doesn't carry |

Set up in Model view:

- **`vw_quality_gate_results` ↔ `vw_domain_classifications`**: 1:1 on `run_id` — exact, both come from the same `agent1.dataset_metadata` row.
- **`vw_readiness_scores` ↔ `vw_rule_approvals`**: 1:many on `run_id` — exact, both come from Agent 2's `profile_runs`/`rule_suggestions`.
- **`vw_anomalies` ↔ `vw_anomaly_runs`**: 1:many on `result_id` — exact, same source rows.
- **Everything else (across agents)**: relate on `dataset_name` only, cross-filter direction **single**, cardinality **many-to-many**. Do **not** treat this as a real key — per the views file's header comment, Agent 1 collapses re-uploads of a filename into one row while Agent 2/3 create a new row every time, so this join is approximate. Use it for slicing "show me everything about `retail_sales_daily.csv`," not for exact 1:1 rollups.

One general caveat worth internalizing before building: dev/test data currently in the DB includes non-production rows (`business_domain` values like `NotARealDomain`, filenames like `x.csv`/`claims.csv` from test runs). Re-run the pipeline on your real evaluation dataset(s) before the final screenshots, or filter test artifacts out with a slicer.

---

## Page 1 — Overview

**Purpose**: the one page a faculty reviewer sees first — total scale and domain spread.

**Visuals**:
- Card: **Total Datasets Processed** → `COUNTROWS(vw_quality_gate_results)`
- Card: **Overall Pass Rate** → measure `Quality Pass Rate %` (below)
- Card: **Avg ML Readiness** → `AVERAGE(vw_readiness_scores[ml_readiness])`
- Card: **Avg LLM Readiness** → `AVERAGE(vw_readiness_scores[llm_readiness])`
- Bar/pie chart: **Domain Distribution** — `vw_domain_classifications[business_domain]` on axis, count of `run_id` as value
- Table: recent runs — `dataset_name`, `business_domain`, `overall_status`, `upload_timestamp` from `vw_quality_gate_results` + `vw_domain_classifications`, sorted by `upload_timestamp` desc

**DAX measures**:
```dax
Quality Pass Rate % =
DIVIDE(
    CALCULATE(COUNTROWS(vw_quality_gate_results), vw_quality_gate_results[overall_status] = "PASS"),
    COUNTROWS(vw_quality_gate_results)
)
```

---

## Page 2 — Data Quality

**Purpose**: the compulsory "10 checks" story from Task 3's evaluation section.

**Visuals**:
- Column chart: **Dataset Score by Run** — `dataset_name` on axis, `dataset_score` as value, colored by `overall_status` (PASS/FAIL)
- Line chart: **Score Trend Over Time** — `upload_timestamp` on axis, `dataset_score`, reference line at `passing_score` (75)
- Column chart: **Warnings per Run** — `dataset_name` on axis, `warnings_count` as value (proxy for "how many of the 10 checks fired" — see the note below)
- Scatter: **Readiness Score Distribution** — `ml_readiness` (x) vs `llm_readiness` (y) from `vw_readiness_scores`, one point per run, colored by `primary_domain`

**DAX measures**:
```dax
Avg Dataset Score = AVERAGE(vw_quality_gate_results[dataset_score])

Avg Warnings Per Run = AVERAGE(vw_quality_gate_results[warnings_count])
```

**Honest caveat for the evaluation section**: `checks_total` is always 10 (Agent 1 always runs all 10 configured checks), but there's no stored per-check pass/fail boolean — only each check's achieved numeric score, and the check-name-to-score mapping is inside the still-JSON `quality_report` column, not flattened by this view. `warnings_count` is the closest real proxy for "how many checks flagged a problem," but a single check (e.g. `missing_values`) can emit up to 2 warnings, so it slightly overstates the failing-check count. State this plainly in the README rather than presenting `warnings_count` as if it were a clean per-check pass/fail tally.

---

## Page 3 — KPIs & Trends

**Purpose**: show the KPI-lookup capability. Expect this page to be sparse in the current dataset (each row is one Q&A turn, not a full KPI sweep) — say so rather than padding it.

**Visuals**:
- Table/matrix: `dataset_name`, `kpi_label`, `kpi_value`, `kpi_category` (unit), `computed_at` from `vw_kpis`
- Card: **KPIs Answered** → `COUNTROWS(vw_kpis)`
- Slicer: `dataset_name`

**DAX measures**:
```dax
Avg KPI Value = AVERAGE(vw_kpis[kpi_value])
```
(Only meaningful once filtered to a single `kpi_label` — averaging across unrelated KPIs/units otherwise, so pair this with a `kpi_label` slicer, never show it unfiltered.)

**Note**: `kpi_category` is Agent 3's `unit` field ($, %, ratio), not a business grouping like "Financial"/"Operational" — label the column accordingly in the visual rather than implying a taxonomy that doesn't exist yet.

---

## Page 4 — Forecasting

**Purpose**: actual vs. predicted with a confidence band, from `vw_forecasts`.

**Visuals**:
- Line + band chart: `forecast_date` on x-axis, `predicted_value` as the line, `lower_bound`/`upper_bound` as a shaded band (use the "Line and Stacked Column" or a ribbon chart, or two line series with the area between them shaded)
- Slicer: `metric_name`, `dataset_name`
- Table: raw forecast points (`forecast_date`, `predicted_value`, `lower_bound`, `upper_bound`) for the selected metric

**DAX measures**:
```dax
Forecast Range = [Upper Bound Avg] - [Lower Bound Avg]

Upper Bound Avg = AVERAGE(vw_forecasts[upper_bound])
Lower Bound Avg = AVERAGE(vw_forecasts[lower_bound])
```

**Evidence for your evaluation section**: this page is a good place to note the Prophet seasonality bug found and fixed during this project (`app/services/ml/forecaster.py` — multiplicative seasonality and unconditional yearly seasonality produced forecasts oscillating between -600K and +600K on a 24-month series with one outlier; fixed by defaulting to additive seasonality and gating yearly/quarterly seasonality behind real calendar-history thresholds, verified against a synthetic dataset with a known trend). That's a stronger, more credible story for "we validated the models" than just showing a chart that happens to look fine.

---

## Page 5 — Anomalies

**Purpose**: flagged records, anomaly rate, filterable by run.

**Visuals**:
- Scatter: `record_ordinal` (x) vs `anomaly_score` (y) from `vw_anomalies`, colored/sized by `dataset_name`
- Card: **Anomaly Rate %** → `AVERAGE(vw_anomaly_runs[anomaly_rate_pct])` (filtered to a run)
- Table: `dataset_name`, `anomaly_score`, `flagged_at`, plus expanded fields from `record_json` (in Power Query: right-click `record_json` → Transform → Parse JSON → expand columns; the exact fields vary by dataset since they're whatever feature/label columns that run scored — expect this, don't force a fixed schema)
- Bar chart: **Anomaly Count by Run** — `dataset_name` on axis, `anomaly_count` from `vw_anomaly_runs`

**DAX measures**:
```dax
Total Anomalies Flagged = SUM(vw_anomaly_runs[anomaly_count])

Overall Anomaly Rate % =
DIVIDE(SUM(vw_anomaly_runs[anomaly_count]), SUM(vw_anomaly_runs[total_records]))
```
(This `DIVIDE`-based measure aggregates correctly across multiple runs — prefer it over averaging `anomaly_rate_pct` directly, which would weight a 1-record run the same as a 1000-record one.)

---

## Page 6 — Rule Governance

**Purpose**: the human-in-the-loop story — the most distinguishing feature of the system, visually.

**Visuals**:
- Donut/bar chart: **Rules by Status** — `status` (proposed/approved/rejected) from `vw_rule_approvals`, count of `suggestion_id`
- Table: `dataset_name`, `status`, `confidence`, `rejection_reason`, `created_at`, `reviewed_at` — expand `proposed_rule` (Parse JSON in Power Query) to surface `rule_key`, `severity`, `reasoning` as their own columns
- Card: **Approval Rate %** → measure below
- Card: **Avg Suggestion Confidence** → `AVERAGE(vw_rule_approvals[confidence])`

**DAX measures**:
```dax
Rule Approval Rate % =
DIVIDE(
    CALCULATE(COUNTROWS(vw_rule_approvals), vw_rule_approvals[status] = "approved"),
    CALCULATE(COUNTROWS(vw_rule_approvals), vw_rule_approvals[status] <> "proposed")
)
```
(Denominator excludes still-`proposed`/pending rules — approval rate should measure decided cases, not dilute against ones nobody's reviewed yet.)

**Note**: there's no `reviewed_by` field anywhere in Agent 2's schema (only *when* — `reviewed_at` — and the outcome). Don't design a visual around "who approved this" — that data doesn't exist. If it matters for the submission, say so as a known limitation rather than a chart with a blank field.

---

## After building

1. File → Save As → `Reporting/PrismBI-Report.pbix`
2. File → Export → Export to PDF (or print each page) for the README screenshots
3. Re-run the pipeline on your real evaluation dataset(s) first if the current DB only has test/dev rows for some pages — check each page isn't showing `NotARealDomain`/`x.csv`-style test artifacts before the final export
