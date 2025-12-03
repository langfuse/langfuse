"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
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

export interface ComboboxOption<
  T extends string | number | boolean | { id: string },
> {
  value: T;
  label?: string;
  disabled?: boolean;
}

export interface ComboboxOptionGroup<
  T extends string | number | boolean | { id: string },
> {
  heading?: string;
  options: ComboboxOption<T>[];
}

export type ComboboxOptionsInput<
  T extends string | number | boolean | { id: string },
> = ComboboxOption<T>[] | ComboboxOptionGroup<T>[];

export interface ComboboxProps<
  T extends string | number | boolean | { id: string },
> {
  options: ComboboxOptionsInput<T>;
  value?: T;
  onValueChange?: (value: T) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
}

function isGroupedOptions<T extends string | number | boolean | { id: string }>(
  options: ComboboxOptionsInput<T>,
): options is ComboboxOptionGroup<T>[] {
  return (
    options.length > 0 &&
    typeof options[0] === "object" &&
    "options" in options[0] &&
    Array.isArray(options[0].options)
  );
}

function isEqual<T extends string | number | boolean | { id: string }>(
  a: T | undefined,
  b: T | undefined,
): boolean {
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    "id" in a &&
    "id" in b
  ) {
    return (a as { id: string }).id === (b as { id: string }).id;
  }
  return a === b;
}

export function Combobox<T extends string | number | boolean | { id: string }>({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  emptyText = "No option found.",
  searchPlaceholder = "Search...",
  disabled = false,
  className,
  name,
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);

  const selectedOption = React.useMemo(() => {
    if (isGroupedOptions(options)) {
      for (const group of options) {
        const found = group.options.find((opt) => isEqual(opt.value, value));
        if (found) return found;
      }
      return undefined;
    }
    return options.find((option) => isEqual(option.value, value));
  }, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-xs font-normal",
            !value && "text-muted-foreground",
            className,
          )}
          disabled={disabled}
          name={name}
        >
          <span className="truncate">
            {selectedOption
              ? (selectedOption.label ?? String(selectedOption.value))
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="text-xs" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {isGroupedOptions(options) ? (
              // Render with groups
              options.map((group, groupIndex) => (
                <CommandGroup key={groupIndex} heading={group.heading}>
                  {group.options.map((option) => (
                    <CommandItem
                      key={
                        typeof option.value === "object"
                          ? (option.value as { id: string }).id
                          : String(option.value)
                      }
                      value={option.label ?? String(option.value)}
                      disabled={option.disabled}
                      onSelect={() => {
                        if (!option.disabled && onValueChange) {
                          onValueChange(option.value as T);
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "text-xs",
                        option.disabled && "text-muted-foreground line-through",
                      )}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isEqual(value as T | undefined, option.value)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {option.label ?? String(option.value)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            ) : (
              // Flat rendering (backward compatible)
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={
                      typeof option.value === "object"
                        ? (option.value as { id: string }).id
                        : String(option.value)
                    }
                    value={option.label ?? String(option.value)}
                    disabled={option.disabled}
                    onSelect={() => {
                      if (!option.disabled && onValueChange) {
                        onValueChange(option.value as T);
                        setOpen(false);
                      }
                    }}
                    className={cn(
                      "text-xs",
                      option.disabled && "text-muted-foreground line-through",
                    )}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isEqual(value as T | undefined, option.value)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {option.label ?? String(option.value)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
