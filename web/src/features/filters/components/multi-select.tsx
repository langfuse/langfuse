import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";
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
import { useRef, useState } from "react";
import { PropertyHoverCard } from "@/src/features/widgets/components/WidgetPropertySelectItem";

const getFreeTextInput = (
  isCustomSelectEnabled: boolean,
  values: string[],
  optionValues: Set<string>,
): string | undefined =>
  isCustomSelectEnabled
    ? Array.from(values.values()).find((value) => !optionValues.has(value))
    : undefined;

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
}) {
  const selectedValues = new Set(values);
  const optionValues = new Set(options.map((option) => option.value));
  const freeTextInput = getFreeTextInput(
    isCustomSelectEnabled,
    values,
    optionValues,
  );
  const [freeText, setFreeText] = useState(freeTextInput || "");

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const handleDebouncedChange = (value: string) => {
    const freeTextInput = getFreeTextInput(
      isCustomSelectEnabled,
      values,
      optionValues,
    );

    if (!!freeTextInput) {
      selectedValues.delete(freeTextInput);
      selectedValues.add(value);
      selectedValues.delete("");
      const filterValues = Array.from(selectedValues);
      onValueChange(filterValues.length ? filterValues : []);
    }
  };

  function getSelectedOptions() {
    const selectedOptions = options.filter(({ value }) =>
      selectedValues.has(value),
    );

    const hasCustomOption =
      !!freeText &&
      !!getFreeTextInput(isCustomSelectEnabled, values, optionValues);
    const customOption: FilterOption[] = hasCustomOption
      ? [{ value: freeText }]
      : [];

    return [...selectedOptions, ...customOption];
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-x-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          disabled={disabled}
        >
          {label ?? "Select"}
          <ChevronDown className="h-4 w-4 opacity-50" />
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" className="mr-auto h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > labelTruncateCutOff ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  getSelectedOptions().map((option) => (
                    <Badge
                      variant="secondary"
                      key={option.value}
                      className="rounded-sm px-1 font-normal"
                    >
                      {option.displayValue ?? option.value}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="center">
        <InputCommand>
          <InputCommandInput placeholder={title} />
          <InputCommandList>
            {/* if isCustomSelectEnabled we always show custom select hence never empty */}
            {!isCustomSelectEnabled && (
              <InputCommandEmpty>No results found.</InputCommandEmpty>
            )}
            <InputCommandGroup>
              {options.map((option) => {
                if (option.value.length === 0) return;
                const isSelected = selectedValues.has(option.value);
                const commandItem = (
                  <InputCommandItem
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value);
                      } else {
                        selectedValues.add(option.value);
                      }
                      const filterValues = Array.from(selectedValues);
                      onValueChange(filterValues.length ? filterValues : []);
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
                    <div
                      className="overflow-x-hidden text-ellipsis whitespace-nowrap"
                      title={option.displayValue ?? option.value}
                    >
                      {option.displayValue ?? option.value}
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
                    label={option.displayValue ?? option.value}
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
              <InputCommandGroup forceMount={true}>
                <InputCommandSeparator />
                <InputCommandItem
                  key="freeTextField"
                  onSelect={() => {
                    const freeTextInput = getFreeTextInput(
                      isCustomSelectEnabled,
                      values,
                      optionValues,
                    );

                    if (!!freeTextInput) {
                      selectedValues.delete(freeTextInput);
                    } else {
                      selectedValues.add(freeText);
                    }
                    selectedValues.delete("");
                    const filterValues = Array.from(selectedValues);
                    onValueChange(filterValues.length ? filterValues : []);
                  }}
                >
                  <div
                    className={cn(
                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                      getFreeTextInput(
                        isCustomSelectEnabled,
                        values,
                        optionValues,
                      ) ||
                        (optionValues.has(freeText) &&
                          selectedValues.has(freeText))
                        ? "bg-primary text-primary-foreground"
                        : "opacity-50 [&_svg]:invisible",
                    )}
                  >
                    <Check className="h-4 w-4" />
                  </div>
                  <Input
                    type="text"
                    value={freeText}
                    onChange={(e) => {
                      setFreeText(e.target.value);
                      if (debounceTimeout.current) {
                        clearTimeout(debounceTimeout.current);
                      }
                      debounceTimeout.current = setTimeout(() => {
                        handleDebouncedChange(e.target.value);
                      }, 500);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    placeholder="Enter custom value"
                    className="h-6 w-full rounded-none border-b-2 border-l-0 border-r-0 border-t-0 border-dotted p-0 text-sm"
                  />
                </InputCommandItem>
              </InputCommandGroup>
            )}
            {selectedValues.size > 0 && (
              <>
                <InputCommandSeparator />
                <InputCommandGroup>
                  <InputCommandItem
                    onSelect={() => onValueChange([])}
                    className="justify-center text-center"
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
