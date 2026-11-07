import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";

type GatewayAnalyticsFilterOption = { value: string; label: string };

/** A multi-select for one analytics filter, labelled with its selection. */
export function GatewayAnalyticsFilter({
  label,
  pluralLabel,
  emptyMessage,
  values,
  options,
  onValueChange,
}: {
  label: string;
  /** Lowercase plural used for counts, e.g. "users". */
  pluralLabel: string;
  emptyMessage: string;
  values: string[];
  options: GatewayAnalyticsFilterOption[];
  onValueChange: (values: string[]) => void;
}) {
  return (
    <div className="w-48">
      <MultiSelectInput
        aria-label={label}
        value={values}
        options={options}
        onValueChange={onValueChange}
        placeholder={label}
        selectedLabel={describeSelection(values, options, pluralLabel)}
        searchPlaceholder={`Search ${pluralLabel}`}
        emptyMessage={emptyMessage}
        selectAllLabel="Select all"
      />
    </div>
  );
}

function describeSelection(
  values: string[],
  options: GatewayAnalyticsFilterOption[],
  pluralLabel: string,
) {
  if (values.length !== 1) return `${values.length} ${pluralLabel}`;
  return options.find((option) => option.value === values[0])?.label ?? "1";
}
