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
  error?: boolean;
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
    error,
    ...triggerProps
  }: MultiSelectInputProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <InputControl contentLayout="spread" error={error}>
        <PopoverPrimitive.Trigger
          ref={ref}
          type="button"
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
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
          <ChevronDown className="size-4 shrink-0 opacity-50" />
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
                  <CommandPrimitive.Input placeholder={searchPlaceholder} />
                </InputDropdown.Search>
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
                                indicator={
                                  <InputDropdown.CheckIndicator
                                    checked={isSelected}
                                  />
                                }
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
