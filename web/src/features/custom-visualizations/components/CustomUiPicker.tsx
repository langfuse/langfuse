import { Layers3 } from "lucide-react";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";

export type CustomUiPickerItem = {
  versionId: string;
  title: string;
  version: number;
};

export function CustomUiPicker({
  items,
  selectedVersionId,
  onSelectedVersionChange,
}: {
  items: CustomUiPickerItem[];
  selectedVersionId: string | null;
  onSelectedVersionChange: (versionId: string | null) => void;
}) {
  const standardViewValue = "__standard_view";
  const options = [
    { value: standardViewValue, label: "Standard view" },
    ...items.map((item) => ({
      value: item.versionId,
      label: item.title,
      badges: [{ text: `v${item.version}`, color: "filled" as const }],
    })),
  ];

  return (
    <SelectDropdown
      value={selectedVersionId ?? standardViewValue}
      options={options}
      onValueChange={(value) =>
        onSelectedVersionChange(value === standardViewValue ? null : value)
      }
      aria-label="Choose view"
    >
      {({ getTriggerProps, selectedLabel }) => (
        <button
          {...getTriggerProps()}
          type="button"
          className="text-foreground hover:bg-muted focus-visible:ring-ring inline-flex min-w-52 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <Layers3 className="icon-base shrink-0" />
          <span
            className="max-w-52 flex-1 truncate text-left"
            title={selectedLabel}
          >
            {selectedLabel}
          </span>
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
