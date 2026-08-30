"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { agent2Api } from "@/lib/api";
import type { RuleSuggestion } from "@/types";

export function RuleApprovalCard({
  suggestion,
  onReviewed,
}: {
  suggestion: RuleSuggestion;
  onReviewed: (suggestionId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function approve() {
    setSubmitting(true);
    try {
      await agent2Api.post(`/rule-suggestions/${suggestion.suggestion_id}/approve`, {
        comment: null,
      });
      toast.success(`Approved: ${suggestion.definition.rule_key}`);
      onReviewed(suggestion.suggestion_id);
    } catch {
      toast.error("Failed to approve — is Agent 2 (port 8001) running?");
    } finally {
      setSubmitting(false);
    }
  }

  async function reject() {
    setSubmitting(true);
    try {
      await agent2Api.post(`/rule-suggestions/${suggestion.suggestion_id}/reject`, {
        reason: null,
      });
      toast.success(`Rejected: ${suggestion.definition.rule_key}`);
      onReviewed(suggestion.suggestion_id);
    } catch {
      toast.error("Failed to reject — is Agent 2 (port 8001) running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{suggestion.definition.rule_key}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{suggestion.definition.description}</p>
        </div>
        <Badge variant={suggestion.definition.severity === "high" ? "destructive" : "secondary"}>
          {suggestion.definition.severity}
        </Badge>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {suggestion.definition.reasoning}
        <div className="mt-1 text-xs">Confidence: {Math.round(suggestion.confidence * 100)}%</div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm" onClick={approve} disabled={submitting}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={reject} disabled={submitting}>
          Reject
        </Button>
      </CardFooter>
    </Card>
  );
}
