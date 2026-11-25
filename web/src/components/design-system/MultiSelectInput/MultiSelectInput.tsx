"use client";

import { useState, type Ref } from "react";
import { defaultFilter } from "cmdk";
import {
  ControlledMultiSelectInput,
  type ControlledMultiSelectInputProps,
} from "../ControlledMultiSelectInput/ControlledMultiSelectInput";

export function MultiSelectInput<V extends string>({
  options,
  value,
  selectAllLabel,
  getAdditionalOption,
  openState,
  searchState,
  ...props
}: Omit<
  ControlledMultiSelectInputProps<V>,
  "openState" | "searchState" | "selectAll" | "additionalOption"
> & {
  ref?: Ref<HTMLButtonElement>;
  openState?: ControlledMultiSelectInputProps<V>["openState"];
  searchState?: ControlledMultiSelectInputProps<V>["searchState"];
  selectAllLabel?: string;
  getAdditionalOption?: (context: {
    query: string;
  }) => ControlledMultiSelectInputProps<V>["additionalOption"];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = (searchState?.value ?? search).trim();
  const availableOptions = getAdditionalOption
    ? [
        ...options,
        ...value
          .filter(
            (selected) => !options.some((option) => option.value === selected),
          )
          .map((selected) => ({ value: selected, label: selected })),
      ]
    : options;
  const candidate = getAdditionalOption?.({ query });
  const additionalOption =
    candidate &&
    !availableOptions.some((option) => option.value === candidate.value)
      ? candidate
      : undefined;
  const results = query
    ? availableOptions
        .map((option) => ({
          option,
          rank: defaultFilter!(option.value.trim(), query, [
            option.label.trim(),
          ]),
        }))
        .filter(({ rank }) => rank > 0)
        .sort((a, b) => b.rank - a.rank)
        .map(({ option }) => option)
    : availableOptions;
  return (
    <ControlledMultiSelectInput
      {...props}
      value={value}
      options={results}
      additionalOption={additionalOption}
      selectAll={
        selectAllLabel && !query
          ? {
              label: selectAllLabel,
              values: options
                .filter((option) => !option.disabled)
                .map((option) => option.value),
            }
          : undefined
      }
      openState={openState ?? { open, onOpenChange: setOpen }}
      searchState={searchState ?? { value: search, onValueChange: setSearch }}
    />
  );
}
