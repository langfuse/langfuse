import { useState } from "react";
import { fn } from "storybook/test";
import { KeyRound, User } from "@langfuse/icons";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/TagAutocompleteInput";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import { GATEWAY_GUARDRAIL_TEMPLATES } from "@/src/features/ai-gateway/constants/gatewayGuardrailTemplates";
import {
  GatewayGuardrailFormDialog,
  type GatewayGuardrailFormDialogProps,
} from "./GatewayGuardrailFormDialog";

const TARGET_OPTIONS: TagAutocompleteOption[] = [
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

function StoryGuardrailFormDialog(
  props: Omit<GatewayGuardrailFormDialogProps, "targetPicker" | "onSubmit">,
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
        <GatewayGuardrailFormDialog
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

const piiTemplate = GATEWAY_GUARDRAIL_TEMPLATES[0]!;
const secretsTemplate = GATEWAY_GUARDRAIL_TEMPLATES[1]!;

const meta = preview.meta({
  component: StoryGuardrailFormDialog,
});

export const CreatePii = meta.story({
  args: {
    title: piiTemplate.name,
    submitLabel: "Add guardrail",
    availablePresets: piiTemplate.presets,
    initialValues: {
      name: piiTemplate.name,
      presets: [...piiTemplate.defaultPresets],
      action: "BLOCK",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: piiTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
    onBack: fn(),
  },
});

export const CreateSecretDetection = meta.story({
  args: {
    title: secretsTemplate.name,
    submitLabel: "Add guardrail",
    availablePresets: secretsTemplate.presets,
    initialValues: {
      name: secretsTemplate.name,
      presets: [...secretsTemplate.defaultPresets],
      action: "BLOCK",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: secretsTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
    onBack: fn(),
  },
});

export const EditGuardrail = meta.story({
  args: {
    title: "Edit guardrail",
    submitLabel: "Save changes",
    availablePresets: piiTemplate.presets,
    initialValues: {
      name: "Block SSNs",
      presets: ["us_ssn"],
      action: "BLOCK",
      targets: [TARGET_OPTIONS[1]!, TARGET_OPTIONS[2]!],
    },
    isSubmitting: false,
    errorMessage: null,
  },
});
