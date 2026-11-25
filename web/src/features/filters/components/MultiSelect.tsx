/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger, array-callback-return */
import * as React from "react";
import { Check, Loader2 } from "@langfuse/icons";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";

import { cn } from "@/src/utils/tailwind";
import { Tag } from "@/src/components/design-system/Tag/Tag";
import { Button } from "@/src/components/ui/button";
import {
  InputCommand,
  InputCommandEmpty,
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
import { Input } from "@/src/components/ui/input";
import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { PropertyHoverCard } from "@/src/features/widgets/components/WidgetPropertySelectItem";

/** Rows span the menu edge to edge, so their hover meets the separators. */
const groupClassName = "p-0";
const itemClassName = "rounded-none px-3";

/** compactSelectAllLimit is the most options a compact select shows Select All for. */
const compactSelectAllLimit = 100;

const getFreeTextInput = (
  isCustomSelectEnabled: boolean,
  values: string[],
  optionValues: Set<string>,
): string | undefined =>
  isCustomSelectEnabled
    ? values.find((value) => value.length > 0 && !optionValues.has(value))
    : undefined;

const getCustomOptionValue = (
  isCustomSelectEnabled: boolean,
  freeTextInput: string | undefined,
  freeText: string,
  optionValues: Set<string>,
) => {
  if (!isCustomSelectEnabled) return undefined;
  if (freeTextInput) return freeTextInput;
  if (freeText.length > 0 && !optionValues.has(freeText)) return freeText;
  return undefined;
};

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
  isCustomSelectEnabled?: boolean;
  labelTruncateCutOff?: number;
  /** chipsOnly hides the placeholder/separator once values are selected, showing just the chips and chevron. */
  chipsOnly?: boolean;
  onOpenChange?: (open: boolean) => void;
  isLoading?: boolean;
}) {
  const selectedValues = useMemo(() => new Set(values), [values]);
  const optionValues = useMemo(
    () => new Set(options.map((option) => option.value)),
    [options],
  );
  const freeTextInput = getFreeTextInput(
    isCustomSelectEnabled,
    values,
    optionValues,
  );
  // Scope local edits to the custom value they started from so loading options
  // or external value updates clear stale input text without an effect.
  const [freeTextDraft, setFreeTextDraft] = useState<{
    forValue: string | undefined;
    text: string;
    committed?: boolean;
  } | null>(null);
  const hasActiveDraft =
    freeTextDraft !== null &&
    freeTextDraft.forValue === freeTextInput &&
    !(freeTextDraft.committed && optionValues.has(freeTextDraft.text));
  const freeText = hasActiveDraft ? freeTextDraft.text : (freeTextInput ?? "");

  // Merge options with selected values that might not be in options.
  // Exclude the custom value represented by the custom input row so it is not listed twice.
  const mergedOptions = useMemo(() => {
    const missingSelectedOptions: FilterOption[] = Array.from(selectedValues)
      .filter(
        (v) => !optionValues.has(v) && v.length > 0 && v !== freeTextInput,
      )
      .map((v) => ({ value: v }));
    return [...options, ...missingSelectedOptions];
  }, [options, optionValues, selectedValues, freeTextInput]);

  const customOptionValue = getCustomOptionValue(
    isCustomSelectEnabled,
    freeTextInput,
    freeText,
    optionValues,
  );

  const selectableOptions = useMemo(() => {
    const baseOptions = mergedOptions.filter(
      (option) => option.value.length > 0,
    );
    if (
      customOptionValue &&
      !baseOptions.some((option) => option.value === customOptionValue)
    ) {
      return [...baseOptions, { value: customOptionValue }];
    }
    return baseOptions;
  }, [mergedOptions, customOptionValue]);

  const showSelectAll =
    selectableOptions.length > 0 &&
    !(chipsOnly && selectableOptions.length > compactSelectAllLimit);

  const allSelectedState = useMemo(() => {
    if (selectableOptions.length === 0) return false;
    return selectableOptions.every((option) =>
      selectedValues.has(option.value),
    );
  }, [selectableOptions, selectedValues]);

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const pendingFreeTextRef = useRef<{
    forValue: string;
    value: string;
  } | null>(null);
  const latestCommitContextRef = useRef({
    selectedValues,
    freeTextInput,
    optionValues,
    onValueChange,
  });
  useEffect(() => {
    latestCommitContextRef.current = {
      selectedValues,
      freeTextInput,
      optionValues,
      onValueChange,
    };
  }, [selectedValues, freeTextInput, optionValues, onValueChange]);

  const clearDebounce = useCallback(() => {
    pendingFreeTextRef.current = null;
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
      debounceTimeout.current = null;
    }
  }, []);

  const commitDebouncedValue = useCallback(
    (pending: { forValue: string; value: string }, updateDraft: boolean) => {
      const {
        selectedValues: latestSelectedValues,
        freeTextInput: latestFreeTextInput,
        optionValues: latestOptionValues,
        onValueChange: latestOnValueChange,
      } = latestCommitContextRef.current;
      if (!latestFreeTextInput || latestFreeTextInput !== pending.forValue) {
        return;
      }

      const nextSelectedValues = new Set(latestSelectedValues);
      nextSelectedValues.delete(latestFreeTextInput);
      if (pending.value.length > 0) {
        nextSelectedValues.add(pending.value);
      }
      if (updateDraft) {
        if (
          pending.value.length === 0 ||
          latestOptionValues.has(pending.value)
        ) {
          setFreeTextDraft(null);
        } else {
          setFreeTextDraft({
            forValue: latestFreeTextInput,
            text: pending.value,
            committed: true,
          });
        }
      }
      const filterValues = Array.from(nextSelectedValues);
      latestOnValueChange(filterValues.length > 0 ? filterValues : []);
    },
    [],
  );

  // Flush any pending debounced custom edit if the component unmounts before
  // the timer fires (e.g. closing an outer filter popover).
  useEffect(
    () => () => {
      const pending = pendingFreeTextRef.current;
      clearDebounce();
      if (pending !== null) {
        commitDebouncedValue(pending, false);
      }
    },
    [clearDebounce, commitDebouncedValue],
  );

  const handleSelectAll = useCallback(() => {
    clearDebounce();
    const newSelectedValues = new Set(selectedValues);
    if (allSelectedState) {
      // Deselect all selectable options
      selectableOptions.forEach((option) =>
        newSelectedValues.delete(option.value),
      );
      if (
        isCustomSelectEnabled &&
        freeText.length > 0 &&
        !optionValues.has(freeText)
      ) {
        setFreeTextDraft({ forValue: undefined, text: freeText });
      }
    } else {
      // Select all selectable options
      selectableOptions.forEach((option) =>
        newSelectedValues.add(option.value),
      );
      if (freeTextInput && freeText !== freeTextInput) {
        newSelectedValues.delete(freeTextInput);
        if (freeText.length > 0) {
          newSelectedValues.add(freeText);
        }
      }
      if (
        isCustomSelectEnabled &&
        freeText.length > 0 &&
        !optionValues.has(freeText)
      ) {
        setFreeTextDraft({
          forValue: freeTextInput,
          text: freeText,
          committed: true,
        });
      } else {
        setFreeTextDraft(null);
      }
    }
    const filterValues = Array.from(newSelectedValues);
    onValueChange(filterValues.length > 0 ? filterValues : []);
  }, [
    allSelectedState,
    clearDebounce,
    freeText,
    freeTextInput,
    isCustomSelectEnabled,
    onValueChange,
    optionValues,
    selectableOptions,
    selectedValues,
  ]);

  const handleToggleCustomValue = useCallback(() => {
    clearDebounce();
    const nextSelectedValues = new Set(selectedValues);

    if (freeTextInput) {
      nextSelectedValues.delete(freeTextInput);
      if (freeText.length > 0 && !optionValues.has(freeText)) {
        setFreeTextDraft({ forValue: undefined, text: freeText });
      } else {
        setFreeTextDraft(null);
      }
    } else {
      if (freeText.length === 0) return;
      nextSelectedValues.add(freeText);
      if (optionValues.has(freeText)) {
        setFreeTextDraft(null);
      } else {
        setFreeTextDraft({
          forValue: freeTextInput,
          text: freeText,
          committed: true,
        });
      }
    }

    nextSelectedValues.delete("");
    const filterValues = Array.from(nextSelectedValues);
    onValueChange(filterValues.length > 0 ? filterValues : []);
  }, [
    clearDebounce,
    freeText,
    freeTextInput,
    onValueChange,
    optionValues,
    selectedValues,
  ]);

  const handleFreeTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setFreeTextDraft({
      forValue: freeTextInput,
      text: nextValue,
    });
    clearDebounce();
    if (!freeTextInput) return;

    const pending = { forValue: freeTextInput, value: nextValue };
    pendingFreeTextRef.current = pending;
    debounceTimeout.current = setTimeout(() => {
      pendingFreeTextRef.current = null;
      debounceTimeout.current = null;
      commitDebouncedValue(pending, true);
    }, 500);
  };

  const handleClearFilters = useCallback(() => {
    clearDebounce();
    setFreeTextDraft(null);
    onValueChange([]);
  }, [clearDebounce, onValueChange]);

  function getSelectedOptions() {
    const selectedOptions = mergedOptions.filter(
      ({ value }) =>
        selectedValues.has(value) &&
        (!freeTextInput || value !== freeTextInput),
    );
    const liveCustomOption: FilterOption[] =
      freeTextInput && freeText ? [{ value: freeText }] : [];

    return [...selectedOptions, ...liveCustomOption];
  }

  const selectedBadges =
    selectedValues.size > labelTruncateCutOff ? (
      <Tag text={`${selectedValues.size} selected`} />
    ) : (
      getSelectedOptions().map((option) => {
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
    <Popover onOpenChange={onOpenChange}>
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
        <InputCommand>
          <InputCommandInput
            placeholder={title}
            variant="bottom"
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
            {/* if isCustomSelectEnabled we always show custom select hence never empty */}
            {!isCustomSelectEnabled && !isLoading && (
              <InputCommandEmpty>No results found.</InputCommandEmpty>
            )}
            <InputCommandGroup className={groupClassName}>
              {showSelectAll && (
                <>
                  <InputCommandItem
                    key="select-all"
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
              {mergedOptions.map((option) => {
                if (option.value.length === 0) return;
                const isSelected = selectedValues.has(option.value);
                const displayValue =
                  option.displayValue ??
                  (option.value === "" ? "(empty)" : option.value);
                const displayTitle =
                  option.displayValue ??
                  (option.value === "" ? "(empty)" : option.value);

                const commandItem = (
                  <InputCommandItem
                    key={option.value}
                    className={itemClassName}
                    disabled={isLoading}
                    onSelect={() => {
                      clearDebounce();
                      const nextSelectedValues = new Set(selectedValues);
                      if (freeTextInput && freeText !== freeTextInput) {
                        nextSelectedValues.delete(freeTextInput);
                        if (freeText.length > 0) {
                          nextSelectedValues.add(freeText);
                        }
                        if (
                          freeText.length === 0 ||
                          optionValues.has(freeText)
                        ) {
                          setFreeTextDraft(null);
                        } else {
                          setFreeTextDraft({
                            forValue: freeTextInput,
                            text: freeText,
                            committed: true,
                          });
                        }
                      }
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
                      className={cn(
                        "overflow-x-hidden text-ellipsis whitespace-nowrap",
                        option.value === "" && "text-muted-foreground italic",
                      )}
                      title={displayTitle}
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
            {isCustomSelectEnabled && (
              <InputCommandGroup forceMount={true} className={groupClassName}>
                <InputCommandSeparator className="mx-0" />
                <InputCommandItem
                  key="freeTextField"
                  className={itemClassName}
                  disabled={isLoading}
                  onSelect={handleToggleCustomValue}
                >
                  <div
                    className={cn(
                      "border-control-border mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                      Boolean(freeTextInput)
                        ? "bg-control-fill border-control-fill text-primary-foreground"
                        : "opacity-50 [&_svg]:invisible",
                    )}
                  >
                    <Check size="base" />
                  </div>
                  <Input
                    type="text"
                    disabled={isLoading}
                    value={freeText}
                    onChange={handleFreeTextChange}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    placeholder="Enter custom value"
                    className="h-5 w-full rounded-none border-t-0 border-r-0 border-b-2 border-l-0 border-dotted p-0 text-sm"
                  />
                </InputCommandItem>
              </InputCommandGroup>
            )}
            {selectedValues.size > 0 && (
              <>
                <InputCommandSeparator className="mx-0" />
                <InputCommandGroup className={groupClassName}>
                  <InputCommandItem
                    disabled={isLoading}
                    onSelect={handleClearFilters}
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
