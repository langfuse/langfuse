import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { type EvaluationRuleAttachmentValidationIssue } from "@/src/features/evals/v2/actions/validateAndAttachRule";

export function EvaluationRuleAttachmentValidationAlert({
  projectId,
  evaluatorId,
  ruleId,
  issue,
  onReview,
  onDismiss,
  onAttachAnyway,
  attachAnywayLabel = "Attach anyway",
  attaching = false,
}: {
  projectId: string;
  evaluatorId: string;
  ruleId?: string;
  issue: EvaluationRuleAttachmentValidationIssue;
  onReview?: () => void;
  onDismiss?: () => void;
  onAttachAnyway?: () => void;
  attachAnywayLabel?: string;
  attaching?: boolean;
}) {
  const query = new URLSearchParams({ edit: "1" });
  if (ruleId) query.set("ruleId", ruleId);

  return (
    <Alert
      variant={issue.outcome === "failed" ? "destructive" : "default"}
      className={onDismiss ? "pr-10" : undefined}
    >
      <AlertTriangle className="h-4 w-4" />
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-2 right-2"
          aria-label="Dismiss validation warning"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
      <AlertTitle className="pr-4">
        {issue.outcome === "failed"
          ? "Evaluator test failed"
          : "Evaluator could not be tested"}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>{issue.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link
              href={`/project/${projectId}/evals/v2/${encodeURIComponent(evaluatorId)}?${query.toString()}`}
              onClick={onReview}
            >
              Review and test evaluator
            </Link>
          </Button>
          {onAttachAnyway ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={attaching}
              disabled={attaching}
              onClick={onAttachAnyway}
            >
              {attachAnywayLabel}
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
