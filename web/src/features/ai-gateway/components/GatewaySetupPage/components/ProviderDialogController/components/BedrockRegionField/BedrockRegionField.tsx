import { useId, useState } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import { bedrockRegionGroups } from "@/src/features/ai-gateway/constants/bedrockRegions";
import { cn } from "@/src/utils/tailwind";

const regions = bedrockRegionGroups.flatMap((group) => group.regions);

export type BedrockRegionFieldProps = {
  value: string;
  onChange: (region: string) => void;
};

export function BedrockRegionField({
  value,
  onChange,
}: BedrockRegionFieldProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selectedRegion = regions.find((region) => region.value === value);

  const handleSelect = (region: string) => {
    onChange(region);
    setOpen(false);
  };

  return (
    <div>
      <FieldHeader
        htmlFor="gateway-bedrock-region"
        label="AWS region"
        description="Requests go to Bedrock in this region. It can't be changed after saving."
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="gateway-bedrock-region"
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            className="border-input bg-background focus-visible:ring-ring flex h-8 w-full items-center gap-2 rounded-md border px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
          >
            <Globe aria-hidden size="base" />
            <span
              title={selectedRegion?.label}
              className={cn(
                "min-w-0 flex-1 truncate",
                !selectedRegion && "text-muted-foreground",
              )}
            >
              {selectedRegion?.label ?? "Select a region"}
            </span>
            {selectedRegion ? (
              <Badge text={selectedRegion.value} color="filled" />
            ) : null}
            <DropdownIndicator color="tertiary" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput placeholder="Search regions" />
            <CommandList id={listId}>
              <CommandEmpty>No matching region</CommandEmpty>
              {bedrockRegionGroups.map((group) => (
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
                      onSelect={handleSelect}
                    >
                      <span
                        title={region.label}
                        className="min-w-0 flex-1 truncate"
                      >
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
