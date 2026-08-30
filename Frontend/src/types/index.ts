// Shapes mirror the orchestrator's real response — see
// Agent-Orchestrator/app/routes/pipeline.py and app/agents/orchestration_agent/graph.py.
// Left loose (mostly `Record<string, unknown>` / optional fields) rather than
// fully typed to every agent's internal shape — those evolve independently
// of this frontend, and over-typing them just means this file rotting out of
// sync with the real API. Only the fields this app actually reads are named.

export interface PipelineStatus {
  job_id: string;
  status: "running" | "done" | "error";
  stage: string | null;
  stage_label: string | null;
  stages_completed: string[];
  started_at: number;
  updated_at: number;
  error: string | null;
}

export interface Agent1Result {
  dataset_id: string;
  dataset_name: string;
  business_domain: string;
  sub_domain: string;
  dataset_summary: string;
  row_count: number;
  column_count: number;
  quality_report?: {
    dataset_score: number;
    passing_score: number;
    decision: string;
    checks: Record<string, number>;
    warnings: string[];
  };
  [key: string]: unknown;
}

export interface Agent2Result {
  run_id: string;
  status?: string;
  readiness?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Agent3Result {
  status: "ok" | "skipped" | "failed" | "error";
  reason?: string;
  response?: string;
  execution_trace?: Array<Record<string, unknown>>;
  execution_summary?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PipelineRunResponse {
  agent1: Agent1Result;
  agent2: Agent2Result;
  agent3: Agent3Result | null;
  primary_domain_used: string;
  fingerprint?: string;
  copy_id?: string;
  was_cached?: boolean;
  // Error-shape fields (present instead of the above on a 4xx/5xx)
  stage?: string;
  note?: string;
  detail?: unknown;
}

export interface RuleSuggestion {
  suggestion_id: string;
  run_id: string;
  definition: {
    rule_key: string;
    description: string;
    severity: string;
    reasoning: string;
    target_column?: string;
    [key: string]: unknown;
  };
  confidence: number;
  status: string;
  comment: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}
