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
  selectedVersionId: string;
  onSelectedVersionChange: (versionId: string) => void;
}) {
  const options = items.map((item) => ({
    value: item.versionId,
    label: item.title,
    badges: [{ text: `v${item.version}`, color: "filled" as const }],
  }));

  if (items.length <= 1) {
    return (
      <span className="text-muted-foreground shrink-0 text-[10px]">
        v{items[0]?.version ?? 1}
      </span>
    );
  }

  return (
    <SelectDropdown
      value={selectedVersionId}
      options={options}
      onValueChange={onSelectedVersionChange}
      aria-label="Choose Custom UI"
    >
      {({ getTriggerProps, selectedLabel }) => (
        <button
          {...getTriggerProps()}
          type="button"
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <Layers3 className="icon-base shrink-0" />
          <span className="max-w-52 truncate" title={selectedLabel}>
            {selectedLabel}
          </span>
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
