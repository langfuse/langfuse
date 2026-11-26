import { useId } from "react";
import { Check, Globe } from "@langfuse/icons";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { PopoverController } from "@/src/components/ui/popover";
import type { RegionGroup } from "@/src/features/ai-gateway/types/regionGroup";
import { cn } from "@/src/utils/tailwind";

export type RegionSelectProps = {
  id: string;
  groups: RegionGroup[];
  value: string;
  onChange: (region: string) => void;
  onBlur?: () => void;
  error?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/** Searchable grouped cloud-region combobox shared across AI Gateway forms. */
export function RegionSelect({
  id,
  groups,
  value,
  onChange,
  onBlur,
  error,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: RegionSelectProps) {
  const listId = useId();
  const selectedRegion = groups
    .flatMap((group) => group.regions)
    .find((region) => region.value === value);
  const displayLabel = selectedRegion?.label ?? (value || "Select a region");

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onBlur?.();
  };

  return (
    <PopoverController
      align="start"
      contentClassName="w-(--radix-popover-trigger-width) min-w-72 p-0"
      disabled={false}
      modal={false}
      onOpenChange={handleOpenChange}
      renderContent={({ closePopover }) => (
        <RegionOptionsList
          listId={listId}
          groups={groups}
          value={value}
          onSelect={(region) => {
            onChange(region);
            closePopover();
          }}
        />
      )}
    >
      {({ isOpen, Trigger }) => (
        <Trigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            className={cn(
              "border-input bg-background focus-visible:ring-ring flex h-8 w-full items-center gap-2 rounded-md border px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
              error &&
                "border-destructive focus-visible:ring-destructive/40 focus-visible:ring-offset-0",
            )}
          >
            <Globe aria-hidden size="base" />
            <span
              title={selectedRegion?.label ?? (value || undefined)}
              className={cn(
                "min-w-0 flex-1 truncate",
                !selectedRegion && !value && "text-muted-foreground",
              )}
            >
              {displayLabel}
            </span>
            {selectedRegion ? (
              <Badge text={selectedRegion.value} color="filled" />
            ) : null}
            <DropdownIndicator color="tertiary" />
          </button>
        </Trigger>
      )}
    </PopoverController>
  );
}

type RegionOptionsListProps = {
  listId: string;
  groups: RegionGroup[];
  value: string;
  onSelect: (region: string) => void;
};

function RegionOptionsList({
  listId,
  groups,
  value,
  onSelect,
}: RegionOptionsListProps) {
  return (
    <Command>
      <CommandInput placeholder="Search regions" />
      <CommandList id={listId}>
        <CommandEmpty>No matching region</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup
            key={group.label}
            heading={group.label}
            className="**:[[cmdk-group-heading]]:tracking-wide **:[[cmdk-group-heading]]:uppercase"
          >
            {group.regions.map((region) => (
              <CommandItem
                key={region.value}
                value={region.value}
                keywords={[region.label]}
                onSelect={onSelect}
              >
                <span title={region.label} className="min-w-0 flex-1 truncate">
                  {region.label}
                </span>
                <span className="text-muted-foreground text-xs">
                  {region.value}
                </span>
                <Check
                  aria-hidden
                  size="base"
                  __rawClassName={cn(
                    region.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
