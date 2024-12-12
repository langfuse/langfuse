"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { type Command as CommandPrimitive } from "cmdk";

import { cn } from "@/src/utils/tailwind";
import { Button } from "./button";
import { Badge } from "./badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { useState } from "react";

export type ComboboxOption = {
  key: string;
  value: string;
  disabled?: boolean;
};

type MultiComboboxProps = {
  values: ComboboxOption[];
  onValueChange: (
    values: ComboboxOption[],
    changedKey?: string,
    selectedKeys?: Set<string>,
  ) => void;
  options: ComboboxOption[];
};

type MultiComboboxPropsOptional = {
  placeholder?: string;
  emptyText?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
};

const MultiCombobox = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  MultiComboboxProps & MultiComboboxPropsOptional
>(
  (
    {
      values,
      onValueChange,
      options,
      placeholder = "Search...",
      emptyText = "No results found.",
      title = "Select items",
      align = "start",
      disabled,
      className,
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const selectedKeys = new Set(values.map((v) => v.key));

    const handleSelect = (optionKey: string) => {
      const newSelectedKeys = new Set(selectedKeys);

      if (selectedKeys.has(optionKey)) {
        newSelectedKeys.delete(optionKey);
      } else {
        newSelectedKeys.add(optionKey);
      }
      // } else {
      //   newSelectedKeys.clear();
      //   newSelectedKeys.add(optionKey);
      //   setOpen(false);
      // }

      const newValues = options.filter((opt) => newSelectedKeys.has(opt.key));
      onValueChange(newValues, optionKey, newSelectedKeys);
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-auto w-full justify-between", className)}
            disabled={disabled}
          >
            {title}
            <div className="flex flex-grow flex-wrap items-center gap-1 overflow-hidden text-sm">
              {selectedKeys.size > 0 &&
                values.map((value) => (
                  <Badge
                    variant="secondary"
                    key={value.key}
                    className="mr-1 rounded-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(value.key);
                    }}
                  >
                    {value.value}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align={align}>
          <Command ref={ref}>
            <CommandInput placeholder={placeholder} />
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedKeys.has(option.key);
                return (
                  <CommandItem
                    key={option.key}
                    onSelect={() => handleSelect(option.key)}
                    disabled={option.disabled}
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
                    <span dangerouslySetInnerHTML={{ __html: option.value }} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);
MultiCombobox.displayName = "MultiCombobox";

export { MultiCombobox };
