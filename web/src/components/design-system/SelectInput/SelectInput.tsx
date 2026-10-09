"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { SelectDropdown } from "../SelectDropdown/SelectDropdown";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Badge } from "../Badge/Badge";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { InputControl } from "../internal/InputControl/InputControl";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";

type SelectInputNode<V extends string> = React.ComponentProps<
  typeof SelectDropdown<V>
>["options"][number];

type SelectInputProps<V extends string> = Pick<
  React.ComponentProps<typeof SelectDropdown<V>>,
  | "value"
  | "options"
  | "onValueChange"
  | "emptyMessage"
  | "id"
  | "aria-describedby"
  | "aria-invalid"
  | "aria-label"
  | "disabled"
> & {
  placeholder: string;
  search?: {
    placeholder: string;
    value?: string;
    onValueChange?: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
  };
  optionIndicator?: "radio" | "checkmark";
  error?: boolean;
};

function isSelectGroup<V extends string>(
  node: SelectInputNode<V>,
): node is Extract<SelectInputNode<V>, { type: "group" }> {
  return "type" in node && node.type === "group";
}

function SelectInputInner<V extends string>(
  {
    value,
    options,
    onValueChange,
    placeholder,
    emptyMessage = "No options available.",
    search,
    optionIndicator = "radio",
    error,
    ...triggerProps
  }: SelectInputProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const selectedOption = options
    .flatMap((node) => (isSelectGroup(node) ? node.options : [node]))
    .find((option) => option.value === value);
  const listId = React.useId();
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    search?.onOpenChange?.(nextOpen);
  };

  if (search) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <InputControl
          contentLayout="spread"
          error={error}
          disabled={triggerProps.disabled}
        >
          <PopoverPrimitive.Trigger
            ref={ref}
            type="button"
            role="combobox"
            aria-controls={listId}
            aria-expanded={open}
            title={selectedOption?.label}
            {...triggerProps}
          >
            <span
              className="min-w-0 flex-1 truncate text-left"
              title={selectedOption?.label}
            >
              {selectedOption?.label ?? placeholder}
            </span>
            <DropdownIndicator />
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
                      placeholder={search.placeholder}
                      value={search.value}
                      onValueChange={search.onValueChange}
                    />
                  </InputDropdown.Search>
                  <InputDropdown.Empty>
                    <CommandPrimitive.Empty>
                      {emptyMessage}
                    </CommandPrimitive.Empty>
                  </InputDropdown.Empty>
                  <InputDropdown.List>
                    <CommandPrimitive.List id={listId}>
                      {options.map((node) => {
                        const group = isSelectGroup(node);
                        const items = group ? node.options : [node];
                        const content = items.map((option) => (
                          <InputDropdown.Option
                            key={option.value}
                            highlight="aria-selected"
                            checked={value === option.value}
                          >
                            <CommandPrimitive.Item
                              value={option.value}
                              keywords={[option.label]}
                              disabled={option.disabled}
                              onSelect={() => {
                                onValueChange(option.value);
                                handleOpenChange(false);
                              }}
                            >
                              <InputDropdown.OptionContent
                                type={optionIndicator}
                                checked={value === option.value}
                                label={option.label}
                                title={
                                  option.disabled
                                    ? option.disabledReason
                                    : option.label
                                }
                                badges={option.badges?.map((badge, index) => (
                                  <Badge key={index} {...badge} />
                                ))}
                              />
                            </CommandPrimitive.Item>
                          </InputDropdown.Option>
                        ));

                        if (!group) {
                          return (
                            <React.Fragment key={node.value}>
                              {content}
                            </React.Fragment>
                          );
                        }
                        return (
                          <CommandPrimitive.Group
                            key={node.id}
                            heading={node.label}
                          >
                            {content}
                          </CommandPrimitive.Group>
                        );
                      })}
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
  return (
    <SelectDropdown
      value={value}
      options={options}
      onValueChange={onValueChange}
      emptyMessage={emptyMessage}
      ref={ref}
      {...triggerProps}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <InputControl contentLayout="spread" error={error}>
          <button {...getTriggerProps()}>
            <span
              className="min-w-0 flex-1 truncate text-left"
              title={selectedLabel}
            >
              {selectedLabel ?? placeholder}
            </span>
            <DropdownIndicator />
          </button>
        </InputControl>
      )}
    </SelectDropdown>
  );
}

type SelectInputComponent = {
  <V extends string>(
    props: SelectInputProps<V> & React.RefAttributes<HTMLButtonElement>,
  ): React.ReactElement | null;

  displayName?: string;
};

export const SelectInput = React.forwardRef(
  SelectInputInner,
) as SelectInputComponent;

SelectInput.displayName = "SelectInput";
