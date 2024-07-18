import * as React from "react";
import { Archive, Check, ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Separator } from "@/src/components/ui/separator";

type MultiSelectOptions = {
  value: string;
  key?: string;
  count?: number;
  disabled?: boolean;
  isArchived?: boolean;
};

export function MultiSelectKeyValues<
  T extends { key: string; value: string } | string,
>({
  title,
  values,
  onValueChange,
  options,
  className,
  disabled,
  items = "items",
  align = "center",
  controlButtons,
}: {
  title?: string;
  values: T[];
  onValueChange: (values: T[], changedValue?: string) => void;
  options: MultiSelectOptions[] | readonly MultiSelectOptions[];
  className?: string;
  disabled?: boolean;
  items?: string;
  align?: "center" | "end" | "start";
  controlButtons?: React.ReactNode;
}) {
  const selectedValueKeys = new Set(
    values.map((value) => (typeof value === "string" ? value : value.key)),
  );
  const showClearItems = selectedValueKeys.size > 0;

  function formatFilterValues(): T[] {
    if (values.length > 0 && typeof values[0] === "string") {
      return Array.from(selectedValueKeys) as T[];
    }

    return options
      .filter((option) => !!option.key && selectedValueKeys.has(option.key))
      .map((option) => ({
        key: option.key as string,
        value: option.value,
      })) as T[];
  }

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          disabled={disabled}
        >
          Select
          <ChevronDown className="h-4 w-4 opacity-50" />
          {selectedValueKeys.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValueKeys.size}
              </Badge>
              <div className="hidden space-x-1 overflow-x-auto lg:flex">
                {selectedValueKeys.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValueKeys.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) =>
                      selectedValueKeys.has(option.key ?? option.value),
                    )
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.key}
                        className="rounded-sm px-1 font-normal"
                      >
                        {option.value}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align={align}>
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValueKeys.has(
                  option.key ?? option.value,
                );
                return (
                  <CommandItem
                    key={option.key ?? option.value}
                    value={option.key ?? option.value}
                    keywords={[option.value]}
                    onSelect={(value) => {
                      if (isSelected) {
                        selectedValueKeys.delete(value);
                      } else {
                        selectedValueKeys.add(value);
                      }
                      const filterValues = formatFilterValues();

                      onValueChange(
                        filterValues.length ? filterValues : [],
                        value,
                      );
                    }}
                    disabled={option.disabled}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                        option.disabled ? "opacity-50" : null,
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </div>
                    <span
                      className={cn(
                        "overflow-x-scroll",
                        option.isArchived ? "text-foreground/50" : "",
                      )}
                    >
                      {option.value}
                    </span>
                    {option.isArchived ? (
                      <div className="ml-1 mt-1 flex h-4 w-4">
                        <Archive className="h-4 w-4 text-foreground/50"></Archive>
                      </div>
                    ) : null}
                    {option.count !== undefined ? (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center pl-1 font-mono text-xs">
                        {option.count}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {controlButtons || showClearItems ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Controls">
                  {showClearItems && (
                    <CommandItem onSelect={() => onValueChange([])}>
                      Clear {items}
                    </CommandItem>
                  )}
                  {controlButtons}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
