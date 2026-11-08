import { MultiSelect } from "@/src/features/filters/components/MultiSelect";

type GatewayAnalyticsFilterOption = { value: string; label: string };

/** A multi-select for one analytics filter, styled like the dashboard environment filter. */
export function GatewayAnalyticsFilter({
  label,
  searchPlaceholder,
  values,
  options,
  onValueChange,
}: {
  label: string;
  searchPlaceholder: string;
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
      // Deleted keys and former members still have usage but no option, so their raw IDs can be
      // typed in, even once every key is gone.
      isCustomSelectEnabled
      className="my-0 w-auto overflow-hidden"
    />
  );
}
