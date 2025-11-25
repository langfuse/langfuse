import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { RESOURCE_METRICS } from "@/src/features/dashboard/lib/score-analytics-utils";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";

export function DatasetAnalytics(props: {
  projectId: string;
  scoreOptions: { key: string; value: string }[];
  selectedMetrics: string[];
  setSelectedMetrics: (metrics: string[]) => void;
}) {
  const capture = usePostHogClientCapture();
  return (
    <MultiSelectKeyValues
      className="max-w-fit focus:!ring-0 focus:!ring-offset-0"
      placeholder="Search..."
      title="Charts"
      variant="outline"
      hideClearButton
      showSelectedValueStrings={false}
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
      controlButtons={
        <DropdownMenuItem
          onSelect={() => {
            props.setSelectedMetrics([]);
          }}
        >
          Hide all charts
        </DropdownMenuItem>
      }
    />
  );
}
