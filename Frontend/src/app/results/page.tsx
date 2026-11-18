"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChatBubble } from "@/components/ChatBubble";
import { Markdown } from "@/components/Markdown";
import type { PipelineRunResponse } from "@/types";

export default function ResultsPage() {
  const [result, setResult] = useState<PipelineRunResponse | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("mva:lastPipelineResult");
    if (raw) setResult(JSON.parse(raw));
  }, []);

  if (!result) {
    return (
      <Alert>
        <AlertTitle>No run to show yet</AlertTitle>
        <AlertDescription>
          Run the pipeline first — results are shown right after a run completes, not persisted
          across page reloads.{" "}
          <Link href="/run" className="underline underline-offset-2">
            Go to Run Pipeline
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  const quality = result.agent1?.quality_report;
  const agent3 = result.agent3;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Results</h1>
        <p className="text-muted-foreground">{result.agent1?.dataset_name}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quality Gate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={quality?.decision === "PASS" ? "default" : "destructive"}>
                {quality?.decision ?? "—"}
              </Badge>
              <span className="text-muted-foreground">
                {quality?.dataset_score}/{quality ? 100 : "—"} (passing: {quality?.passing_score})
              </span>
            </div>
            {quality?.warnings && quality.warnings.length > 0 && (
              <ul className="list-inside list-disc text-muted-foreground">
                {quality.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Classification</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div>
              Domain: <strong>{result.agent1?.business_domain}</strong> / {result.agent1?.sub_domain}
            </div>
            <div className="text-muted-foreground">{result.agent1?.dataset_summary}</div>
            <div className="text-muted-foreground">
              {result.agent1?.row_count?.toLocaleString()} rows × {result.agent1?.column_count} columns
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent 3 — Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          {!agent3 || agent3.status === "skipped" ? (
            <p className="text-sm text-muted-foreground">
              Skipped{agent3?.reason ? `: ${agent3.reason}` : " — no business question was asked."}
            </p>
          ) : agent3.status === "failed" || agent3.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>Agent 3 failed</AlertTitle>
              <AlertDescription>{agent3.reason ?? "See execution trace for details."}</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-4">
              <ChatBubble role="assistant">
                <Markdown content={agent3.response ?? ""} />
              </ChatBubble>
              {agent3.execution_trace && (
                <div>
                  <Button variant="outline" size="sm" onClick={() => setTraceOpen((v) => !v)}>
                    {traceOpen ? "Hide" : "Show"} execution trace
                  </Button>
                  {traceOpen && (
                    <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(agent3.execution_trace, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
