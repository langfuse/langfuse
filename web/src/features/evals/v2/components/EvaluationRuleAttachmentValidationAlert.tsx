import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { type EvaluationRuleAttachmentValidationIssue } from "@/src/features/evals/v2/actions/validateAndAttachRule";

export function EvaluationRuleAttachmentValidationAlert({
  projectId,
  evaluatorId,
  ruleId,
  issue,
}: {
  projectId: string;
  evaluatorId: string;
  ruleId: string;
  issue: EvaluationRuleAttachmentValidationIssue;
}) {
  const query = new URLSearchParams({ edit: "1", ruleId });

  return (
    <Alert variant={issue.outcome === "failed" ? "destructive" : "default"}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>
        {issue.outcome === "failed"
          ? "Evaluator test failed"
          : "Evaluator could not be tested"}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>{issue.message}</p>
        <Button type="button" variant="outline" size="sm" asChild>
          <Link
            href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}?${query.toString()}`}
          >
            Review and test evaluator
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
