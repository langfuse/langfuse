import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { X } from "lucide-react";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { baselineChangedProps } from "@/src/features/experiments/lib/analytics";
import { useTranslations } from "next-intl";

type ExperimentBaselineControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
};

export function ExperimentBaselineControls({
  projectId,
  baselineId,
  baselineName,
  onBaselineChange,
  onBaselineClear,
}: ExperimentBaselineControlsProps) {
  const t = useTranslations("evaluationAnalytics.experiments");
  const capture = usePostHogClientCapture();
  const { experimentNames, isLoading } = useExperimentNames({
    projectId,
  });
  const baselineOptions = experimentNames.map((exp) => ({
    value: exp.experimentId,
    label: exp.experimentName,
  }));

  return (
    <div className="flex min-w-0 items-center">
      <div className="min-w-0 flex-1">
        <Combobox
          options={baselineOptions}
          value={baselineId}
          onValueChange={(id) => {
            if (id === baselineId) return;
            capture(
              "experiment:baseline_changed",
              baselineChangedProps({
                tableName: "experiment-items",
                source: "picker",
              }),
            );
            onBaselineChange(id);
          }}
          placeholder={
            baselineName ?? baselineId ?? t("selection.selectBaseline")
          }
          emptyText={t("selection.noExperimentsFound")}
          searchPlaceholder={t("selection.searchExperiments")}
          disabled={isLoading}
          className={cn(
            "rounded-l-none border-l-0",
            baselineId && "rounded-r-none",
          )}
        />
      </div>

      {baselineId && (
        <Button
          variant="outline"
          size="icon"
          className="-ml-px shrink-0 rounded-l-none"
          onClick={() => {
            capture(
              "experiment:baseline_changed",
              baselineChangedProps({
                tableName: "experiment-items",
                source: "clear",
              }),
            );
            onBaselineClear();
          }}
          disabled={isLoading}
          title={t("selection.clearBaseline")}
          aria-label={t("selection.clearBaseline")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
