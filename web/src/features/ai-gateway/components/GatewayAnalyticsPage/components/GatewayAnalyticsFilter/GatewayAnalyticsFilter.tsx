import { MultiSelect } from "@/src/features/filters/components/MultiSelect";

type GatewayAnalyticsFilterOption = { value: string; label: string };

/** A multi-select for one analytics filter, styled like the dashboard environment filter. */
export function GatewayAnalyticsFilter({
  label,
  searchPlaceholder,
  emptyMessage,
  values,
  options,
  onValueChange,
}: {
  label: string;
  searchPlaceholder: string;
  emptyMessage: string;
  values: string[];
  options: GatewayAnalyticsFilterOption[];
  onValueChange: (values: string[]) => void;
}) {
  return (
    <MultiSelect
      title={searchPlaceholder}
      label={label}
      values={values}
      onValueChange={onValueChange}
      options={options.map((option) => ({
        value: option.value,
        displayValue: option.label,
      }))}
      emptyMessage={emptyMessage}
      // Deleted keys and former members still have usage but no option, so their raw IDs can be
      // typed in. Without any options the empty message is shown instead.
      isCustomSelectEnabled={options.length > 0}
      className="my-0 w-auto overflow-hidden"
    />
  );
}
