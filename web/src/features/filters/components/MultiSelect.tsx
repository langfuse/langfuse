/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger */
import * as React from "react";
import { Check, Loader2, Plus } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";

import { cn } from "@/src/utils/tailwind";
import { Tag } from "@/src/components/design-system/Tag/Tag";
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
import { Separator } from "@/src/components/ui/separator";
import { type FilterOption } from "@langfuse/shared";
import { useState, useMemo, useCallback } from "react";
import { PropertyHoverCard } from "@/src/features/widgets/components/WidgetPropertySelectItem";

/** Rows span the menu edge to edge, so their hover meets the separators. */
const groupClassName = "p-0";
const itemClassName = "rounded-none px-3";

/** compactSelectAllLimit is the most options a compact select shows Select All for. */
const compactSelectAllLimit = 100;

export function MultiSelect({
  title,
  label,
  values,
  onValueChange,
  options,
  className,
  disabled,
  isCustomSelectEnabled = false,
  labelTruncateCutOff = 2,
  chipsOnly = false,
  onOpenChange,
  isLoading = false,
}: {
  title?: string;
  label?: string;
  values: string[];
  onValueChange: (values: string[]) => void;
  options: FilterOption[] | readonly FilterOption[];
  className?: string;
  disabled?: boolean;
  /** isCustomSelectEnabled offers the typed search text as a custom value. */
  isCustomSelectEnabled?: boolean;
  labelTruncateCutOff?: number;
  /** chipsOnly hides the placeholder/separator once values are selected, showing just the chips and chevron. */
  chipsOnly?: boolean;
  onOpenChange?: (open: boolean) => void;
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");
  const selectedValues = useMemo(() => new Set(values), [values]);

  // Merge options with selected values that might not be in options
  // This ensures selected values are always visible and removable
  const mergedOptions = useMemo(() => {
    const optionSet = new Set(options.map((o) => o.value));
    const missingSelectedOptions: FilterOption[] = Array.from(selectedValues)
      .filter((v) => !optionSet.has(v) && v.length > 0)
      .map((v) => ({ value: v }));
    return [...options, ...missingSelectedOptions];
  }, [options, selectedValues]);

  const selectableOptions = useMemo(
    () => mergedOptions.filter((option) => option.value.length > 0),
    [mergedOptions],
  );

  const trimmedSearch = search.trim();
  const query = trimmedSearch.toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!query) return selectableOptions;
    return selectableOptions.filter(
      (option) =>
        option.value.toLowerCase().includes(query) ||
        (option.displayValue ?? "").toLowerCase().includes(query),
    );
  }, [selectableOptions, query]);

  // Offer the typed text as a custom value unless it matches an option value
  // (case-sensitively) or an existing display label.
  const showCustomValue =
    isCustomSelectEnabled &&
    !isLoading &&
    trimmedSearch.length > 0 &&
    !selectableOptions.some(
      (option) =>
        option.value === trimmedSearch ||
        (option.displayValue !== undefined &&
          option.displayValue.toLowerCase() === query),
    );

  const showSelectAll =
    !query &&
    selectableOptions.length > 0 &&
    !(chipsOnly && selectableOptions.length > compactSelectAllLimit);

  const allSelectedState = useMemo(() => {
    if (selectableOptions.length === 0) return false;
    return selectableOptions.every((option) =>
      selectedValues.has(option.value),
    );
  }, [selectableOptions, selectedValues]);

  const handleOpenChange = (open: boolean) => {
    if (!open) setSearch("");
    onOpenChange?.(open);
  };

  const handleSelectAll = useCallback(() => {
    const newSelectedValues = new Set(selectedValues);
    if (allSelectedState) {
      // Deselect all selectable options
      selectableOptions.forEach((option) =>
        newSelectedValues.delete(option.value),
      );
    } else {
      // Select all selectable options
      selectableOptions.forEach((option) =>
        newSelectedValues.add(option.value),
      );
    }
    const filterValues = Array.from(newSelectedValues);
    onValueChange(filterValues.length > 0 ? filterValues : []);
  }, [allSelectedState, selectableOptions, selectedValues, onValueChange]);

  const handleAddCustomValue = useCallback(() => {
    if (trimmedSearch.length === 0) return;
    const nextSelectedValues = new Set(selectedValues);
    nextSelectedValues.add(trimmedSearch);
    onValueChange(Array.from(nextSelectedValues));
    setSearch("");
  }, [trimmedSearch, selectedValues, onValueChange]);

  const selectedBadges =
    selectedValues.size > labelTruncateCutOff ? (
      <Tag text={`${selectedValues.size} selected`} />
    ) : (
      mergedOptions
        .filter(({ value }) => selectedValues.has(value))
        .map((option) => {
          const displayValue =
            option.displayValue ??
            (option.value === "" ? "(empty)" : option.value);
          return (
            <span
              key={option.value}
              className={cn("flex min-w-0", option.value === "" && "italic")}
            >
              <Tag text={displayValue} />
            </span>
          );
        })
    );

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            // min-w-0 + overflow-hidden: the trigger must never grow past its
            // container — wide selected values truncate instead.
            "border-input ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-8 w-full min-w-0 items-center justify-between gap-x-2 overflow-hidden rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          disabled={disabled}
        >
          {chipsOnly && selectedValues.size > 0 ? (
            <>
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {selectedBadges}
              </div>
              <DropdownIndicator />
            </>
          ) : (
            <>
              {label ?? "Select"}
              <DropdownIndicator />
              {selectedValues.size > 0 && (
                <>
                  <Separator orientation="vertical" className="mr-auto h-4" />
                  <span className="flex lg:hidden">
                    <Tag text={String(selectedValues.size)} />
                  </span>
                  <div className="hidden min-w-0 space-x-1 overflow-hidden lg:flex">
                    {selectedBadges}
                  </div>
                </>
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="ph-no-capture w-[200px] p-0" align="center">
        <InputCommand shouldFilter={false}>
          <InputCommandInput
            placeholder={title}
            variant="bottom"
            value={search}
            onValueChange={setSearch}
            disabled={isLoading}
          />
          <InputCommandList>
            {isLoading && (
              <div
                role="status"
                className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm"
              >
                <Loader2
                  size="base"
                  __rawClassName="animate-spin"
                  aria-hidden="true"
                />
                Loading…
              </div>
            )}
            {!isLoading && filteredOptions.length === 0 && !showCustomValue && (
              <div className="text-muted-foreground py-6 text-center text-sm">
                {isCustomSelectEnabled
                  ? "Enter custom value"
                  : "No results found."}
              </div>
            )}
            <InputCommandGroup className={groupClassName}>
              {showSelectAll && (
                <>
                  <InputCommandItem
                    key="select-all"
                    value="__select-all__"
                    className={itemClassName}
                    onSelect={handleSelectAll}
                    disabled={isLoading}
                  >
                    <div
                      className={cn(
                        "border-control-border mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        allSelectedState
                          ? "bg-control-fill border-control-fill text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check size="base" />
                    </div>
                    <div className="font-bold">
                      {allSelectedState ? "Deselect All" : "Select All"}
                    </div>
                  </InputCommandItem>
                  <InputCommandSeparator className="mx-0" />
                </>
              )}
              {filteredOptions.map((option) => {
                const isSelected = selectedValues.has(option.value);
                const displayValue = option.displayValue ?? option.value;

                const commandItem = (
                  <InputCommandItem
                    key={option.value}
                    value={option.value}
                    className={itemClassName}
                    disabled={isLoading}
                    onSelect={() => {
                      const nextSelectedValues = new Set(selectedValues);
                      if (isSelected) {
                        nextSelectedValues.delete(option.value);
                      } else {
                        nextSelectedValues.add(option.value);
                      }
                      const filterValues = Array.from(nextSelectedValues);
                      onValueChange(
                        filterValues.length > 0 ? filterValues : [],
                      );
                    }}
                  >
                    <div
                      className={cn(
                        "border-control-border mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        isSelected
                          ? "bg-control-fill border-control-fill text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Check size="base" />
                    </div>
                    <div
                      className="overflow-x-hidden text-ellipsis whitespace-nowrap"
                      title={displayValue}
                    >
                      {displayValue}
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
              <InputCommandGroup className={groupClassName}>
                {filteredOptions.length > 0 && (
                  <InputCommandSeparator className="mx-0" />
                )}
                <InputCommandItem
                  key="__custom__"
                  value={trimmedSearch}
                  className={itemClassName}
                  disabled={isLoading}
                  onSelect={handleAddCustomValue}
                >
                  <Plus size="base" __rawClassName="mr-2 opacity-50" />
                  <div className="overflow-x-hidden text-ellipsis whitespace-nowrap">
                    Use &ldquo;{trimmedSearch}&rdquo;
                  </div>
                </InputCommandItem>
              </InputCommandGroup>
            )}
            {selectedValues.size > 0 && (
              <>
                <InputCommandSeparator className="mx-0" />
                <InputCommandGroup className={groupClassName}>
                  <InputCommandItem
                    value="__clear__"
                    disabled={isLoading}
                    onSelect={() => onValueChange([])}
                    className={cn(itemClassName, "justify-center text-center")}
                  >
                    Clear filters
                  </InputCommandItem>
                </InputCommandGroup>
              </>
            )}
          </InputCommandList>
        </InputCommand>
      </PopoverContent>
    </Popover>
  );
}
