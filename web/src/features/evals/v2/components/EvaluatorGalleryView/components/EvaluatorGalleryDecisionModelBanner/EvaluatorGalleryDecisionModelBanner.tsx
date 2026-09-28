import { Scale, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";

export function EvaluatorGalleryDecisionModelBanner({
  onTry,
  onDismiss,
}: {
  onTry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="border-primary-accent/30 bg-primary-accent/5 relative flex flex-col gap-3 rounded-md border px-4 py-3 pr-10 text-sm @3xl:flex-row @3xl:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <Scale
          className="text-primary-accent mt-0.5 h-4 w-4 shrink-0"
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
      </div>
      <Button
        type="button"
        size="sm"
        className="shrink-0 @sm:self-start @3xl:self-auto"
        onClick={onTry}
      >
        Try a decision model
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
