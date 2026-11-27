"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Tag, TagShell } from "@/src/components/design-system/Tag/Tag";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";
import { InputDropdown } from "../internal/InputDropdown/InputDropdown";
import { SelectControl } from "../internal/SelectControl/SelectControl";
import { OverflowList } from "@/src/components/design-system/OverflowList/OverflowList";

export type MultiSelectTagOption<V> = {
  value: V;
  label: string;
  disabled?: boolean;
  secondaryLabel?: string;
  showSecondaryLabelInTag?: boolean;
  badges?: string[];
  description?: string;
  color?: React.ComponentProps<typeof Tag>["color"];
};

type OptionGroup<V> = {
  id: string;
  label: string;
  caption?: { text: string; description: string };
  expanded: boolean;
  onExpandedChange?: React.ComponentProps<
    typeof InputDropdown.Group
  >["onExpandedChange"];
  options: MultiSelectTagOption<V>[];
};

type AsyncMultiSelectTagInputProps<V> = {
  /** The selected options, kept with their labels while the list shows others. */
  value: MultiSelectTagOption<V>[];
  onValueChange: (newValue: MultiSelectTagOption<V>[]) => void;
  placeholder: string;
  search: {
    placeholder: string;
    value: string;
    onValueChange: (value: string) => void;
  };
  emptyMessage: string;
  selectAllLabel?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  loading?: { message: string };
  label?: string;
  onAfterOpenChange?: (open: boolean) => void;
  /**
   * Prefer `"trigger"` (the default) to match the full input width, including
   * its prefix. Use `"wide"` or `"extra-wide"` when options need more room.
   * Both wider presets are capped to the available viewport width.
   */
  dropdownWidth?: "trigger" | "wide" | "extra-wide";
} & (
  | { options: MultiSelectTagOption<V>[]; groups?: never }
  | { options?: never; groups: OptionGroup<V>[] }
);

