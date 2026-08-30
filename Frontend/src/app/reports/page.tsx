import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default function ReportsPage() {
  const embedUrl = process.env.NEXT_PUBLIC_POWERBI_EMBED_URL;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Quality gate, domain classification, AI-readiness, KPIs, forecasting, anomalies, and
          rule governance — built in Power BI Desktop against the pipeline&apos;s persisted output.
        </p>
      </div>

      <Alert>
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <AlertTitle>This page works even without the backend running</AlertTitle>
            <AlertDescription>
              It embeds a Power BI report published via &quot;Publish to Web&quot; — a static,
              publicly-accessible link, chosen deliberately since this project&apos;s data is
              synthetic/academic. It does not query the live database.
            </AlertDescription>
          </div>
        </div>
      </Alert>

      {embedUrl ? (
        <div className="overflow-hidden rounded-lg border">
          <iframe
            title="PrismBI Power BI Report"
            src={embedUrl}
            className="h-[80vh] w-full"
            frameBorder={0}
            allowFullScreen
          />
        </div>
      ) : (
        <Alert variant="destructive">
          <AlertTitle>Report not configured yet</AlertTitle>
          <AlertDescription>
            Set <code>NEXT_PUBLIC_POWERBI_EMBED_URL</code> (the Power BI &quot;Publish to
            Web&quot; link) in <code>.env.local</code> once the report is published.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
