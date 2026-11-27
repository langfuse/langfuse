"use client";

import * as React from "react";
import { defaultFilter } from "cmdk";

import {
  AsyncMultiSelectTagInput,
  type MultiSelectTagOption,
} from "../AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";

type MultiSelectTagInputProps<V extends string> = Omit<
  Extract<
    React.ComponentProps<typeof AsyncMultiSelectTagInput<V>>,
    { options: MultiSelectTagOption<V>[] }
  >,
  "value" | "onValueChange" | "search" | "loading" | "groups"
> & {
  value: V[];
  onValueChange: (newValue: V[]) => void;
  searchPlaceholder: string;
  /** Pure resolver; the search query is trimmed. */
  getAdditionalOption?: (context: {
    query: string;
  }) => MultiSelectTagOption<V> | undefined;
};

/** Filters `options` locally as the user types. */
export function MultiSelectTagInput<V extends string>({
  value,
  options,
  onValueChange,
  searchPlaceholder,
  selectAllLabel,
  getAdditionalOption,
  ...props
}: MultiSelectTagInputProps<V>) {
  const [searchValue, setSearchValue] = React.useState("");
  const query = searchValue.trim();
  const candidate = getAdditionalOption?.({ query });
  const additionalOption =
    candidate && !options.some((option) => option.value === candidate.value)
      ? candidate
      : undefined;
  const filteredOptions = query ? rankOptions(options, query) : options;
  const selected = value.map(
    (selectedValue) =>
      options.find((option) => option.value === selectedValue) ??
      (additionalOption?.value === selectedValue
        ? additionalOption
        : undefined) ?? {
        value: selectedValue,
        label: selectedValue,
      },
  );

  const handleValueChange = (newValue: MultiSelectTagOption<V>[]) =>
    onValueChange(newValue.map((option) => option.value));

  return (
    <AsyncMultiSelectTagInput
      {...props}
      value={selected}
      options={
        additionalOption
          ? [...filteredOptions, additionalOption]
          : filteredOptions
      }
      onValueChange={handleValueChange}
      // Selecting all while a search hides some options would be ambiguous.
      selectAllLabel={query ? undefined : selectAllLabel}
      search={{
        placeholder: searchPlaceholder,
        value: searchValue,
        onValueChange: setSearchValue,
      }}
    />
  );
}

/** Options matching the query, best match first, as cmdk itself would rank them. */
function rankOptions<V extends string>(
  options: MultiSelectTagOption<V>[],
  query: string,
) {
  // cmdk exports this function, but types it as its optional `filter` prop.
  const rank = (option: MultiSelectTagOption<V>) =>
    defaultFilter!(option.value || option.label, query, [
      [option.label, option.secondaryLabel].filter(Boolean).join(" "),
    ]);
  return options
    .map((option) => ({ option, score: rank(option) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ option }) => option);
}
