import { RESOURCE_METRICS } from "@/src/features/dashboard/lib/score-analytics-utils";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { ChartColumnBig } from "lucide-react";

export function DatasetAnalytics(props: {
  projectId: string;
  scoreOptions: { key: string; value: string }[];
  selectedMetrics: string[];
  setSelectedMetrics: (metrics: string[]) => void;
}) {
  const capture = usePostHogClientCapture();
  return (
    <MultiSelectKeyValues
      className="max-w-fit"
      placeholder="Search..."
      title="Charts"
      variant="outline"
      iconLeft={<ChartColumnBig className="mr-1 h-4 w-4" />}
      hideClearButton
      onValueChange={(values, changedValue, selectedKeys) => {
        if (values.length === 0) props.setSelectedMetrics([]);

        if (changedValue) {
          if (selectedKeys?.has(changedValue)) {
            props.setSelectedMetrics([...props.selectedMetrics, changedValue]);
            capture("dataset_run:charts_view_added");
          } else {
            capture("dataset_run:charts_view_removed");
            props.setSelectedMetrics(
              props.selectedMetrics.filter((key) => key !== changedValue),
            );
          }
        }
      }}
      values={props.selectedMetrics}
      options={RESOURCE_METRICS}
      groupedOptions={[{ label: "Scores", options: props.scoreOptions }]}
    />
  );
}
