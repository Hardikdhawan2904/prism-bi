import axios from "axios";

// Orchestrator (Agent-Orchestrator, port 8002 by default) — POST /pipeline/run,
// GET /pipeline/status/{job_id}.
export const orchestratorApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://127.0.0.1:8002",
});

// Agent 2 (Data-Profiling-Agent) — called directly from the browser only for
// the rule-suggestion approve/reject buttons (Run Pipeline page). Everything
// else about Agent 2's result comes back through the orchestrator's response.
export const agent2Api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_AGENT2_URL || "http://127.0.0.1:8001/api/v1",
});
