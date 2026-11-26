import { useState } from "react";
import { Globe, KeyRound, User } from "@langfuse/icons";

import preview from "@/.storybook/preview";
import {
  AsyncAutocompleteInput,
  type AsyncAutocompleteOption,
} from "./AsyncAutocompleteInput";

const SAMPLE_OPTIONS: AsyncAutocompleteOption[] = [
  { value: "everyone", label: "Everyone", icon: Globe },
  {
    value: "user:1",
    label: "Priya Raman",
    secondaryLabel: "priya@example.com",
    icon: User,
  },
  {
    value: "user:2",
    label: "Jonas Weber",
    secondaryLabel: "jonas@example.com",
    icon: User,
  },
  {
    value: "key:1",
    label: "support-bot-prod",
    secondaryLabel: "API key",
    icon: KeyRound,
  },
];

function InteractiveAsyncAutocomplete({
  initialValue = [],
  loading,
  error,
}: {
  initialValue?: AsyncAutocompleteOption[];
  loading?: { message: string };
  error?: boolean;
}) {
  const [value, setValue] = useState<AsyncAutocompleteOption[]>(initialValue);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const options = needle
    ? SAMPLE_OPTIONS.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          option.secondaryLabel?.toLowerCase().includes(needle),
      )
    : SAMPLE_OPTIONS;

  return (
    <div className="w-96">
      <AsyncAutocompleteInput
        aria-label="Applies to"
        value={value}
        options={options}
        onValueChange={setValue}
        search={{ value: query, onValueChange: setQuery }}
        placeholder="Add users or API keys"
        emptyMessage="No matches."
        loading={loading}
        error={error}
      />
    </div>
  );
}

const meta = preview.meta({
  component: InteractiveAsyncAutocomplete,
});

export const Default = meta.story({
  args: {
    initialValue: [SAMPLE_OPTIONS[0]!],
  },
});

export const MultipleSelected = meta.story({
  args: {
    initialValue: [SAMPLE_OPTIONS[1]!, SAMPLE_OPTIONS[3]!],
  },
});

export const Loading = meta.story({
  args: {
    initialValue: [],
    loading: { message: "Loading…" },
  },
});

export const WithError = meta.story({
  args: {
    initialValue: [],
    error: true,
  },
});
