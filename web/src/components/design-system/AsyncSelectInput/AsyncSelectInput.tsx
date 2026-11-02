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
import { InputControl } from "../internal/InputControl/InputControl";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";
import { DropdownIndicator } from "../DropdownIndicator/DropdownIndicator";
import { Badge } from "../Badge/Badge";

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
  emptyMessage = "No options available.",
  error,
  muted,
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
          <InputDropdown.OptionContent
            type="radio"
            checked={value?.value === option.value}
            label={option.label}
            title={option.disabled ? option.disabledReason : option.label}
            badges={option.badges?.map((badge, index) => (
              <Badge key={index} {...badge} />
            ))}
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
          <DropdownIndicator color={error ? "destructive" : "tertiary"} />
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
                                <div className="text-muted-foreground px-2 py-1.5 text-xs font-bold">
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
                              <Command.Group
                                key={group.id}
                                heading={group.label}
                              >
                                {content}
                              </Command.Group>
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
