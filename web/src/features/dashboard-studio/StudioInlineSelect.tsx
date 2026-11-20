import { type ComponentProps } from "react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { SelectDropdown } from "@/src/components/design-system/SelectDropdown/SelectDropdown";

/** Keeps choices in a toolbar or sentence readable as text until opened. */
export function StudioInlineSelect<V extends string>({
  label,
  options,
  value,
  placeholder,
  onValueChange,
}: {
  label: string;
  options: ComponentProps<typeof SelectDropdown<V>>["options"];
  value: V;
  placeholder?: string;
  onValueChange: (value: V) => void;
}) {
  const Icon = options
    .flatMap((option) => (option.type === "group" ? option.options : [option]))
    .find((option) => option.value === value)?.icon;
  return (
    <SelectDropdown
      aria-label={label}
      noCapture
      value={value}
      options={options}
      onValueChange={onValueChange}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <button
          {...getTriggerProps()}
          className="hover:bg-accent text-foreground-secondary hover:text-foreground focus-visible:ring-ring inline-flex min-h-7 max-w-full items-center gap-1.5 rounded px-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-hidden"
        >
          {Icon ? <Icon size="sm" aria-hidden /> : null}
          <span
            title={selectedLabel ?? placeholder}
            className="min-w-0 truncate"
          >
            {selectedLabel ?? placeholder}
          </span>
          <DropdownIndicator />
        </button>
      )}
    </SelectDropdown>
  );
}
