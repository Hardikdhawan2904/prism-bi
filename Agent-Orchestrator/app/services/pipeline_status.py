"""In-memory job status tracking for POST /pipeline/run, so a frontend can
poll real per-stage progress instead of just waiting on one long blocking
call. Populated by orchestration_agent/graph.py's run_orchestrator_pipeline
via LangGraph's .astream(..., stream_mode="updates") — one callback per
completed node, in order — mirroring the same pattern Analytics-Agent's own
graph.py already uses for per-node timing (see run_analytics_graph there).

# ponytail: single-process, in-memory, lost on restart, no multi-worker
# fan-out — fine for this local-demo scope (one uvicorn process). Move to
# Redis or a DB-backed table if this ever runs behind more than one worker
# or needs to survive a restart.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

_JOBS: dict[str, dict[str, Any]] = {}

# Bounds unbounded growth from jobs nobody ever polls to completion (a
# client that generates a job_id then abandons the request). Not a real
# TTL/eviction system — just a cheap sweep on every new_job() call.
_MAX_JOB_AGE_SECONDS = 3600

_STAGE_LABELS = {
    "resolve_dataset_identity": "Checking for a cached result (Dataset Registry)",
    "call_agent1": "Agent 1: quality gate & domain classification",
    "extract_domain_and_metadata": "Preparing Agent 2's input",
    "call_agent2": "Agent 2: structural profiling & readiness scoring",
    "fetch_agent2_result": "Fetching Agent 2's full result",
    "persist_master_dataset": "Caching this result",
    "call_agent3": "Agent 3: KPI discovery, forecasting & anomaly detection",
    "finalize": "Finalizing response",
}


def _evict_stale_jobs() -> None:
    cutoff = time.time() - _MAX_JOB_AGE_SECONDS
    stale = [job_id for job_id, job in _JOBS.items() if job["updated_at"] < cutoff]
    for job_id in stale:
        del _JOBS[job_id]


def new_job() -> str:
    """Generate a fresh job_id. Callers may also supply their own
    client-generated id directly to start() — this is a convenience for
    server-side callers that don't have one yet."""
    _evict_stale_jobs()
    return str(uuid.uuid4())


def start(job_id: str) -> None:
    """Register a job as running, before the pipeline actually begins —
    so a poll that lands the instant the POST is received never 404s."""
    now = time.time()
    _JOBS[job_id] = {
        "job_id": job_id,
        "status": "running",
        "stage": None,
        "stage_label": None,
        "stages_completed": [],
        "started_at": now,
        "updated_at": now,
        "error": None,
    }


def mark_stage(job_id: str, node_name: str) -> None:
    """Record that `node_name` just completed. No-op if `job_id` isn't
    known (e.g. start() was never called for it) — status tracking is an
    enhancement, never something the pipeline itself depends on."""
    job = _JOBS.get(job_id)
    if job is None:
        return
    job["stage"] = node_name
    job["stage_label"] = _STAGE_LABELS.get(node_name, node_name)
    job["stages_completed"].append(node_name)
    job["updated_at"] = time.time()


def finish(job_id: str, ok: bool, error: str | None = None) -> None:
    """Mark a job done or errored. No-op if `job_id` isn't known."""
    job = _JOBS.get(job_id)
    if job is None:
        return
    job["status"] = "done" if ok else "error"
    job["error"] = error
    job["updated_at"] = time.time()


def get(job_id: str) -> dict[str, Any] | None:
    return _JOBS.get(job_id)
