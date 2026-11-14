import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";

/** A select that reads as part of the sentence around it, e.g. "in the last [7 days ▾]". */
export function TopicInlineSelect<V extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  label: string;
}) {
  return (
    <SelectDropdown
      aria-label={label}
      value={value}
      options={options}
      onValueChange={onChange}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <button
          {...getTriggerProps()}
          className="text-foreground hover:bg-accent focus-visible:ring-ring decoration-border inline-flex items-center gap-0.5 rounded px-1 font-bold underline decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:outline-hidden"
        >
          {selectedLabel}
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
