import { Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

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
      <Play className="mr-1.5 h-3.5 w-3.5" />
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
