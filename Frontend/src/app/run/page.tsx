"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Stepper } from "@/components/Stepper";
import { RuleApprovalCard } from "@/components/RuleApprovalCard";
import { agent2Api, orchestratorApi } from "@/lib/api";
import type { PipelineRunResponse, PipelineStatus, RuleSuggestion } from "@/types";

const formSchema = z.object({
  business_question: z.string().max(2000).optional(),
  target_column: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const DEMO_QUESTION = "What is the gross written premium trend and are there any anomalies?";
const POLL_INTERVAL_MS = 1500;

export default function RunPipelinePage() {
  const router = useRouter();
  const { register, handleSubmit, setValue } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [pollStatus, setPollStatus] = useState<PipelineStatus | null>(null);
  const [result, setResult] = useState<PipelineRunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [pendingRules, setPendingRules] = useState<RuleSuggestion[]>([]);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  async function runPipeline(uploadFile: File, values: FormValues) {
    setRunning(true);
    setResult(null);
    setRunError(null);
    setPendingRules([]);
    setPollStatus(null);

    const jobId = crypto.randomUUID();

    // Poll GET /pipeline/status/{job_id} concurrently with the long-running
    // POST below — the POST itself doesn't return until the whole pipeline
    // finishes, this is what drives the live stepper in the meantime.
    pollTimer.current = setInterval(async () => {
      try {
        const { data } = await orchestratorApi.get<PipelineStatus>(`/pipeline/status/${jobId}`);
        setPollStatus(data);
        if (data.status !== "running") stopPolling();
      } catch {
        // 404 before the POST has landed server-side yet — not an error, just not registered.
      }
    }, POLL_INTERVAL_MS);

    const form = new FormData();
    form.append("file", uploadFile);
    form.append("job_id", jobId);
    if (values.business_question) form.append("business_question", values.business_question);
    if (values.target_column) form.append("target_column", values.target_column);

    try {
      const { data } = await orchestratorApi.post<PipelineRunResponse>("/pipeline/run", form);
      stopPolling();
      setResult(data);

      if (data.agent2?.run_id) {
        try {
          const { data: suggestions } = await agent2Api.get<{ suggestions: RuleSuggestion[] }>(
            "/rule-suggestions",
            { params: { status: "proposed" } }
          );
          setPendingRules(suggestions.suggestions.filter((s) => s.run_id === data.agent2.run_id));
        } catch {
          // Non-fatal — Agent 2 might be unreachable for direct browser calls (CORS/down).
          // The full run result itself already succeeded.
        }
      }
    } catch (err: unknown) {
      stopPolling();
      const detail =
        (err as { response?: { data?: { note?: string; detail?: string } } })?.response?.data?.note ||
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "The pipeline run failed. Check that all backend services are running.";
      setRunError(String(detail));
    } finally {
      setRunning(false);
    }
  }

  const onSubmit = handleSubmit((values) => {
    if (!file) {
      toast.error("Choose a file first.");
      return;
    }
    runPipeline(file, values);
  });

  async function runDemoDataset() {
    setValue("business_question", DEMO_QUESTION);
    const res = await fetch("/demo/insurance_variance_data_native.csv");
    const blob = await res.blob();
    const demoFile = new File([blob], "insurance_variance_data_native.csv", { type: "text/csv" });
    setFile(demoFile);
    runPipeline(demoFile, { business_question: DEMO_QUESTION });
  }

  function goToResults() {
    if (!result) return;
    sessionStorage.setItem("mva:lastPipelineResult", JSON.stringify(result));
    router.push("/results");
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Run Pipeline</h1>
        <p className="text-muted-foreground">
          Upload a dataset to watch Agent 1, Agent 2, and (optionally) Agent 3 run in sequence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a dataset</CardTitle>
          <CardDescription>
            No dataset handy? <button className="underline underline-offset-2" onClick={runDemoDataset} disabled={running}>Run the bundled Insurance demo dataset</button> instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">CSV or Excel file</Label>
              <Input
                id="file"
                type="file"
                accept=".csv,.xlsx"
                disabled={running}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="business_question">Business question (optional — required for Agent 3)</Label>
              <Input
                id="business_question"
                placeholder="e.g. What is the gross written premium trend?"
                disabled={running}
                {...register("business_question")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target_column">Target column override (optional)</Label>
              <Input id="target_column" disabled={running} {...register("target_column")} />
            </div>
            <Button type="submit" disabled={running || !file} className="w-fit">
              {running ? "Running…" : "Run Pipeline"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {(running || pollStatus) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progress</CardTitle>
            <CardDescription>
              LLM calls can be rate-limited and take up to a minute per stage — this is normal, not stuck.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stepper
              stagesCompleted={pollStatus?.stages_completed ?? []}
              currentStage={pollStatus?.stage ?? null}
              status={pollStatus?.status ?? "running"}
            />
          </CardContent>
        </Card>
      )}

      {runError && (
        <Alert variant="destructive">
          <AlertTitle>Pipeline failed</AlertTitle>
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run complete</CardTitle>
            <CardDescription>
              Classified as <strong>{result.agent1?.business_domain}</strong>
              {result.was_cached ? " (served from cache)" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {pendingRules.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">
                  {pendingRules.length} AI-proposed rule{pendingRules.length > 1 ? "s" : ""} awaiting review
                </h3>
                {pendingRules.map((s) => (
                  <RuleApprovalCard
                    key={s.suggestion_id}
                    suggestion={s}
                    onReviewed={(id) => setPendingRules((prev) => prev.filter((r) => r.suggestion_id !== id))}
                  />
                ))}
              </div>
            )}
            <Button onClick={goToResults} className="w-fit">
              View Results
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
