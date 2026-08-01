import { Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";

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
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={isPending}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? "Run the evaluator on the selected sample"}
      onClick={onRun}
    >
      <Play className="mr-1.5 h-3.5 w-3.5" />
      Run test on this sample
    </Button>
  );
}
