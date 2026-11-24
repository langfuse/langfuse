import { useState } from "react";
import { Globe, KeyRound, User } from "@langfuse/icons";

import preview from "@/.storybook/preview";
import {
  TagAutocompleteInput,
  type TagAutocompleteOption,
} from "./TagAutocompleteInput";

const SAMPLE_OPTIONS: TagAutocompleteOption[] = [
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

function InteractiveTagAutocomplete({
  initialValue = [],
  loading,
  error,
}: {
  initialValue?: TagAutocompleteOption[];
  loading?: { message: string };
  error?: boolean;
}) {
  const [value, setValue] = useState<TagAutocompleteOption[]>(initialValue);
  return (
    <div className="w-96">
      <TagAutocompleteInput
        label="Applies to"
        value={value}
        options={SAMPLE_OPTIONS}
        onValueChange={setValue}
        placeholder="Add users or API keys"
        loading={loading}
        error={error}
      />
    </div>
  );
}

const meta = preview.meta({
  component: InteractiveTagAutocomplete,
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
    loading: { message: "Searching…" },
  },
});

export const WithError = meta.story({
  args: {
    initialValue: [],
    error: true,
  },
});
