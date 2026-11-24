import { type ComponentProps } from "react";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

export function HomeDashboardSelect({
  options,
  value,
  onValueChange,
  currentDashboardName,
}: Pick<
  ComponentProps<typeof SelectInput<string>>,
  "options" | "value" | "onValueChange"
> & {
  currentDashboardName: string;
}) {
  return (
    <div className="w-auto max-w-60">
      <SelectInput
        options={options}
        value={value}
        onValueChange={(id) => {
          if (id === value) return;
          onValueChange(id);
        }}
        placeholder={currentDashboardName}
        search={{ placeholder: "Search dashboards..." }}
        align="end"
        dropdownWidth="wide"
        emptyMessage="No dashboards found"
        aria-label="Home dashboard"
      />
    </div>
  );
}
