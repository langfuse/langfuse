/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { Play } from "@langfuse/icons";

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
  label = "Run test on this sample",
  variant = "outline",
  showIcon = true,
}: {
  isPending: boolean;
  onRun: () => void;
  disabledReason: string | null;
  label?: string;
  variant?: "outline" | "default";
  showIcon?: boolean;
}) {
  const button = (
    <Button
      type="button"
      variant={variant}
      size="sm"
      loading={isPending}
      disabled={Boolean(disabledReason)}
      title={
        disabledReason ? undefined : "Run the evaluator on the selected sample"
      }
      className={disabledReason ? "pointer-events-none" : undefined}
      onClick={onRun}
    >
      {showIcon ? (
        <Play size="base" color="default" __rawClassName="mr-1.5" />
      ) : null}
      {label}
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
