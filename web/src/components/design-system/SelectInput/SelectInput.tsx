"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "../Badge/Badge";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { InputControl } from "../internal/InputControl/InputControl";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";

type SelectOption<V> =
  | {
      value: V;
      label: string;
      badges?: Array<
        Pick<React.ComponentProps<typeof Badge>, "text" | "color" | "title">
      >;
      disabled?: false;
      disabledReason?: never;
    }
  | {
      value: V;
      label: string;
      badges?: Array<
        Pick<React.ComponentProps<typeof Badge>, "text" | "color" | "title">
      >;
      disabled: true;
      disabledReason: string;
    };

type SelectGroup<V> = {
  type: "group";
  id: string;
  label: string;
  options: SelectOption<V>[];
};

type SelectInputNode<V> = SelectOption<V> | SelectGroup<V>;

type SelectInputProps<V> = {
  value: V;
  options: SelectInputNode<V>[];
  onValueChange: (newValue: V) => void;
  placeholder: string;
  emptyMessage?: string;
  search?: { placeholder: string };
  error?: boolean;
} & Pick<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  "id" | "aria-describedby" | "aria-invalid" | "aria-label" | "disabled"
>;

function isSelectGroup<V>(node: SelectInputNode<V>): node is SelectGroup<V> {
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
  const hasOptions = options.some((node) =>
    isSelectGroup(node) ? node.options.length > 0 : true,
  );
  const listId = React.useId();

  if (search) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
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
                    <CommandPrimitive.Input placeholder={search.placeholder} />
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
                                setOpen(false);
                              }}
                            >
                              <InputDropdown.OptionContent
                                type="radio"
                                checked={value === option.value}
                                label={option.label}
                                title={
                                  option.disabled
                                    ? option.disabledReason
                                    : option.label
                                }
                              />
                              {option.badges?.map((badge, index) => (
                                <Badge key={index} {...badge} />
                              ))}
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
  const renderNode = (
    node: SelectInputNode<V>,
    hasPreviousGroup: boolean,
  ): React.ReactElement => {
    if (isSelectGroup(node)) {
      return (
        <React.Fragment key={node.id}>
          {hasPreviousGroup && (
            <SelectPrimitive.Separator className="bg-border my-2 h-px" />
          )}
          <SelectPrimitive.Group>
            <SelectPrimitive.Label className="text-muted-foreground px-1 py-1.5 text-xs font-bold">
              {node.label}
            </SelectPrimitive.Label>
            {node.options.map((option) => renderNode(option, false))}
          </SelectPrimitive.Group>
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={node.value}>
        {hasPreviousGroup && <div aria-hidden="true" className="h-4" />}
        <InputDropdown.Option highlight="focus">
          <SelectPrimitive.SelectItem
            value={node.value}
            disabled={node.disabled}
          >
            <InputDropdown.OptionContent
              type="radio"
              checked={value === node.value}
              label={
                <SelectPrimitive.ItemText>
                  {node.label}
                </SelectPrimitive.ItemText>
              }
              title={node.disabled ? node.disabledReason : node.label}
            />
            {node.badges?.map((badge, index) => (
              <Badge key={index} {...badge} />
            ))}
          </SelectPrimitive.SelectItem>
        </InputDropdown.Option>
      </React.Fragment>
    );
  };

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      open={open}
      onOpenChange={setOpen}
    >
      <InputControl contentLayout="spread" error={error}>
        <SelectPrimitive.Trigger
          ref={ref}
          title={selectedOption?.label}
          {...triggerProps}
        >
          <span
            className="min-w-0 flex-1 truncate text-left"
            title={selectedOption?.label}
          >
            <SelectPrimitive.SelectValue placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="text-foreground-tertiary size-3 shrink-0" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
      </InputControl>
      <SelectPrimitive.Portal container={container}>
        <InputDropdown.Content width="select-trigger">
          <SelectPrimitive.Content position="popper" sideOffset={4}>
            <SelectPrimitive.ScrollUpButton
              aria-label="Scroll up"
              className="animate-in fade-in-0 fill-mode-both absolute inset-x-0 top-0 z-3 flex h-6 cursor-pointer items-center justify-center duration-300 [animation-delay:.5s]"
            >
              <ChevronUp className="size-4" />
            </SelectPrimitive.ScrollUpButton>
            <InputDropdown.List>
              <SelectPrimitive.Viewport>
                {!hasOptions ? (
                  <div className="text-muted-foreground py-6 text-center text-sm">
                    {emptyMessage}
                  </div>
                ) : (
                  options.map((node, index) =>
                    renderNode(
                      node,
                      index > 0 && isSelectGroup(options[index - 1]),
                    ),
                  )
                )}
              </SelectPrimitive.Viewport>
            </InputDropdown.List>
            <SelectPrimitive.ScrollDownButton
              aria-label="Scroll down"
              className="animate-in fade-in-0 fill-mode-both absolute inset-x-0 bottom-0 z-3 flex h-6 cursor-pointer items-center justify-center duration-300 [animation-delay:.5s]"
            >
              <ChevronDown className="size-4" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </InputDropdown.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
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
