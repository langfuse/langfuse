import Link from "next/link";

import { Banner } from "@/src/components/design-system/Banner/Banner";

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
    <Banner
      variant="warning"
      title="Review evaluator variable mapping"
      onDismiss={onDismiss}
    >
      <div className="flex flex-col items-start gap-1">
        <p>{message}</p>
        <Link
          href={reviewHref}
          className="font-bold underline underline-offset-2"
          onClick={onReview}
        >
          Review how the evaluator maps data to variables
        </Link>
      </div>
    </Banner>
  );
}
