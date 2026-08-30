"""tests/test_pipeline_status.py — the in-memory job store behind
GET /pipeline/status/{job_id} does what the frontend's poller depends on:
stages append in order, and an unknown job_id is a clean miss, not a KeyError.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services import pipeline_status


def test_unknown_job_id_returns_none():
    assert pipeline_status.get("does-not-exist") is None


def test_stages_recorded_in_order():
    job_id = pipeline_status.new_job()
    pipeline_status.start(job_id)
    pipeline_status.mark_stage(job_id, "call_agent1")
    pipeline_status.mark_stage(job_id, "call_agent2")

    job = pipeline_status.get(job_id)
    assert job["status"] == "running"
    assert job["stages_completed"] == ["call_agent1", "call_agent2"]
    assert job["stage"] == "call_agent2"
    assert job["stage_label"] == pipeline_status._STAGE_LABELS["call_agent2"]


def test_finish_ok_sets_done_status():
    job_id = pipeline_status.new_job()
    pipeline_status.start(job_id)
    pipeline_status.finish(job_id, ok=True)
    assert pipeline_status.get(job_id)["status"] == "done"


def test_finish_error_sets_error_status_and_message():
    job_id = pipeline_status.new_job()
    pipeline_status.start(job_id)
    pipeline_status.finish(job_id, ok=False, error="boom")
    job = pipeline_status.get(job_id)
    assert job["status"] == "error"
    assert job["error"] == "boom"


def test_mark_stage_on_unknown_job_id_is_a_noop_not_an_error():
    pipeline_status.mark_stage("does-not-exist", "call_agent1")  # must not raise
