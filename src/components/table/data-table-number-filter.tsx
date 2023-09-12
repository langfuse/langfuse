import * as React from "react";
import { Check, PlusCircle } from "lucide-react";

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
import { type TableRowOptions } from "@/src/components/table/types";
import { type NumberComparisonFilter } from "@/src/utils/tanstack";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Input } from "@/src/components/ui/input";

interface DataTableNumberFilter {
  title?: string;
  meta: NumberComparisonFilter;
  options: TableRowOptions;
}

export function DataTableNumberFilter({
  title,
  meta,
  options,
}: DataTableNumberFilter) {
  const clearFilter = () => {
    meta.selectedValues = { name: null, operator: null, value: null };
    meta.updateFunction(null);
  };

  const filter = () => {
    if (
      meta.selectedValues?.operator &&
      meta.selectedValues?.value !== null &&
      meta.selectedValues?.name
    ) {
      meta.updateFunction({
        name: meta.selectedValues?.name,
        operator: meta.selectedValues.operator,
        value: meta.selectedValues.value,
      });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {meta.values ? (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                key={meta.values.name}
                className="rounded-sm px-1 font-normal"
              >
                {meta.values.name}-{meta.values.operator}-{meta.values.value}
              </Badge>
            </>
          ) : undefined}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.options.map((option) => {
                const isSelected =
                  meta.selectedValues?.name &&
                  meta.selectedValues?.name === option.label;
                return (
                  <CommandItem
                    key={option.label}
                    onSelect={() => {
                      if (isSelected) {
                        meta.selectedValues.name = null;
                      } else {
                        meta.updateSelectedScores({
                          ...meta.selectedValues,
                          name: option.label,
                        });
                      }
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check className={cn("h-4 w-4")} />
                    </div>
                    {option.icon && (
                      <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{option.label}</span>
                    {option.value && (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                        {option.value}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <Separator />
            <div className="flex flex-row justify-end p-2">
              <Select
                onValueChange={(operator) => {
                  if (
                    operator === "gt" ||
                    operator === "gte" ||
                    operator === "lt" ||
                    operator === "lte" ||
                    operator === "equals"
                  ) {
                    meta.updateSelectedScores({
                      ...meta.selectedValues,
                      operator: operator,
                    });
                  }
                }}
                value={meta.selectedValues.operator ?? undefined}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Operator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="equals">equals</SelectItem>
                    <SelectItem value="gt">gt</SelectItem>
                    <SelectItem value="lt">lt</SelectItem>
                    <SelectItem value="gte">gte</SelectItem>
                    <SelectItem value="lte">lte</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Value"
                value={meta.selectedValues.value ?? undefined}
                onChange={(event) =>
                  meta.updateSelectedScores({
                    ...meta.selectedValues,
                    value: Number(event.currentTarget.value),
                  })
                }
              />
            </div>
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => filter()}
                  className="justify-center text-center"
                >
                  Filter
                </CommandItem>
              </CommandGroup>
            </>
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
