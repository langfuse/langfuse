/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger */
import * as React from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  InputCommand,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { type FilterOption } from "@langfuse/shared";
import { PropertyHoverCard } from "@/src/features/widgets/components/WidgetPropertySelectItem";

/** SingleSelect picks exactly one option or one custom value from a searchable dropdown. */
export function SingleSelect({
  title,
  value,
  onValueChange,
  options,
  className,
  disabled,
  isCustomSelectEnabled = false,
  showOptionValue = false,
}: {
  /** title labels the search box and stands in as the empty-state placeholder. */
  title?: string;
  value?: string;
  onValueChange: (value: string) => void;
  options: FilterOption[] | readonly FilterOption[];
  className?: string;
  disabled?: boolean;
  /** isCustomSelectEnabled offers the typed search text as a custom value. */
  isCustomSelectEnabled?: boolean;
  /** Shows the stable option value in muted brackets after its display label. */
  showOptionValue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );
  const duplicateDisplayValues = useMemo(() => {
    const counts = new Map<string, number>();
    options.forEach((option) => {
      if (option.displayValue) {
        counts.set(
          option.displayValue,
          (counts.get(option.displayValue) ?? 0) + 1,
        );
      }
    });
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([displayValue]) => displayValue),
    );
  }, [options]);
  const shouldShowOptionValue = (option: FilterOption | undefined) =>
    Boolean(
      showOptionValue &&
      option?.displayValue &&
      duplicateDisplayValues.has(option.displayValue),
    );
  const hasValue = value !== undefined && value !== "";
  const isCustomValue = hasValue && selectedOption === undefined;
  const label = hasValue ? (selectedOption?.displayValue ?? value) : undefined;
  const selectedTitle =
    showOptionValue && selectedOption?.displayValue
      ? `${selectedOption.displayValue} (${selectedOption.value})`
      : (label ?? title);

  // Hoist the selected option to the top so it reads as current.
  const displayOptions = useMemo<FilterOption[]>(() => {
    const base =
      isCustomValue && value ? [{ value }, ...options] : [...options];
    const index = base.findIndex((option) => option.value === value);
    if (index <= 0) return base;
    const [selected] = base.splice(index, 1);
    return [selected, ...base];
  }, [isCustomValue, value, options]);

  const query = search.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      displayOptions.filter((option) => {
        if (option.value.length === 0) return false;
        if (!query) return true;
        return (
          option.value.toLowerCase().includes(query) ||
          (option.displayValue ?? "").toLowerCase().includes(query)
        );
      }),
    [displayOptions, query],
  );

  // Offer the typed text as a custom value unless it already names an option.
  const showCustomValue =
    isCustomSelectEnabled &&
    query.length > 0 &&
    !displayOptions.some(
      (option) =>
        option.value.toLowerCase() === query ||
        (option.displayValue ?? "").toLowerCase() === query,
    );

  const commit = (next: string) => {
    onValueChange(next);
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "border-input ring-offset-background placeholder:text-foreground-tertiary focus:ring-ring flex h-8 w-full items-center justify-between gap-x-2 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span
            className={cn(
              "flex min-w-0 items-center gap-1",
              !hasValue && "text-muted-foreground",
            )}
            title={selectedTitle}
          >
            <span
              className={cn(
                shouldShowOptionValue(selectedOption)
                  ? "max-w-[calc(100%-3rem)] shrink-0 truncate"
                  : "truncate",
              )}
              title={selectedTitle}
            >
              {label ?? title ?? "Select"}
            </span>
            {shouldShowOptionValue(selectedOption) && selectedOption ? (
              <span
                className="text-muted-foreground min-w-0 truncate font-normal"
                title={selectedOption.value}
              >
                ({selectedOption.value})
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "max-w-[calc(100vw-2rem)] p-0",
          showOptionValue ? "w-[400px]" : "w-[200px]",
        )}
        align="start"
      >
        <InputCommand shouldFilter={false}>
          <InputCommandInput
            placeholder={title}
            variant="bottom"
            value={search}
            onValueChange={setSearch}
          />
          <InputCommandList>
            {filteredOptions.length === 0 && !showCustomValue && (
              <div className="text-muted-foreground py-6 text-center text-sm">
                {isCustomSelectEnabled
                  ? "Enter custom value"
                  : "No results found."}
              </div>
            )}
            <InputCommandGroup>
              {filteredOptions.map((option) => {
                const isSelected = option.value === value;
                const displayValue = option.displayValue ?? option.value;
                const showValue = shouldShowOptionValue(option);
                const optionTitle =
                  showOptionValue && option.displayValue
                    ? `${displayValue} (${option.value})`
                    : displayValue;

                const commandItem = (
                  <InputCommandItem
                    key={option.value}
                    value={option.value}
                    // Re-click is inert: an empty key or value is schema-valid,
                    // so committing "" would apply an unmatchable filter.
                    onSelect={() => {
                      if (isSelected) {
                        setSearch("");
                        setOpen(false);
                        return;
                      }
                      commit(option.value);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected ? "visible" : "invisible",
                      )}
                    />
                    <div
                      className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
                      title={optionTitle}
                    >
                      <span
                        className={cn(
                          showValue
                            ? "max-w-[calc(100%-3rem)] shrink-0 truncate"
                            : "truncate",
                        )}
                        title={optionTitle}
                      >
                        {displayValue}
                      </span>
                      {showValue ? (
                        <span
                          className="text-muted-foreground min-w-0 truncate font-normal"
                          title={option.value}
                        >
                          ({option.value})
                        </span>
                      ) : null}
                    </div>
                    {option.count !== undefined ? (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center pl-1 font-mono text-xs">
                        {option.count}
                      </span>
                    ) : null}
                  </InputCommandItem>
                );

                return option.description ? (
                  <PropertyHoverCard
                    key={option.value}
                    label={displayValue}
                    description={option.description}
                  >
                    {commandItem}
                  </PropertyHoverCard>
                ) : (
                  commandItem
                );
              })}
            </InputCommandGroup>
            {showCustomValue && (
              <InputCommandGroup>
                <InputCommandSeparator />
                <InputCommandItem
                  key="__custom__"
                  value={search.trim()}
                  onSelect={() => commit(search.trim())}
                >
                  <Plus className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <div className="overflow-x-hidden text-ellipsis whitespace-nowrap">
                    Use &ldquo;{search.trim()}&rdquo;
                  </div>
                </InputCommandItem>
              </InputCommandGroup>
            )}
          </InputCommandList>
        </InputCommand>
      </PopoverContent>
    </Popover>
  );
}
