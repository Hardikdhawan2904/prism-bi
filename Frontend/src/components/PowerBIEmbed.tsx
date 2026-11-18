"use client";

import { useRef, useState } from "react";
import { ExternalLink, Maximize2, Radio, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// The semantic model is DirectQuery: every load of the report queries Postgres
// live through PrismBI-Gateway, so there's no refresh schedule to show.
export function PowerBIEmbed({ url }: { url: string }) {
  const frameBox = useRef<HTMLDivElement>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reportId = url.match(/reportId=([^&]+)/)?.[1];
  // Give the report the whole frame: the filter pane is empty and there's one page.
  const src = `${url}${url.includes("?") ? "&" : "?"}filterPaneEnabled=false&navContentPaneEnabled=false`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-500" />
          <span className="font-medium text-foreground">Live</span>
          DirectQuery — each load reads Postgres through PrismBI-Gateway, so new runs show up immediately
        </span>
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCw className="h-3.5 w-3.5" /> Reload
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
            onClick={() => frameBox.current?.requestFullscreen()}>
            <Maximize2 className="h-3.5 w-3.5" /> Full screen
          </Button>
          {reportId && (
            <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <a href={`https://app.powerbi.com/groups/me/reports/${reportId}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open in Power BI
              </a>
            </Button>
          )}
        </span>
      </div>
      <div ref={frameBox} className="overflow-hidden rounded-xl border bg-card">
        <iframe key={reloadKey} title="PrismBI Power BI report" src={src} className="aspect-video h-full w-full"
          allowFullScreen />
      </div>
      <p className="text-xs text-muted-foreground">
        Secure embed — sign in with your organisation account if prompted. Needs this laptop, PrismBI-Gateway and
        Postgres running.
      </p>
    </div>
  );
}
