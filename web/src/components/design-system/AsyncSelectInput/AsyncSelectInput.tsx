"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { cn } from "@/src/utils/tailwind";
import { assertUnreachable } from "@/src/utils/types";
import { type SelectDropdown } from "../SelectDropdown/SelectDropdown";
import type { InputControl } from "../internal/InputControl/InputControl";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";
import { SelectControl } from "../internal/SelectControl/SelectControl";

type SelectedOption<V extends string> = Pick<
  Extract<
    React.ComponentProps<typeof SelectDropdown<V>>["options"][number],
    { value: V }
  >,
  "value" | "label" | "icon"
>;

/** Search and selection are caller-owned; options are rendered without filtering. */
export function AsyncSelectInput<V extends string>({
  value,
  options,
  onValueChange,
  search,
  placeholder,
  loading,
  callToActionOption,
  virtualized = false,
  align = "start",
  dropdownWidth = "trigger",
  emptyMessage = "No options available.",
  error,
  muted,
  prefix,
  clearAction,
  ref,
  ...triggerProps
}: Pick<
  React.ComponentProps<typeof SelectDropdown<V>>,
  | "options"
  | "emptyMessage"
  | "id"
  | "aria-describedby"
  | "aria-invalid"
  | "aria-label"
  | "disabled"
  | "onBlur"
> & {
  prefix?: React.ComponentProps<typeof InputControl>["prefix"];
  /**
   * Shown in place of the caret. Pass it whenever clearing is allowed,
   * including when the selected id is not in `options` and `value` is null.
   */
  clearAction?: { label: string; onClear: () => void };
  value: SelectedOption<V> | null;
  onValueChange: (option: SelectedOption<V>) => void;
  placeholder: string;
  search: {
    placeholder: string;
    value: string;
    onValueChange: (value: string) => void;
  };
  loading?: { message: string };
  callToActionOption?: {
    label: string;
    position: "first" | "last";
    onSelect: () => void;
  };
  virtualized?: boolean;
  align?: "start" | "center" | "end";
  dropdownWidth?: "trigger" | "wide";
  error?: boolean;
  muted?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) search.onValueChange("");
  };
  const listId = React.useId();
  const actionId = React.useId();
  const [scrollNode, setScrollNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [activeValue, setActiveValue] = React.useState("");
  type Option = Extract<(typeof options)[number], { value: V }>;
  type Row =
    | { type: "heading"; id: string; label: string }
    | { type: "action"; id: string }
    | { type: "option"; option: Option };
  const rows: Row[] = [];
  if (callToActionOption?.position === "first") {
    rows.push({ type: "action", id: actionId });
  }
  for (const node of options) {
    if (node.type === "group") {
      rows.push({ type: "heading", id: node.id, label: node.label });
      rows.push(
        ...node.options.map((option): Row => ({ type: "option", option })),
      );
    } else {
      rows.push({ type: "option", option: node });
    }
  }
  if (callToActionOption?.position === "last") {
    rows.push({ type: "action", id: actionId });
  }
  const activeIndex = rows.findIndex((row) =>
    row.type === "option"
      ? row.option.value === activeValue
      : row.type === "action" && row.id === activeValue,
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollNode,
    estimateSize: () => 32,
    overscan: 20,
    enabled: virtualized && open,
    rangeExtractor: (range) => {
      const indices = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !indices.includes(activeIndex))
        indices.push(activeIndex);
      return indices.sort((a, b) => a - b);
    },
  });
  const renderOption = (option: Option) => {
    const OptionIcon = option.icon;
    return (
      <InputDropdown.Option
        key={option.value}
        highlight="aria-selected"
        checked={value?.value === option.value}
      >
        <Command.Item
          value={option.value}
          disabled={option.disabled}
          onSelect={() => {
            onValueChange(option);
            handleOpenChange(false);
          }}
        >
          {OptionIcon && <OptionIcon size="base" aria-hidden />}
          <InputDropdown.SingleSelectOptionContent
            checked={value?.value === option.value}
            label={option.label}
            secondaryLabel={option.secondaryLabel}
            title={option.disabled ? option.disabledReason : option.label}
            badges={option.badges}
          />
        </Command.Item>
      </InputDropdown.Option>
    );
  };
  const actionContent = callToActionOption && (
    <InputDropdown.Option highlight="aria-selected">
      <Command.Item
        value={actionId}
        onSelect={() => {
          callToActionOption.onSelect();
          handleOpenChange(false);
        }}
      >
        <span className="truncate" title={callToActionOption.label}>
          {callToActionOption.label}
        </span>
      </Command.Item>
    </InputDropdown.Option>
  );
  const Icon = value?.icon;

  return (
    <PopoverPrimitive.Root
      open={open && !triggerProps.disabled}
      onOpenChange={handleOpenChange}
    >
      <PopoverPrimitive.Anchor asChild>
        <SelectControl
          error={error}
          disabled={triggerProps.disabled}
          prefix={prefix}
          clear={
            clearAction
              ? { label: clearAction.label, onClear: clearAction.onClear }
              : undefined
          }
        >
          <PopoverPrimitive.Trigger
            ref={ref}
            type="button"
            role="combobox"
            aria-controls={listId}
            aria-expanded={open && !triggerProps.disabled}
            title={value?.label}
            {...triggerProps}
          >
            {Icon && <Icon size="base" aria-hidden />}
            <span
              title={value?.label}
              className={cn(
                "min-w-0 flex-1 truncate text-left",
                muted && "text-muted-foreground",
              )}
            >
              {value?.label ?? placeholder}
            </span>
          </PopoverPrimitive.Trigger>
        </SelectControl>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal container={container}>
        <InputDropdown.Content
          width={dropdownWidth === "wide" ? "popover-wide" : "popover-trigger"}
        >
          <PopoverPrimitive.Content
            align={align}
            sideOffset={4}
            collisionPadding={dropdownWidth === "wide" ? 8 : undefined}
            onWheel={stopScrollPropagation()}
            onTouchMove={stopScrollPropagation()}
          >
            <InputDropdown.Root>
              <Command
                shouldFilter={false}
                value={activeValue}
                onValueChange={setActiveValue}
                onKeyDown={(event) => {
                  if (
                    !virtualized ||
                    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const selectable = rows.flatMap((row, index) => {
                    if (row.type === "action")
                      return [{ index, value: row.id }];
                    if (row.type === "option" && !row.option.disabled)
                      return [{ index, value: row.option.value }];
                    return [];
                  });
                  const current = selectable.findIndex(
                    (item) => item.value === activeValue,
                  );
                  let next = current;
                  if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = selectable.length - 1;
                  else if (event.key === "ArrowDown")
                    next = Math.min(current + 1, selectable.length - 1);
                  else next = Math.max(current - 1, 0);
                  const item = selectable[next];
                  if (!item) return;
                  setActiveValue(item.value);
                  virtualizer.scrollToIndex(item.index, { align: "auto" });
                }}
              >
                <InputDropdown.Search>
                  <Command.Input
                    placeholder={search.placeholder}
                    value={search.value}
                    onValueChange={(nextValue) => {
                      if (scrollNode) scrollNode.scrollTop = 0;
                      search.onValueChange(nextValue);
                    }}
                  />
                </InputDropdown.Search>
                {!loading && !callToActionOption && (
                  <InputDropdown.Empty>
                    <Command.Empty>{emptyMessage}</Command.Empty>
                  </InputDropdown.Empty>
                )}
                <InputDropdown.List>
                  <Command.List
                    ref={setScrollNode}
                    id={listId}
                    aria-busy={Boolean(loading)}
                  >
                    {virtualized ? (
                      <div
                        style={{
                          height: virtualizer.getTotalSize(),
                          position: "relative",
                        }}
                      >
                        {virtualizer.getVirtualItems().map((item) => {
                          const row = rows[item.index];
                          const content = (() => {
                            if (row.type === "option")
                              return renderOption(row.option);
                            if (row.type === "action") return actionContent;
                            if (row.type === "heading")
                              return (
                                <div
                                  className={cn(
                                    "text-muted-foreground px-1.5 pt-2 pb-1 text-[11px] font-medium",
                                    item.index > 0 &&
                                      "border-border/60 mt-1 border-t",
                                  )}
                                >
                                  {row.label}
                                </div>
                              );
                            return assertUnreachable(row);
                          })();
                          return (
                            <div
                              key={
                                row.type === "option"
                                  ? row.option.value
                                  : row.id
                              }
                              ref={virtualizer.measureElement}
                              data-index={item.index}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${item.start}px)`,
                              }}
                            >
                              {content}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        {callToActionOption?.position === "first" &&
                          actionContent}
                        {options.map((node) => {
                          const group =
                            node.type === "group" ? node : undefined;
                          const items =
                            node.type === "group" ? node.options : [node];
                          const content = items.map(renderOption);
                          if (group)
                            return (
                              <InputDropdown.Group
                                key={group.id}
                                label={group.label}
                              >
                                <Command.Group
                                  heading={group.label}
                                  className="[&_[cmdk-group-heading]]:text-muted-foreground [[cmdk-group]:not([hidden])~&]:border-border/60 [&_[cmdk-group-heading]]:px-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [[cmdk-group]:not([hidden])~&]:mt-1 [[cmdk-group]:not([hidden])~&]:border-t"
                                >
                                  {content}
                                </Command.Group>
                              </InputDropdown.Group>
                            );
                          return (
                            <React.Fragment key={items[0].value}>
                              {content}
                            </React.Fragment>
                          );
                        })}
                        {callToActionOption?.position === "last" &&
                          actionContent}
                      </>
                    )}
                    {loading && (
                      <InputDropdown.Loading message={loading.message} />
                    )}
                  </Command.List>
                </InputDropdown.List>
              </Command>
            </InputDropdown.Root>
          </PopoverPrimitive.Content>
        </InputDropdown.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
