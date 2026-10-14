import { Play } from "lucide-react";

import { Button } from "@/src/app/design-system/legacy-primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/app/design-system/legacy-primitives/tooltip";

/** Starts a test run for the evaluator's currently selected sample. */
export function TestRunButton({
  isPending,
  onRun,
  disabledReason,
}: {
  isPending: boolean;
  onRun: () => void;
  disabledReason: string | null;
}) {
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={isPending}
      disabled={Boolean(disabledReason)}
      title={
        disabledReason ? undefined : "Run the evaluator on the selected sample"
      }
      className={disabledReason ? "pointer-events-none" : undefined}
      onClick={onRun}
    >
      <Play className="icon-base text-icon-foreground mr-1.5" />
      Run test on this sample
    </Button>
  );

  return disabledReason ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-not-allowed" tabIndex={0}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}
