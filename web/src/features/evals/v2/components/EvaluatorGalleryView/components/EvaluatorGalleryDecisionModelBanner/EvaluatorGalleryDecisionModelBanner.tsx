import { Split, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";

export function EvaluatorGalleryDecisionModelBanner({
  onTry,
  onDismiss,
}: {
  onTry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="border-primary-accent/30 bg-primary-accent/5 flex items-center gap-3 rounded-md border py-2 pr-2 pl-4 text-sm">
      <Split
        className="text-primary-accent icon-base shrink-0"
        aria-hidden="true"
      />
      <p
        className="min-w-0 flex-1 @3xl:truncate"
        title="New: decision-model evaluators. Ask Jev or the OpenAI Decisions API typed questions in one call."
      >
        <span className="font-bold">New: decision-model evaluators.</span>{" "}
        <span className="text-muted-foreground">
          Ask Jev or the OpenAI Decisions API typed questions in one call.
        </span>
      </p>
      <button
        type="button"
        className="text-link hover:text-link-hover shrink-0 text-sm whitespace-nowrap"
        onClick={onTry}
      >
        Try a decision model
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X className="icon-sm text-icon-foreground" />
      </Button>
    </div>
  );
}
