"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { ChevronDown } from "lucide-react";

import { cn } from "@/src/utils/tailwind";
import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { InputControl } from "../internal/InputControl/InputControl";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";

type MultiSelectOption<V> = {
  value: V;
  label: string;
  secondaryLabel?: string;
  disabled?: boolean;
};

type MultiSelectInputProps<V> = {
  value: V[];
  options: MultiSelectOption<V>[];
  onValueChange: (newValue: V[]) => void;
  placeholder: string;
  selectedLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  selectAllLabel?: string;
  error?: boolean;
  disabled?: boolean;
} & Pick<
  React.ComponentPropsWithoutRef<"button">,
  "id" | "aria-describedby" | "aria-invalid" | "aria-label"
>;

function MultiSelectInputInner<V extends string>(
  {
    value,
    options,
    onValueChange,
    placeholder,
    selectedLabel,
    searchPlaceholder,
    emptyMessage,
    selectAllLabel,
    error,
    disabled,
    ...triggerProps
  }: MultiSelectInputProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const listId = React.useId();
  const allSelected =
    options.length > 0 &&
    options.every((option) => option.disabled || value.includes(option.value));

  return (
    <PopoverPrimitive.Root
      open={!disabled && open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <InputControl contentLayout="spread" error={error} disabled={disabled}>
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
          <ChevronDown className="text-foreground-tertiary size-3 shrink-0" />
        </PopoverPrimitive.Trigger>
      </InputControl>
      <PopoverPrimitive.Portal container={container}>
        <InputDropdown.Content width="popover-trigger">
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            onWheel={stopScrollPropagation()}
            onTouchMove={stopScrollPropagation()}
          >
            <InputDropdown.Root>
              <CommandPrimitive>
                <InputDropdown.Search>
                  <CommandPrimitive.Input
                    placeholder={searchPlaceholder}
                    value={search}
                    onValueChange={setSearch}
                  />
                </InputDropdown.Search>
                {selectAllLabel &&
                  !search.trim() &&
                  options.some((option) => !option.disabled) && (
                    <InputDropdown.Option
                      highlight="focus"
                      checked={allSelected}
                    >
                      <button
                        type="button"
                        aria-pressed={allSelected}
                        onClick={() =>
                          onValueChange(
                            allSelected
                              ? value.filter((selectedValue) =>
                                  options.every(
                                    (option) =>
                                      option.value !== selectedValue ||
                                      option.disabled,
                                  ),
                                )
                              : [
                                  ...value,
                                  ...options
                                    .filter(
                                      (option) =>
                                        !option.disabled &&
                                        !value.includes(option.value),
                                    )
                                    .map((option) => option.value),
                                ],
                          )
                        }
                      >
                        <InputDropdown.OptionContent
                          label={selectAllLabel}
                          title={selectAllLabel}
                          type="checkbox"
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
                              keywords={[option.label]}
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
                              <InputDropdown.OptionContent
                                label={option.label}
                                title={option.label}
                                secondaryLabel={option.secondaryLabel}
                                type="checkbox"
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

type MultiSelectInputComponent = {
  <V extends string>(
    props: MultiSelectInputProps<V> & React.RefAttributes<HTMLButtonElement>,
  ): React.ReactElement | null;

  displayName?: string;
};

export const MultiSelectInput = React.forwardRef(
  MultiSelectInputInner,
) as MultiSelectInputComponent;

MultiSelectInput.displayName = "MultiSelectInput";
