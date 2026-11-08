"use client";

import * as React from "react";
import { defaultFilter } from "cmdk";

import { SelectDropdown } from "../SelectDropdown/SelectDropdown";
import { AsyncSelectInput } from "../AsyncSelectInput/AsyncSelectInput";
import { DropdownIndicator } from "../DropdownIndicator/DropdownIndicator";
import { InputControl } from "../internal/InputControl/InputControl";
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
  placeholder: string;
  search?: { placeholder: string };
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
    search,
    error,
    muted,
    ...triggerProps
  }: SelectInputProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const [searchValue, setSearchValue] = React.useState("");

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
        search={{
          ...search,
          value: searchValue,
          onValueChange: setSearchValue,
        }}
        error={error}
        muted={muted}
      />
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
              className={cn(
                "min-w-0 flex-1 truncate text-left",
                muted && "text-muted-foreground",
              )}
              title={selectedLabel}
            >
              {selectedLabel ?? placeholder}
            </span>
            <DropdownIndicator color={error ? "destructive" : "tertiary"} />
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
