"use client";

import * as React from "react";
import { defaultFilter } from "cmdk";
import { cn } from "@/src/utils/tailwind";
import { SelectDropdown } from "../SelectDropdown/SelectDropdown";
import { ControlledSelectInput } from "../ControlledSelectInput/ControlledSelectInput";
import type { InputControl } from "../internal/InputControl/InputControl";
import { SelectControl } from "../internal/SelectControl/SelectControl";

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
  openState?: React.ComponentProps<
    typeof ControlledSelectInput<V>
  >["openState"];
  search?:
    | React.ComponentProps<typeof ControlledSelectInput<V>>["search"]
    | { placeholder: string };
  /** Popup alignment for searchable selects. */
  align?: React.ComponentProps<typeof ControlledSelectInput<V>>["align"];
  dropdownWidth?: React.ComponentProps<
    typeof ControlledSelectInput<V>
  >["dropdownWidth"];
  /** Keeps the portaled option list out of session replay. */
  noCapture?: boolean;
  /** Pure resolver; the query is trimmed and empty when search is disabled. */
  getAdditionalOption?: (context: {
    query: string;
  }) => React.ComponentProps<typeof SelectDropdown<V>>["customOption"];
  error?: boolean;
  muted?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
};

export function SelectInput<V extends string>({
  value,
  options,
  onValueChange,
  placeholder,
  emptyMessage,
  noCapture,
  getAdditionalOption,
  search: searchProps,
  openState: controlledOpenState,
  align,
  dropdownWidth,
  error,
  muted,
  prefix,
  clearAction,
  ref,
  ...triggerProps
}: SelectInputProps<V>) {
  const [open, setOpen] = React.useState(false);
  const [queryValue, setQueryValue] = React.useState("");
  const openState = controlledOpenState ?? { open, onOpenChange: setOpen };
  let search:
    | React.ComponentProps<typeof ControlledSelectInput<V>>["search"]
    | undefined;
  if (searchProps) {
    if ("value" in searchProps) {
      search = searchProps;
    } else {
      search = {
        ...searchProps,
        value: queryValue,
        onValueChange: setQueryValue,
      };
    }
  }
  const searchValue = search?.value ?? "";
  const [selectedAdditionalOption, setSelectedAdditionalOption] =
    React.useState<
      NonNullable<
        React.ComponentProps<typeof SelectDropdown<V>>["customOption"]
      >
    >();
  const query = search ? searchValue.trim() : "";
  const flatOptions = options.flatMap((node) =>
    node.type === "group" ? node.options : [node],
  );
  const candidate = getAdditionalOption?.({ query });
  const additionalOption =
    candidate && !flatOptions.some((option) => option.value === candidate.value)
      ? candidate
      : undefined;

  if (search) {
    const selectedOption = [
      ...flatOptions,
      additionalOption,
      selectedAdditionalOption,
    ].find((option) => option?.value === value);
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
      <ControlledSelectInput
        {...triggerProps}
        ref={ref}
        openState={openState}
        noCapture={noCapture}
        value={
          selectedOption ??
          (getAdditionalOption && value ? { value, label: value } : null)
        }
        options={
          additionalOption
            ? [...filteredOptions, additionalOption]
            : filteredOptions
        }
        onValueChange={(option) => {
          setSelectedAdditionalOption(
            option.value === additionalOption?.value
              ? additionalOption
              : undefined,
          );
          onValueChange(option.value);
        }}
        placeholder={placeholder}
        emptyMessage={emptyMessage}
        align={align}
        dropdownWidth={dropdownWidth}
        search={search}
        error={error}
        muted={muted}
        prefix={prefix}
        clearAction={clearAction}
      />
    );
  }

  const SelectedIcon = [...flatOptions, additionalOption].find(
    (option) => option?.value === value,
  )?.icon;

  return (
    <SelectDropdown
      value={value}
      options={options}
      onValueChange={onValueChange}
      emptyMessage={emptyMessage}
      noCapture={noCapture}
      openState={openState}
      customOption={additionalOption}
      ref={ref}
      {...triggerProps}
    >
      {({ getTriggerProps, selectedLabel }) => (
        <SelectControl
          error={error}
          disabled={triggerProps.disabled}
          prefix={prefix}
          clear={clearAction}
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
