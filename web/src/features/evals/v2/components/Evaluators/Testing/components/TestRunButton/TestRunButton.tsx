import { Play } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.evaluations");
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={isPending}
      disabled={Boolean(disabledReason)}
      title={disabledReason ? undefined : t("test.runSelectedSampleTitle")}
      className={disabledReason ? "pointer-events-none" : undefined}
      onClick={onRun}
    >
      <Play className="mr-1.5 h-3.5 w-3.5" />
      {t("test.runOnSample")}
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
