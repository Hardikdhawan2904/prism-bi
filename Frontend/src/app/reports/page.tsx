"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, Pause, Play, RefreshCw, WifiOff, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PowerBIEmbed } from "@/components/PowerBIEmbed";
import { orchestratorApi } from "@/lib/api";

interface Summary {
  generated_at: string;
  total_runs: number;
  profile_runs: number;
  domain_breakdown: { business_domain: string; count: number }[];
  avg_ml_readiness: number | null;
  avg_llm_readiness: number | null;
  avg_overall_readiness: number | null;
  quality_pass_rate_pct: number | null;
  quality_runs: {
    dataset_name: string;
    business_domain: string | null;
    upload_timestamp: string;
    dataset_score: number;
    passing_score: number;
    overall_status: string;
    warnings_count: number;
  }[];
  readiness_by_domain: { domain: string; runs: number; analytics: number | null; ml: number | null; llm: number | null }[];
  runs_per_day: { day: string; runs: number }[];
  rule_status: { status: string; count: number }[];
  anomaly_runs: {
    dataset_name: string;
    model: string | null;
    total_records: number | null;
    anomaly_count: number | null;
    anomaly_rate_pct: number | null;
    created_at: string;
  }[];
  errors: Record<string, string>;
}

const REFRESH_MS = 15_000;
const POWERBI_URL = process.env.NEXT_PUBLIC_POWERBI_EMBED_URL;
// Tailwind 3 equivalent of the tabs component's (v4-only) active-state styles.
const TAB = "px-3 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