/** Search and selection are caller-owned; options are rendered without filtering. */
export function AsyncMultiSelectTagInput<V extends string>({
  value: selected,
  options: flatOptions,
  groups,
  onValueChange,
  placeholder,
  search,
  emptyMessage,
  selectAllLabel,
  disabled,
  error,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  loading,
  label,
  onAfterOpenChange,
  dropdownWidth = "trigger",
}: AsyncMultiSelectTagInputProps<V>) {
  const container = useLayerContainer("popover");
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const options = flatOptions ?? groups.flatMap((group) => group.options);
  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    setOpen(nextOpen);
    onAfterOpenChange?.(nextOpen);
    if (!nextOpen) search.onValueChange("");
  };
  const value = selected.map((option) => option.value);
  const selectedOptions = React.useMemo(
    () =>
      selected.map((option) => ({
        ...option,
        secondaryLabel: option.showSecondaryLabelInTag
          ? option.secondaryLabel
          : undefined,
      })),
    [selected],
  );
  const knownOptions = new Map(
    [...options, ...selected].map((option) => [option.value, option]),
  );
  const enabledOptions = options.filter((option) => !option.disabled);
  const disabledValues = [...knownOptions.values()]
    .filter((option) => option.disabled)
    .map((option) => option.value);
  const allSelected =
    enabledOptions.length > 0 &&
    enabledOptions.every((option) => value.includes(option.value));
  const changeValue = (newValue: V[]) => {
    if (disabled) return;
    const nextValues = [
      ...newValue.filter(
        (nextValue) =>
          !disabledValues.includes(nextValue) || value.includes(nextValue),
      ),
      ...value.filter(
        (currentValue) =>
          disabledValues.includes(currentValue) &&
          !newValue.includes(currentValue),
      ),
    ];
    onValueChange(
      nextValues.flatMap((nextValue) => {
        const option = knownOptions.get(nextValue);
        return option ? [option] : [];
      }),
    );
  };

  const removeValue = (removedValue: V) => {
    changeValue(
      value.filter((selectedValue) => selectedValue !== removedValue),
    );
  };

  const renderOption = (option: MultiSelectTagOption<V>) => {
    const isSelected = value.includes(option.value);
    const visibleLabel = [option.label, option.secondaryLabel]
      .filter(Boolean)
      .join(" ");
    return (
      <InputDropdown.Option
        key={option.value}
        highlight="aria-selected"
        checked={isSelected}
      >
        <CommandPrimitive.Item
          value={option.value || option.label}
          keywords={[visibleLabel]}
          aria-label={visibleLabel}
          aria-checked={isSelected}
          disabled={option.disabled}
          onSelect={() => {
            if (isSelected) {
              removeValue(option.value);
              return;
            }
            changeValue([...value, option.value]);
          }}
        >
          <InputDropdown.MultiSelectOptionContent
            label={option.label}
            secondaryLabel={option.secondaryLabel}
            markerColor={option.color}
            title={option.description ?? visibleLabel}
            checked={isSelected}
            badges={option.badges?.map((text) => ({
              text,
            }))}
          />
        </CommandPrimitive.Item>
      </InputDropdown.Option>
    );
  };

  return (
    <PopoverPrimitive.Root
      open={!disabled && open}
      onOpenChange={handleOpenChange}
    >
      <PopoverPrimitive.Anchor asChild>
        <SelectControl
          inset="compact"
          error={error}
          disabled={disabled}
          prefix={label ? { label } : undefined}
          clear={
            value.length > 0
              ? {
                  label: "Clear selection",
                  disabled: value.every((selectedValue) =>
                    disabledValues.includes(selectedValue),
                  ),
                  onClear: () => changeValue([]),
                }
              : undefined
          }
        >
          <PopoverPrimitive.Trigger asChild>
            <div
              id={id}
              className="cursor-pointer aria-disabled:cursor-not-allowed"
              role="combobox"
              aria-label={ariaLabel ?? label}
              aria-controls={listId}
              aria-describedby={ariaDescribedBy}
              aria-expanded={open && !disabled}
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

                if (event.target !== event.currentTarget) return;

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleOpenChange(!open);
                  return;
                }

                if (event.key === "Backspace" && value.length > 0) {
                  event.preventDefault();
                  const lastValue = value
                    .filter(
                      (selectedValue) =>
                        !disabledValues.includes(selectedValue),
                    )
                    .at(-1);
                  if (lastValue !== undefined) removeValue(lastValue);
                }
              }}
            >
              <div
                data-tag-input-layout
                className="flex h-full min-w-0 flex-1 items-center gap-1"
              >
                <div data-tags-container className="min-w-0 flex-1">
                  {selectedOptions.length === 0 ? (
                    <span className="text-muted-foreground">{placeholder}</span>
                  ) : (
                    <OverflowList
                      additionalOverflowCount={0}
                      spacing="tight"
                      minVisible={1}
                      items={selectedOptions}
                      getKey={(option) => option.value}
                      renderItem={(option, { getItemProps }) => (
                        <span
                          {...getItemProps({
                            className: "max-w-full min-w-10 shrink",
                          })}
                          data-value={option.value}
                        >
                          <Tag
                            text={option.label}
                            secondaryText={option.secondaryLabel}
                            color={option.color}
                            remove={{
                              onRemove: () => removeValue(option.value),
                              disabled: disabled || option.disabled,
                            }}
                          />
                        </span>
                      )}
                      renderOverflow={({ overflowItemCount }) => (
                        <span
                          data-overflow-count={overflowItemCount}
                          aria-label={`${overflowItemCount} more selected`}
                          title={selectedOptions
                            .slice(-overflowItemCount)
                            .map((option) => option.label)
                            .join("\n")}
                          className="flex shrink-0"
                        >
                          <TagShell>+{overflowItemCount}</TagShell>
                        </span>
                      )}
                    />
                  )}
                </div>
              </div>
            </div>
          </PopoverPrimitive.Trigger>
        </SelectControl>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal container={container}>
        <InputDropdown.Content width={`popover-${dropdownWidth}`}>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            collisionPadding={dropdownWidth === "trigger" ? undefined : 8}
            onOpenAutoFocus={(event) => {
              if (!searchInputRef.current) return;
              event.preventDefault();
              searchInputRef.current.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (disabled) event.preventDefault();
            }}
            onWheel={stopScrollPropagation()}
            onTouchMove={stopScrollPropagation()}
          >
            <InputDropdown.Root>
              <CommandPrimitive shouldFilter={false}>
                <InputDropdown.Search>
                  <CommandPrimitive.Input
                    ref={searchInputRef}
                    placeholder={search.placeholder}
                    value={search.value}
                    onValueChange={search.onValueChange}
                  />
                </InputDropdown.Search>
                {!loading && options.length === 0 && (
                  <InputDropdown.Empty>
                    <CommandPrimitive.Empty>
                      {emptyMessage}
                    </CommandPrimitive.Empty>
                  </InputDropdown.Empty>
                )}
                <InputDropdown.List>
                  <CommandPrimitive.List
                    id={listId}
                    aria-busy={Boolean(loading)}
                  >
                    <CommandPrimitive.Group className="text-foreground overflow-hidden">
                      {selectAllLabel && options.length > 0 && (
                        <InputDropdown.Option
                          highlight="aria-selected"
                          checked={allSelected}
                        >
                          <CommandPrimitive.Item
                            value={selectAllLabel}
                            aria-checked={allSelected}
                            disabled={enabledOptions.length === 0}
                            onSelect={() =>
                              changeValue(
                                allSelected
                                  ? []
                                  : options.map((option) => option.value),
                              )
                            }
                          >
                            <InputDropdown.MultiSelectOptionContent
                              label={selectAllLabel}
                              title={selectAllLabel}
                              checked={allSelected}
                            />
                          </CommandPrimitive.Item>
                        </InputDropdown.Option>
                      )}
                      {selectAllLabel && options.length > 0 && (
                        <CommandPrimitive.Separator className="bg-border my-1 h-px" />
                      )}
                      {flatOptions?.map(renderOption)}
                    </CommandPrimitive.Group>
                    {groups?.map((group) => (
                      <InputDropdown.Group
                        key={group.id}
                        label={group.label}
                        count={group.options.length}
                        caption={group.caption}
                        expanded={group.expanded}
                        onExpandedChange={group.onExpandedChange}
                      >
                        <CommandPrimitive.Group>
                          {group.options.map(renderOption)}
                        </CommandPrimitive.Group>
                      </InputDropdown.Group>
                    ))}
                    {loading && (
                      <InputDropdown.Loading message={loading.message} />
                    )}
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
