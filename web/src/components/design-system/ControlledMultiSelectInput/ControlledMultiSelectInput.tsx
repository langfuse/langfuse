"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { SelectControl } from "../internal/SelectControl/SelectControl";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";
import { type SelectDropdown } from "../SelectDropdown/SelectDropdown";

type MultiSelectOption<V> = {
  value: V;
  label: string;
  secondaryLabel?: string;
  disabled?: boolean;
};

export type ControlledMultiSelectInputProps<V> = {
  value: V[];
  options: MultiSelectOption<V>[];
  onValueChange: (newValue: V[]) => void;
  placeholder: string;
  selectedLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  /** Selects or clears exactly these values, preserving selections outside the scope. */
  selectAll?: { label: string; values: readonly V[] };
  additionalOption?: MultiSelectOption<V>;
  error?: boolean;
  disabled?: boolean;
  openState: React.ComponentProps<typeof SelectDropdown>["openState"];
  searchState: { value: string; onValueChange: (value: string) => void };
} & Pick<
  React.ComponentPropsWithoutRef<"button">,
  "id" | "aria-describedby" | "aria-invalid" | "aria-label"
>;

export function ControlledMultiSelectInput<V extends string>({
  value,
  options,
  onValueChange,
  placeholder,
  selectedLabel,
  searchPlaceholder,
  emptyMessage,
  selectAll,
  additionalOption,
  error,
  disabled,
  openState,
  searchState,
  ref,
  ...triggerProps
}: ControlledMultiSelectInputProps<V> & {
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const container = useLayerContainer("popover");
  const { open } = openState;
  const { value: search, onValueChange: setSearch } = searchState;
  const listId = React.useId();
  const allSelected =
    selectAll?.values.every((option) => value.includes(option)) ?? false;

  return (
    <PopoverPrimitive.Root
      open={!disabled && open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setSearch("");
        openState.onOpenChange(nextOpen);
      }}
    >
      <SelectControl error={error} disabled={disabled}>
        <PopoverPrimitive.Trigger
          ref={ref}
          type="button"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
          disabled={disabled}
          {...triggerProps}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              value.length === 0 && "text-muted-foreground",
            )}
            title={value.length > 0 ? selectedLabel : undefined}
          >
            {value.length > 0 ? selectedLabel : placeholder}
          </span>
        </PopoverPrimitive.Trigger>
      </SelectControl>
      <PopoverPrimitive.Portal container={container}>
        <InputDropdown.Content width="popover-trigger">
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            onWheel={stopScrollPropagation()}
            onTouchMove={stopScrollPropagation()}
          >
            <InputDropdown.Root>
              <CommandPrimitive shouldFilter={false}>
                <InputDropdown.Search>
                  <CommandPrimitive.Input
                    placeholder={searchPlaceholder}
                    value={search}
                    onValueChange={setSearch}
                  />
                </InputDropdown.Search>
                {selectAll && selectAll.values.length > 0 && (
                  <InputDropdown.Option highlight="focus" checked={allSelected}>
                    <button
                      type="button"
                      aria-pressed={allSelected}
                      onClick={() =>
                        onValueChange(
                          allSelected
                            ? value.filter(
                                (selected) =>
                                  !selectAll.values.includes(selected),
                              )
                            : [...new Set([...value, ...selectAll.values])],
                        )
                      }
                    >
                      <InputDropdown.MultiSelectOptionContent
                        label={selectAll.label}
                        title={selectAll.label}
                        checked={allSelected}
                      />
                    </button>
                  </InputDropdown.Option>
                )}
                <InputDropdown.Empty>
                  <CommandPrimitive.Empty>
                    {emptyMessage}
                  </CommandPrimitive.Empty>
                </InputDropdown.Empty>
                <InputDropdown.List>
                  <CommandPrimitive.List id={listId}>
                    <CommandPrimitive.Group className="text-foreground overflow-hidden">
                      {additionalOption && (
                        <InputDropdown.Option highlight="aria-selected">
                          <CommandPrimitive.Item
                            value={additionalOption.value}
                            disabled={additionalOption.disabled}
                            onSelect={() => {
                              onValueChange([...value, additionalOption.value]);
                              setSearch("");
                            }}
                          >
                            <InputDropdown.MultiSelectOptionContent
                              label={additionalOption.label}
                              title={additionalOption.label}
                              secondaryLabel={additionalOption.secondaryLabel}
                              checked={false}
                            />
                          </CommandPrimitive.Item>
                        </InputDropdown.Option>
                      )}
                      {options.map((option) => {
                        const isSelected = value.includes(option.value);

                        return (
                          <InputDropdown.Option
                            key={option.value}
                            highlight="aria-selected"
                            checked={isSelected}
                          >
                            <CommandPrimitive.Item
                              value={option.value}
                              disabled={option.disabled}
                              aria-checked={isSelected}
                              onSelect={() => {
                                if (isSelected) {
                                  onValueChange(
                                    value.filter(
                                      (selectedValue) =>
                                        selectedValue !== option.value,
                                    ),
                                  );
                                  return;
                                }

                                onValueChange([...value, option.value]);
                              }}
                            >
                              <InputDropdown.MultiSelectOptionContent
                                label={option.label}
                                title={option.label}
                                secondaryLabel={option.secondaryLabel}
                                checked={isSelected}
                              />
                            </CommandPrimitive.Item>
                          </InputDropdown.Option>
                        );
                      })}
                    </CommandPrimitive.Group>
                  </CommandPrimitive.List>
                </InputDropdown.List>
              </CommandPrimitive>
            </InputDropdown.Root>
          </PopoverPrimitive.Content>
        </InputDropdown.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