// Categorical slots 1–3 + chart chrome, stepped separately for each surface
// (dataviz reference palette; first three slots validate all-pairs in both modes).
const PALETTE = {
  light: { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", ink: "#52514e", grid: "#e7e6e2", pass: "#d03b3b" },
  dark: { s1: "#3987e5", s2: "#d95926", s3: "#199e70", ink: "#c3c2b7", grid: "#2e2e2c", pass: "#e66767" },
};

const fmt = (v: number | null | undefined, digits = 0) => (v == null ? "—" : v.toFixed(digits));
const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

function Panel({ title, subtitle, children, className }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5", className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Kpi({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
        {unit && value !== "—" && <span className="ml-0.5 text-base font-medium text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function ChartTooltip({ active, payload, label, suffix = "" }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">
            {typeof p.value === "number" ? `${p.value.toFixed(1).replace(/\.0$/, "")}${suffix}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { resolvedTheme } = useTheme();
  const c = resolvedTheme === "dark" ? PALETTE.dark : PALETTE.light;

  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [, tick] = useState(0); // re-render so "updated X ago" stays current

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await orchestratorApi.get<Summary>("/reporting/summary");
      setData(res.data);
      setError(null);
    } catch {
      setError("Can't reach the Orchestrator (port 8002). Start the backend with start-all.ps1.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
      tick((n) => n + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  const proposed = data?.rule_status.find((r) => r.status === "proposed")?.count ?? 0;
  const reviewed = (data?.rule_status ?? []).filter((r) => r.status !== "proposed").reduce((n, r) => n + r.count, 0);
  const passMark = data?.quality_runs[0]?.passing_score ?? 75;
  const axis = { fontSize: 11, fill: c.ink };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Quality, readiness and analytics across every pipeline run — live from Postgres.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", error ? "bg-destructive" : live ? "animate-pulse bg-emerald-500" : "bg-muted-foreground")} />
            {error ? "Offline" : live ? "Live" : "Paused"}
            {data && ` · updated ${ago(data.generated_at)}`}
          </span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setLive((v) => !v)}>
            {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {live ? "Pause" : "Resume"}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue={POWERBI_URL ? "powerbi" : "live"} className="flex-col">
        <TabsList className="h-9">
          <TabsTrigger value="powerbi" className={TAB}>Power BI report</TabsTrigger>
          <TabsTrigger value="live" className={TAB}>Live metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="powerbi" className="mt-2">
          {POWERBI_URL ? (
            <PowerBIEmbed url={POWERBI_URL} />
          ) : (
            <Empty>Set NEXT_PUBLIC_POWERBI_EMBED_URL in .env.local to show the Power BI report here.</Empty>
          )}
        </TabsContent>

        <TabsContent value="live" className="mt-2 flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertTitle>{data ? "Connection lost — showing the last data received" : "Not reachable"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!data && !error && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28" />)}
          <Skeleton className="col-span-2 h-72 lg:col-span-5" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi label="Datasets quality-gated" value={String(data.total_runs)} hint="Agent 1" />
            <Kpi label="Quality pass rate" value={fmt(data.quality_pass_rate_pct)} unit="%" hint={`Pass mark ${passMark}/100`} />
            <Kpi label="Profiling runs" value={String(data.profile_runs)} hint="Agent 2" />
            <Kpi label="Avg AI readiness" value={fmt(data.avg_overall_readiness)} unit="/100" hint={`ML ${fmt(data.avg_ml_readiness)} · LLM ${fmt(data.avg_llm_readiness)}`} />
            <Kpi label="Rules awaiting review" value={String(proposed)} hint={`${reviewed} reviewed`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Quality gate score by dataset" subtitle={`Latest upload per dataset · line marks the ${passMark} pass mark`}>
              {data.quality_runs.length === 0 ? (
                <Empty>No datasets have been quality-gated yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, data.quality_runs.length * 34)}>
                  <BarChart data={data.quality_runs} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke={c.grid} />
                    <XAxis type="number" domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="dataset_name" width={170} tick={axis} axisLine={false} tickLine={false}
                      tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<ChartTooltip />} />
                    <ReferenceLine x={passMark} stroke={c.pass} strokeDasharray="4 3"
                      label={{ value: "Pass", position: "top", fill: c.ink, fontSize: 11 }} />
                    <Bar isAnimationActive={false} dataKey="dataset_score" name="Score" fill={c.s1} radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="AI readiness by domain" subtitle="Average score (0–100) across profiling runs">
              {data.readiness_by_domain.length === 0 ? (
                <Empty>No profiling runs yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.readiness_by_domain} margin={{ right: 8 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="domain" tick={{ ...axis, angle: -30, textAnchor: "end" }} height={56} axisLine={false} tickLine={false} interval={0}
                      tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
                    <YAxis domain={[0, 100]} tick={axis} axisLine={false} tickLine={false} width={32} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<ChartTooltip />} />
                    <Legend itemSorter={null} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: c.ink }} />
                    <Bar isAnimationActive={false} dataKey="analytics" name="Analytics" fill={c.s1} radius={[4, 4, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="ml" name="ML" fill={c.s2} radius={[4, 4, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="llm" name="LLM" fill={c.s3} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Profiling runs per day" subtitle="Days with at least one Agent 2 run">
              {data.runs_per_day.length === 0 ? (
                <Empty>No runs recorded yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.runs_per_day} margin={{ right: 8 }}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="day" tick={axis} axisLine={false} tickLine={false}
                      tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" })} />
                    <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={32} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<ChartTooltip />} />
                    <Bar isAnimationActive={false} dataKey="runs" name="Runs" fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>

            <Panel title="Datasets by business domain" subtitle="Agent 1 classification">
              {data.domain_breakdown.length === 0 ? (
                <Empty>No classified datasets yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(160, data.domain_breakdown.length * 40)}>
                  <BarChart data={data.domain_breakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke={c.grid} />
                    <XAxis type="number" allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="business_domain" width={90} tick={axis} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<ChartTooltip />} />
                    <Bar isAnimationActive={false} dataKey="count" name="Datasets" fill={c.s1} radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Panel>
          </div>

          <Panel title="Recent quality-gate results">
            {data.quality_runs.length === 0 ? (
              <Empty>Nothing yet — run a dataset from the Assistant.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dataset</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Warnings</TableHead>
                    <TableHead className="text-right">Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.quality_runs.map((r) => (
                    <TableRow key={`${r.dataset_name}-${r.upload_timestamp}`}>
                      <TableCell className="font-medium">{r.dataset_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.business_domain ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.dataset_score, 1)}</TableCell>
                      <TableCell>
                        <Badge variant={r.overall_status === "PASS" ? "secondary" : "destructive"} className="gap-1">
                          {r.overall_status === "PASS" ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <XCircle className="h-3 w-3" />}
                          {r.overall_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.warnings_count}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{ago(r.upload_timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          <Panel title="Recent anomaly scans" subtitle="Agent 3 anomaly detection, one row per question answered">
            {data.anomaly_runs.length === 0 ? (
              <Empty>No anomaly scans yet — ask the Assistant about anomalies.</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dataset</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Records</TableHead>
                    <TableHead className="text-right">Anomalies</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.anomaly_runs.map((r, i) => (
                    <TableRow key={`${r.created_at}-${i}`}>
                      <TableCell className="font-medium">{r.dataset_name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.model ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_records?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.anomaly_count?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(r.anomaly_rate_pct, 1)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">{ago(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Panel>

          {Object.keys(data.errors).length > 0 && (
            <p className="text-xs text-muted-foreground">
              Some panels are empty because their views aren&apos;t available yet: {Object.keys(data.errors).join(", ")}.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Source: <code>reporting.vw_*</code> views in the shared Postgres. Refreshes every {REFRESH_MS / 1000}s while
            this tab is visible. A Power BI snapshot lives in <code>Reporting/PrismBI-Report.pbix</code>.
          </p>
        </>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
