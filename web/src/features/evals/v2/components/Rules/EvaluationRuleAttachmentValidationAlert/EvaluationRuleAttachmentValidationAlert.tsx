import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert } from "@/src/components/design-system/Alert/Alert";

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
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Alert variant="warning" actionPosition="top-right" icon={AlertTriangle}>
      <button
        type="button"
        className="absolute top-2.5 right-2.5 grid size-7 cursor-pointer place-items-center rounded-sm border-none bg-transparent"
        aria-label={t("rules.mapping.dismissWarning")}
        onClick={onDismiss}
      >
        <X className="size-4 stroke-current" aria-hidden="true" />
      </button>
      <Alert.Title>{t("rules.mapping.reviewTitle")}</Alert.Title>
      <Alert.Description>
        <div className="flex flex-col items-start gap-1">
          <p>{message}</p>
          <Link
            href={reviewHref}
            className="font-bold underline underline-offset-2"
            onClick={onReview}
          >
            {t("rules.mapping.reviewLink")}
          </Link>
        </div>
      </Alert.Description>
    </Alert>
  );
}
