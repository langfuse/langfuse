"use client";

import * as React from "react";
import { defaultFilter } from "cmdk";
import { SelectDropdown } from "../SelectDropdown/SelectDropdown";
import { AsyncSelectInput } from "../AsyncSelectInput/AsyncSelectInput";
import type { InputControl } from "../internal/InputControl/InputControl";
import { SelectControl } from "../internal/SelectControl/SelectControl";
import { cn } from "@/src/utils/tailwind";

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
  | "onBlur"
> & {
  prefix?: React.ComponentProps<typeof InputControl>["prefix"];
  clearAction?: { label: string; onClear: () => void };
  placeholder: string;
  search?: { placeholder: string };
  /** Popup alignment for searchable selects. */
  align?: React.ComponentProps<typeof AsyncSelectInput>["align"];
  dropdownWidth?: React.ComponentProps<
    typeof AsyncSelectInput
  >["dropdownWidth"];
  /** Keeps the portaled option list out of session replay; not applied with `search`. */
  noCapture?: boolean;
  /** See `SelectDropdown`; not applied with `search`. */
  customOption?: React.ComponentProps<typeof SelectDropdown<V>>["customOption"];
  error?: boolean;
  muted?: boolean;
};

function SelectInputInner<V extends string>(
  {
    value,
    options,
    onValueChange,
    placeholder,
    emptyMessage,
    noCapture,
    customOption,
    search,
    align,
    dropdownWidth,
    error,
    muted,
    prefix,
    clearAction,
    ...triggerProps
  }: SelectInputProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const [searchValue, setSearchValue] = React.useState("");
  const clear =
    clearAction && value
      ? { label: clearAction.label, onClear: clearAction.onClear }
      : undefined;

  if (search) {
    const flatOptions = options.flatMap((node) =>
      node.type === "group" ? node.options : [node],
    );
    const selectedOption = flatOptions.find((option) => option.value === value);
    // cmdk exports this function, but types it as its optional `filter` prop.
    const rank = (option: (typeof flatOptions)[number]) =>
      defaultFilter!(option.value.trim(), searchValue.trim(), [
        option.label.trim(),
      ]);
    const filteredOptions = searchValue.trim()
      ? options
          .flatMap<
            React.ComponentProps<typeof SelectDropdown<V>>["options"][number]
          >((node) => {
            if (node.type === "group") {
              const items = node.options
                .filter((option) => rank(option) > 0)
                .sort((a, b) => rank(b) - rank(a));
              return items.length > 0 ? [{ ...node, options: items }] : [];
            }
            return rank(node) > 0 ? [node] : [];
          })
          .sort((a, b) => {
            const aRank =
              a.type === "group" ? Math.max(...a.options.map(rank)) : rank(a);
            const bRank =
              b.type === "group" ? Math.max(...b.options.map(rank)) : rank(b);
            return bRank - aRank;
          })
      : options;

    return (
      <AsyncSelectInput
        {...triggerProps}
        ref={ref}
        value={selectedOption ?? null}
        options={filteredOptions}
        onValueChange={(option) => onValueChange(option.value)}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        align={align}
        dropdownWidth={dropdownWidth}
        search={{
          placeholder: search.placeholder,
          value: searchValue,
          onValueChange: setSearchValue,
        }}
        error={error}
        muted={muted}
        prefix={prefix}
        clearAction={clear}
      />
    );
  }

  const SelectedIcon = [
    ...options.flatMap((node) =>
      node.type === "group" ? node.options : [node],
    ),
    ...(customOption ? [customOption] : []),
  ].find((option) => option.value === value)?.icon;

  return (
    <SelectDropdown
      value={value}
      options={options}
      onValueChange={onValueChange}
      emptyMessage={emptyMessage}
      noCapture={noCapture}
      customOption={customOption}
      ref={ref}
      {...triggerProps}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <SelectControl
          error={error}
          disabled={triggerProps.disabled}
          prefix={prefix}
          clear={clear}
        >
          <button {...getTriggerProps()}>
            {SelectedIcon ? (
              // Box-centered, the icon sits above the middle of lowercase text.
              <span className="flex shrink-0 translate-y-px" aria-hidden>
                <SelectedIcon size="base" />
              </span>
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-left",
                muted && "text-muted-foreground",
              )}
              title={selectedLabel}
            >
              {selectedLabel ?? placeholder}
            </span>
          </button>
        </SelectControl>
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
