import { PowerBIEmbed } from "@/components/PowerBIEmbed";

const POWERBI_URL = process.env.NEXT_PUBLIC_POWERBI_EMBED_URL;

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Quality, readiness and analytics across every pipeline run — live in Power BI.
        </p>
      </div>
      {POWERBI_URL ? (
        <PowerBIEmbed url={POWERBI_URL} />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Set NEXT_PUBLIC_POWERBI_EMBED_URL in .env.local to show the Power BI report here.
        </p>
      )}
    </div>
  );
}
