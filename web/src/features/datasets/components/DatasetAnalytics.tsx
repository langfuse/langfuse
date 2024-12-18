import { RESOURCE_METRICS } from "@/src/features/dashboard/lib/score-analytics-utils";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";

export function DatasetAnalytics(props: {
  projectId: string;
  scoreOptions: { key: string; value: string }[];
  selectedMetrics: string[];
  setSelectedMetrics: (metrics: string[]) => void;
}) {
  return (
    <MultiSelectKeyValues
      className="max-w-fit"
      placeholder="Search..."
      title="Metrics"
      hideClearButton
      onValueChange={(values, changedValue, selectedKeys) => {
        if (values.length === 0) props.setSelectedMetrics([]);

        if (changedValue) {
          if (selectedKeys?.has(changedValue)) {
            props.setSelectedMetrics([...props.selectedMetrics, changedValue]);
          } else {
            props.setSelectedMetrics(
              props.selectedMetrics.filter((key) => key !== changedValue),
            );
          }
        }
      }}
      values={props.selectedMetrics}
      options={[...props.scoreOptions, ...RESOURCE_METRICS]}
    />
  );
}
