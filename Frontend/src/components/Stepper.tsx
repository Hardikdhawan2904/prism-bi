import { CheckCircle2, CircleDashed, LoaderCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Mirrors Agent-Orchestrator/app/services/pipeline_status.py's _STAGE_LABELS
// and node order exactly — this is a display list, not a source of truth;
// stagesCompleted (from the real GET /pipeline/status/{job_id} poll) is
// what actually drives which steps show as done.
const STAGES: { key: string; label: string }[] = [
  { key: "resolve_dataset_identity", label: "Checking for a cached result" },
  { key: "call_agent1", label: "Agent 1: quality gate & domain classification" },
  { key: "extract_domain_and_metadata", label: "Preparing Agent 2's input" },
  { key: "call_agent2", label: "Agent 2: structural profiling & readiness scoring" },
  { key: "fetch_agent2_result", label: "Fetching Agent 2's full result" },
  { key: "persist_master_dataset", label: "Caching this result" },
  { key: "call_agent3", label: "Agent 3: KPIs, forecasting & anomaly detection" },
  { key: "finalize", label: "Finalizing response" },
];

export function Stepper({
  stagesCompleted,
  status,
}: {
  stagesCompleted: string[];
  status: "running" | "done" | "error";
}) {
  // The status API reports finished stages only, so the one in progress (or
  // the one that failed) is the stage after the furthest completed one.
  const activeIdx = Math.max(-1, ...stagesCompleted.map((k) => STAGES.findIndex((s) => s.key === k))) + 1;

  return (
    <ol className="flex flex-col gap-3">
      {STAGES.map((stage, i) => {
        const isDone = stagesCompleted.includes(stage.key);
        const isCurrent = i === activeIdx && status === "running";
        const isFailedHere = i === activeIdx && status === "error";

        return (
          <li key={stage.key} className="flex items-center gap-3">
            {isFailedHere ? (
              <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            ) : isDone ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            ) : isCurrent ? (
              <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" />
            ) : (
              <CircleDashed className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "text-sm",
                isDone && "text-foreground",
                isCurrent && "font-medium text-foreground",
                isFailedHere && "font-medium text-destructive",
                !isDone && !isCurrent && !isFailedHere && "text-muted-foreground"
              )}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
