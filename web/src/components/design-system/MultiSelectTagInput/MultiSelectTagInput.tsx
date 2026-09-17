"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { ChevronDown, X } from "lucide-react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { cn } from "@/src/utils/tailwind";
import { InputControl } from "../internal/InputControl/InputControl";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";

type MultiSelectTagOption<V> = {
  value: V;
  label: string;
};

type MultiSelectTagInputProps<V> = {
  value: V[];
  options: MultiSelectTagOption<V>[];
  onValueChange: (newValue: V[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  selectAllLabel?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function MultiSelectTagInput<V extends string>({
  value,
  options,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  selectAllLabel,
  disabled,
  error,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: MultiSelectTagInputProps<V>) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const [fullyVisibleValues, setFullyVisibleValues] = React.useState<Set<V>>(
    new Set(),
  );
  const [trailingHiddenWidth, setTrailingHiddenWidth] = React.useState(0);
  const tagsContainerRef = React.useRef<HTMLDivElement>(null);
  const tagRefs = React.useRef(new Map<V, HTMLSpanElement>());
  const listId = React.useId();
  const selectedOptions = React.useMemo(
    () =>
      value.map((selectedValue) => ({
        value: selectedValue,
        label:
          options.find((option) => option.value === selectedValue)?.label ??
          selectedValue,
      })),
    [options, value],
  );
  const allSelected =
    options.length > 0 &&
    options.every((option) => value.includes(option.value));
  const hiddenOptionCount = selectedOptions.filter(
    (option) => !fullyVisibleValues.has(option.value),
  ).length;
  React.useLayoutEffect(() => {
    const tagsContainer = tagsContainerRef.current;
    if (!tagsContainer) return;

    const recomputeTagVisibility = () => {
      const containerBounds = tagsContainer.getBoundingClientRect();
      const nextValues = new Set<V>();

      tagRefs.current.forEach((tag, optionValue) => {
        const tagBounds = tag.getBoundingClientRect();
        const isFullyVisible =
          tagBounds.left >= containerBounds.left - 1 &&
          tagBounds.right <= containerBounds.right + 1;

        if (isFullyVisible) nextValues.add(optionValue);
      });

      const rightmostVisibleTag = [...tagRefs.current.entries()]
        .filter(([optionValue]) => nextValues.has(optionValue))
        .map(([, tag]) => tag.getBoundingClientRect().right)
        .reduce((rightmost, tagRight) => Math.max(rightmost, tagRight), 0);

      setTrailingHiddenWidth(
        rightmostVisibleTag > 0
          ? Math.max(0, containerBounds.right - rightmostVisibleTag)
          : 0,
      );

      setFullyVisibleValues((currentValues) => {
        if (
          currentValues.size === nextValues.size &&
          [...currentValues].every((optionValue) => nextValues.has(optionValue))
        ) {
          return currentValues;
        }

        return nextValues;
      });
    };

    recomputeTagVisibility();
    const resizeObserver = new ResizeObserver(recomputeTagVisibility);
    resizeObserver.observe(tagsContainer);
    tagRefs.current.forEach((tag) => resizeObserver.observe(tag));
    tagsContainer.addEventListener("scroll", recomputeTagVisibility, {
      passive: true,
    });

    return () => {
      resizeObserver.disconnect();
      tagsContainer.removeEventListener("scroll", recomputeTagVisibility);
    };
  }, [selectedOptions]);

  const changeValue = (newValue: V[]) => {
    if (disabled) return;
    onValueChange(newValue);
  };

  const removeValue = (removedValue: V) => {
    changeValue(
      value.filter((selectedValue) => selectedValue !== removedValue),
    );
  };

  return (
    <PopoverPrimitive.Root
      open={!disabled && open}
      onOpenChange={(newOpen) => {
        if (disabled) return;
        setOpen(newOpen);
      }}
    >
      <InputControl contentLayout="none" error={error} disabled={disabled}>
        <PopoverPrimitive.Trigger asChild>
          <div
            id={id}
            role="combobox"
            aria-controls={listId}
            aria-describedby={ariaDescribedBy}
            aria-expanded={open}
            aria-invalid={ariaInvalid}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            onPointerDown={(event) => {
              if (disabled) event.preventDefault();
            }}
            onClick={(event) => {
              if (disabled) event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === "Backspace" && value.length > 0) {
                event.preventDefault();
                const lastValue = value.at(-1);
                if (lastValue !== undefined) removeValue(lastValue);
              }
            }}
          >
            <div
              data-tag-input-layout
              className="flex h-full min-w-0 items-center gap-1 px-1.5"
            >
              <div
                ref={tagsContainerRef}
                data-tags-container
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {selectedOptions.length === 0 ? (
                  <span className="text-muted-foreground">{placeholder}</span>
                ) : (
                  selectedOptions.map((option) => (
                    <span
                      key={option.value}
                      ref={(tag) => {
                        if (tag) {
                          tagRefs.current.set(option.value, tag);
                          return;
                        }

                        tagRefs.current.delete(option.value);
                      }}
                      data-value={option.value}
                      title={option.label}
                      className={cn(
                        "bg-muted flex h-6 max-w-48 min-w-10 shrink items-center gap-1 rounded px-2",
                        !fullyVisibleValues.has(option.value) && "invisible",
                      )}
                    >
                      <span className="min-w-0 truncate" title={option.label}>
                        {option.label}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        aria-label={`Remove ${option.label}`}
                        className="text-muted-foreground hover:text-foreground -mr-1 flex shrink-0 items-center rounded-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeValue(option.value);
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              {hiddenOptionCount > 0 && (
                <span
                  data-overflow-count={hiddenOptionCount}
                  aria-label={`${hiddenOptionCount} more selected`}
                  title={`${hiddenOptionCount} more selected`}
                  className="bg-muted flex h-6 shrink-0 items-center rounded px-1.5 text-xs tabular-nums"
                  style={{ transform: `translateX(-${trailingHiddenWidth}px)` }}
                >
                  +{hiddenOptionCount}
                </span>
              )}
              {value.length === 0 && (
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 opacity-50"
                />
              )}
              {value.length > 0 && (
                <button
                  type="button"
                  disabled={disabled}
                  data-clear-selection
                  aria-label="Clear selection"
                  className="text-muted-foreground hover:text-foreground ml-auto flex shrink-0 items-center rounded-sm px-1"
                  onClick={(event) => {
                    event.stopPropagation();
                    changeValue([]);
                  }}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>
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
                      {selectAllLabel && options.length > 0 && (
                        <InputDropdown.Option highlight="aria-selected">
                          <CommandPrimitive.Item
                            value={selectAllLabel}
                            onSelect={() =>
                              changeValue(
                                allSelected
                                  ? []
                                  : options.map((option) => option.value),
                              )
                            }
                          >
                            <InputDropdown.OptionContent
                              label={selectAllLabel}
                              title={selectAllLabel}
                              indicator={
                                <InputDropdown.CheckIndicator
                                  checked={allSelected}
                                />
                              }
                            />
                          </CommandPrimitive.Item>
                        </InputDropdown.Option>
                      )}
                      {selectAllLabel && options.length > 0 && (
                        <div className="bg-border my-1 h-px" />
                      )}
                      {options.map((option) => {
                        const isSelected = value.includes(option.value);

                        return (
                          <InputDropdown.Option
                            key={option.value}
                            highlight="aria-selected"
                          >
                            <CommandPrimitive.Item
                              value={option.value || option.label}
                              keywords={[option.label]}
                              onSelect={() => {
                                if (isSelected) {
                                  removeValue(option.value);
                                  return;
                                }

                                changeValue([...value, option.value]);
                              }}
                            >
                              <InputDropdown.OptionContent
                                label={option.label}
                                title={option.label}
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
