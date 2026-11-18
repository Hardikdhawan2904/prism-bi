"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, Database, Gauge, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Markdown } from "@/components/Markdown";
import { RuleApprovalCard } from "@/components/RuleApprovalCard";
import type { Agent3Result, PipelineRunResponse, RuleSuggestion } from "@/types";

const humanize = (code: string) =>
  code.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function Section({ icon: Icon, title, aside, children }: {
  icon: typeof Database;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export function AnalyticsSection({ agent3 }: { agent3: Agent3Result | null | undefined }) {
  const [traceOpen, setTraceOpen] = useState(false);

  if (!agent3 || agent3.status === "skipped") {
    return (
      <Section icon={Sparkles} title="Answer">
        <p className="text-sm text-muted-foreground">
          {agent3?.reason ?? "No business question was asked — type one below to get KPIs, trends and anomalies."}
        </p>
      </Section>
    );
  }
  if (agent3.status === "failed" || agent3.status === "error") {
    return (
      <Section icon={Sparkles} title="Answer" aside={<Badge variant="destructive">Failed</Badge>}>
        <p className="text-sm text-destructive">{agent3.reason ?? "Agent 3 could not answer this question."}</p>
      </Section>
    );
  }
  return (
    <Section
      icon={Sparkles}
      title="Answer"
      aside={
        agent3.execution_trace && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTraceOpen((v) => !v)}>
            {traceOpen ? "Hide" : "Show"} trace
          </Button>
        )
      }
    >
      <Markdown content={agent3.response ?? ""} />
      {traceOpen && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(agent3.execution_trace, null, 2)}
        </pre>
      )}
    </Section>
  );
}

export function RunAnswer({
  result,
  pendingRules,
  onRuleReviewed,
}: {
  result: PipelineRunResponse;
  pendingRules: RuleSuggestion[];
  onRuleReviewed: (id: string) => void;
}) {
  const a1 = result.agent1;
  const q = a1?.quality_report;
  const passed = q?.decision === "PASS";
  const readiness = result.agent2?.readiness_assessments ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Section
        icon={Database}
        title="Dataset overview"
        aside={result.was_cached && <Badge variant="secondary">Cached</Badge>}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {a1?.business_domain && <Badge>{a1.business_domain}</Badge>}
          {a1?.sub_domain && <Badge variant="outline">{a1.sub_domain}</Badge>}
        </div>
        {a1?.dataset_summary && <p className="mb-3 text-sm text-muted-foreground">{a1.dataset_summary}</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Rows" value={a1?.row_count?.toLocaleString() ?? "—"} />
          <Stat label="Columns" value={a1?.column_count ?? "—"} />
          <Stat label="Domain used" value={result.primary_domain_used ?? "—"} />
        </div>
      </Section>

      {q && (
        <Section
          icon={ShieldCheck}
          title="Quality gate"
          aside={
            <Badge variant={passed ? "default" : "destructive"} className="gap-1">
              {passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {q.decision}
            </Badge>
          }
        >
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Score {q.dataset_score}/100</span>
            <span>Pass mark {q.passing_score}</span>
          </div>
          <Progress value={q.dataset_score} className="h-2" />
          {Object.keys(q.checks ?? {}).length > 0 && (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {Object.entries(q.checks).map(([name, pts]) => (
                <div key={name} className="flex justify-between border-b border-border/50 py-1">
                  <dt className="text-muted-foreground">{humanize(name)}</dt>
                  <dd className="font-medium tabular-nums">{pts}</dd>
                </div>
              ))}
            </dl>
          )}
          {q.warnings?.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {q.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {readiness.length > 0 && (
        <Section icon={Gauge} title="AI readiness">
          <div className="flex flex-col gap-4">
            {readiness.map((r) => (
              <div key={r.assessment_type}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{humanize(r.assessment_type)}</span>
                  <span className="tabular-nums text-muted-foreground">{Math.round(r.score)}/100</span>
                </div>
                <Progress value={r.score} className="h-2" />
                {(r.blocking_issues?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.blocking_issues!.map((b) => (
                      <Badge key={b.code} variant="destructive" className="text-[10px] font-normal">
                        {humanize(b.code)}
                      </Badge>
                    ))}
                  </div>
                )}
                {(r.strengths?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.strengths!.map((s) => (
                      <Badge key={s.code} variant="secondary" className="text-[10px] font-normal">
                        {humanize(s.code)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <AnalyticsSection agent3={result.agent3} />

      {pendingRules.length > 0 && (
        <Section
          icon={BarChart3}
          title="Rules awaiting your review"
          aside={<Badge variant="secondary">{pendingRules.length}</Badge>}
        >
          <div className="flex flex-col gap-3">
            {pendingRules.map((s) => (
              <RuleApprovalCard key={s.suggestion_id} suggestion={s} onReviewed={onRuleReviewed} />
            ))}
          </div>
        </Section>
      )}

      <Link href="/results" className="w-fit text-xs text-primary underline underline-offset-2">
        Open full results page →
      </Link>
    </div>
  );
}
