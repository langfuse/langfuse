import { type ComponentProps } from "react";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

type ExperimentBaselineSelectProps = {
  options: ComponentProps<typeof SelectInput<string>>["options"];
  baselineId?: string;
  baselineName?: string;
  isLoading?: boolean;
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
};

export function ExperimentBaselineSelect({
  options,
  baselineId,
  baselineName,
  isLoading,
  onBaselineChange,
  onBaselineClear,
}: ExperimentBaselineSelectProps) {
  return (
    <SelectInput
      options={options}
      value={baselineId ?? ""}
      onValueChange={onBaselineChange}
      placeholder={baselineName ?? baselineId ?? "Select baseline..."}
      emptyMessage="No experiments found"
      search={{ placeholder: "Search experiments..." }}
      disabled={isLoading}
      prefix={{ label: "Baseline" }}
      clearAction={
        baselineId
          ? { label: "Clear baseline", onClear: onBaselineClear }
          : undefined
      }
    />
  );
}
