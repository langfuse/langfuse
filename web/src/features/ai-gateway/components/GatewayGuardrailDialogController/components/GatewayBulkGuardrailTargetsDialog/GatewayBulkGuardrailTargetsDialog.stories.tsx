import { useState } from "react";
import { fn } from "storybook/test";
import { KeyRound, User } from "@langfuse/icons";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import {
  GatewayBulkGuardrailTargetsDialog,
  type GatewayBulkGuardrailTargetsDialogProps,
} from "./GatewayBulkGuardrailTargetsDialog";

const TARGET_OPTIONS: AsyncAutocompleteOption[] = [
  {
    value: "user:1",
    label: "Priya Raman",
    secondaryLabel: "priya@example.com",
    icon: User,
  },
  {
    value: "key:1",
    label: "support-bot-prod",
    secondaryLabel: "API key",
    icon: KeyRound,
  },
];

function StoryBulkTargetsDialog(
  props: Omit<
    GatewayBulkGuardrailTargetsDialogProps,
    "targetPicker" | "onSubmit"
  >,
) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const options = needle
    ? TARGET_OPTIONS.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          option.secondaryLabel?.toLowerCase().includes(needle),
      )
    : TARGET_OPTIONS;

  return (
    <DialogController
      initialState={() => true}
      renderDialog={() => (
        <GatewayBulkGuardrailTargetsDialog
          {...props}
          targetPicker={{
            options,
            search,
            onSearchChange: setSearch,
            isLoading: false,
          }}
          onSubmit={fn()}
        />
      )}
    >
      {() => null}
    </DialogController>
  );
}

const meta = preview.meta({
  component: StoryBulkTargetsDialog,
});

export const Default = meta.story({
  args: {
    selectedCount: 3,
    initialTargets: [EVERYONE_TARGET_OPTION],
    isSubmitting: false,
    errorMessage: null,
  },
});
