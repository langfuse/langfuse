import { Check } from "lucide-react";
import { useId } from "react";

import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { PopoverController } from "@/src/components/ui/popover";

export function RuleEvaluatorSelect({
  value,
  options,
  search,
  onSearchChange,
  onSearchOpenChange,
  onValueChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);
  const listId = useId();

  return (
    <PopoverController
      align="start"
      contentClassName="h-80 w-(--radix-popover-trigger-width) p-0"
      disabled={false}
      modal={false}
      onOpenChange={onSearchOpenChange}
      renderContent={({ closePopover }) => (
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search evaluators..."
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList id={listId} className="min-h-0 flex-1">
            <CommandEmpty>No evaluators found.</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.value}`}
                onSelect={() => {
                  onValueChange(option.value);
                  onSearchOpenChange(false);
                  closePopover();
                }}
              >
                <Check
                  className={
                    option.value === value ? "icon-base" : "icon-base invisible"
                  }
                />
                <span className="truncate" title={option.label}>
                  {option.label}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      )}
    >
      {({ isOpen, Trigger }) => (
        <Trigger asChild>
          <button
            id="trigger-evaluator"
            type="button"
            role="combobox"
            aria-controls={listId}
            aria-expanded={isOpen}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
          >
            <span
              className="truncate"
              title={selectedOption?.label ?? "Select an evaluator"}
            >
              {selectedOption?.label ?? "Select an evaluator"}
            </span>
            <DropdownIndicator />
          </button>
        </Trigger>
      )}
    </PopoverController>
  );
}
