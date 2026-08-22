import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";

export function EvaluationRuleAttachmentValidationAlert({
  message,
  onDismiss,
  reviewHref,
  onReview,
}: {
  /** Why the attached rule needs a mapping review. */
  message: string;
  onDismiss: () => void;
  reviewHref: string;
  onReview?: () => void;
}) {
  return (
    <Alert className="border-dark-yellow bg-light-yellow text-dark-yellow [&>svg]:text-dark-yellow pr-10">
      <button
        type="button"
        className="text-dark-yellow absolute top-2.5 right-2.5 grid size-7 cursor-pointer place-items-center rounded-sm border-none bg-transparent"
        aria-label="Dismiss validation warning"
        onClick={onDismiss}
      >
        <X className="size-4 stroke-current" aria-hidden="true" />
      </button>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="pr-4">
        Review evaluator variable mapping
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-1">
        <p>{message}</p>
        <Link
          href={reviewHref}
          className="font-bold underline underline-offset-2"
          onClick={onReview}
        >
          Review how the evaluator maps data to variables
        </Link>
      </AlertDescription>
    </Alert>
  );
}
