import * as React from "react";
import { Check, PlusCircle } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Separator } from "@/src/components/ui/separator";
import { type KeyValueFilter } from "@/src/utils/tanstack";

import { Input } from "@/src/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";

interface DataTableKeyValueFilter {
  title?: string;
  meta: KeyValueFilter;
}

export function DataTableKeyValueFilter({
  title,
  meta,
}: DataTableKeyValueFilter) {
  const selectedValues = new Set(meta.values);

  const [key, setKey] = React.useState("");
  const [value, setValue] = React.useState("");

  const clearFilter = () => {
    meta.updateFunction(null);
  };

  const filter = () => {
    meta.updateFunction([{ key, value }]);
    setKey("");
    setValue("");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedValues
            ? Array.from(selectedValues.values()).map((value) => (
                <>
                  <Separator orientation="vertical" className="mx-2 h-4" />
                  <Badge
                    variant="secondary"
                    key={`${value.key}-${value.value}`}
                    className="rounded-sm px-1 font-normal"
                  >
                    {value.key}-{value.value}
                  </Badge>
                </>
              ))
            : undefined}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {Array.from(selectedValues.values()).map((selectedValue) => {
                return (
                  <CommandItem
                    key={selectedValue.key}
                    onSelect={() => {
                      meta.removeSelectedValue({
                        key: selectedValue.key,
                        value: selectedValue.value,
                      });
                    }}
                  >
                    <div
                      className={
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground"
                      }
                    >
                      <Check className={cn("h-4 w-4")} />
                    </div>
                    <span>
                      {selectedValue.key} - {selectedValue.value}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 ? <Separator /> : undefined}

            <div className="flex flex-row justify-end p-2">
              <div className="flex flex-col space-y-1.5">
                <Input
                  id="name-key"
                  placeholder="Key"
                  onChange={(e) => setKey(e.target.value)}
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <Input
                  id="name-value"
                  placeholder="Value"
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            </div>

            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => filter()}
                className="justify-center text-center"
              >
                Filter
              </CommandItem>
            </CommandGroup>

            {meta.values && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => clearFilter()}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
