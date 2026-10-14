import { DropdownMenuItem } from "@/src/app/design-system/legacy-primitives/dropdown-menu";
import { RESOURCE_METRICS } from "@/src/analytics/dashboards";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { MultiSelectKeyValues } from "@/src/scores";

export function DatasetAnalytics(props: {
  scoreOptions: { key: string; value: string }[];
  selectedMetrics: string[];
  setSelectedMetrics: (metrics: string[]) => void;
}) {
  const capture = usePostHogClientCapture();
  return (
    <MultiSelectKeyValues
      className="max-w-fit focus:ring-0! focus:ring-offset-0!"
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
