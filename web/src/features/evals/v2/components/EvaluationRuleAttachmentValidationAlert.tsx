import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { type EvaluationRuleAttachmentValidationIssue } from "@/src/features/evals/v2/actions/validateAndAttachRule";

export function EvaluationRuleAttachmentValidationAlert({
  issue,
  onDismiss,
  title = "Review evaluator variable mapping",
  reviewHref,
  onReview,
}: {
  issue: EvaluationRuleAttachmentValidationIssue;
  onDismiss?: () => void;
  title?: string;
  reviewHref?: string;
  onReview?: () => void;
}) {
  return (
    <Alert className="border-dark-yellow bg-light-yellow text-dark-yellow [&>svg]:text-dark-yellow pr-10">
      {onDismiss ? (
        <button
          type="button"
          className="absolute top-2.5 right-2.5 z-10 grid size-7 cursor-pointer place-items-center rounded-sm border-none bg-transparent !p-0"
          style={{ color: "var(--dark-yellow)" }}
          aria-label="Dismiss validation warning"
          onClick={onDismiss}
        >
          <X className="size-4 stroke-current" aria-hidden="true" />
        </button>
      ) : null}
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="pr-4">{title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-1">
        <p>{issue.message}</p>
        {reviewHref ? (
          <Link
            href={reviewHref}
            className="font-bold underline underline-offset-2"
            onClick={onReview}
          >
            Review how the evaluator maps data to variables
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
