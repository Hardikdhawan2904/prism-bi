import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, LineChart, Users } from "lucide-react";

const STAGES = [
  {
    icon: ShieldCheck,
    title: "Agent 1 — Schema Intelligence",
    body: "A 10-check quality gate plus LLM-driven column descriptions and business-domain classification, before anything else runs.",
  },
  {
    icon: Users,
    title: "Agent 2 — Data Profiling",
    body: "Structural profiling, hierarchy inference, AI-readiness scoring, chart generation, and AI-proposed business rules — reviewed by a human before they ever apply automatically.",
  },
  {
    icon: LineChart,
    title: "Agent 3 — Analytics",
    body: "KPI discovery, forecasting, anomaly detection, and root-cause analysis, narrated in plain language for whichever business question you ask.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col items-start gap-4 py-8">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          One pipeline, three agents,
          <br />a business-ready answer.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          PrismBI takes a raw CSV or Excel upload end-to-end: quality gating, schema
          classification, structural profiling, AI-readiness scoring, and — for any
          business question you ask — KPI discovery, forecasting, and anomaly detection,
          narrated in plain language.
        </p>
        <div className="flex gap-3 pt-2">
          <Button asChild size="lg">
            <Link href="/run">
              Open the assistant <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/reports">View reports</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {STAGES.map((stage) => (
          <Card key={stage.title}>
            <CardHeader>
              <stage.icon className="mb-2 h-6 w-6 text-primary" />
              <CardTitle className="text-base">{stage.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{stage.body}</CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
