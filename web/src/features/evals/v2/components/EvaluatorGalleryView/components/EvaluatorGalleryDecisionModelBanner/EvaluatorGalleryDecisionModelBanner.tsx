import { Scale, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";

/**
 * Launch callout for decision-model evaluators above the template sections.
 * Dismissible so it stops competing for attention once it has done its job.
 */
export function EvaluatorGalleryDecisionModelBanner({
  onTry,
  onDismiss,
}: {
  onTry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="border-primary-accent/30 bg-primary-accent/5 flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-sm">
      <Scale
        className="text-primary-accent h-4 w-4 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <span className="font-bold">New: decision-model evaluators.</span>{" "}
        <span className="text-muted-foreground">
          Ask TypeSafe Jev typed questions about each observation and get
          calibrated answers in one call, at a fraction of an LLM judge&apos;s
          cost. Experimental.
        </span>
      </div>
      <Button type="button" size="sm" onClick={onTry}>
        Try a decision model
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
