import { useState } from "react";
import { fn } from "storybook/test";
import { KeyRound, User } from "@langfuse/icons";

import preview from "@/.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";
import { GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { GATEWAY_GUARDRAIL_TEMPLATES } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/gatewayGuardrailTemplates";
import { EVERYONE_TARGET_OPTION } from "@/src/features/ai-gateway/components/GatewayGuardrailDialogController/constants/guardrailTargetConstants";
import {
  GatewayGuardrailFormDialog,
  type GatewayGuardrailFormDialogProps,
} from "./GatewayGuardrailFormDialog";

const TARGET_OPTIONS: AsyncAutocompleteOption[] = [
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
const containsTemplate = GATEWAY_GUARDRAIL_TEMPLATES[2]!;
const bedrockTemplate = GATEWAY_GUARDRAIL_TEMPLATES[3]!;

const meta = preview.meta({
  component: StoryGuardrailFormDialog,
});

export const CreatePii = meta.story({
  args: {
    title: piiTemplate.name,
    submitLabel: "Add guardrail",
    templateKind: "pii",
    availablePresets: piiTemplate.presets,
    initialValues: {
      name: piiTemplate.name,
      presets: [...piiTemplate.defaultPresets],
      secretPrefixes: [],
      containsWords: [],
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
    templateKind: "secrets",
    availablePresets: secretsTemplate.presets,
    initialValues: {
      name: secretsTemplate.name,
      presets: [...secretsTemplate.defaultPresets],
      secretPrefixes: ["acme_sk_"],
      containsWords: [],
      action: "BLOCK",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: secretsTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
    onBack: fn(),
  },
});

export const CreateKeywordBlocklist = meta.story({
  args: {
    title: containsTemplate.name,
    submitLabel: "Add guardrail",
    templateKind: "contains",
    availablePresets: [],
    initialValues: {
      name: containsTemplate.name,
      presets: [],
      secretPrefixes: [],
      containsWords: ["confidential", "internal only"],
      action: "BLOCK",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: containsTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
    onBack: fn(),
  },
});

export const CreateBedrock = meta.story({
  args: {
    title: bedrockTemplate.name,
    submitLabel: "Test and save",
    templateKind: "bedrock",
    availablePresets: [],
    externalTest: {
      isPending: false,
      outcome: null,
      onTest: fn(),
    },
    initialValues: {
      name: bedrockTemplate.name,
      presets: [],
      secretPrefixes: [],
      containsWords: [],
      action: "BLOCK",
      targets: [EVERYONE_TARGET_OPTION],
    },
    isSubmitting: false,
    errorMessage: null,
    onBack: fn(),
  },
});

export const EditBedrock = meta.story({
  args: {
    title: "Edit guardrail",
    submitLabel: "Test and save",
    templateKind: "bedrock",
    availablePresets: [],
    hasSavedApiKey: true,
    externalTest: {
      isPending: false,
      outcome: { status: "success" },
      onTest: fn(),
    },
    initialValues: {
      name: "Bedrock content filter",
      presets: [],
      secretPrefixes: [],
      containsWords: [],
      bedrock: {
        guardrailId: "abc123def456",
        guardrailVersion: "1",
        region: "us-east-1",
      },
      action: "BLOCK",
      targets: [EVERYONE_TARGET_OPTION],
    },
    isSubmitting: false,
    errorMessage: null,
  },
});

export const EditGuardrail = meta.story({
  args: {
    title: "Edit guardrail",
    submitLabel: "Save changes",
    templateKind: "pii",
    availablePresets: piiTemplate.presets,
    initialValues: {
      name: "Block SSNs",
      presets: ["us_ssn"],
      secretPrefixes: [],
      containsWords: [],
      action: "BLOCK",
      targets: [TARGET_OPTIONS[1]!, TARGET_OPTIONS[2]!],
    },
    isSubmitting: false,
    errorMessage: null,
  },
});

export const EditRedactGuardrail = meta.story({
  args: {
    title: "Edit guardrail",
    submitLabel: "Save changes",
    templateKind: "pii",
    availablePresets: piiTemplate.presets,
    initialValues: {
      name: "Redact emails",
      presets: ["email"],
      secretPrefixes: [],
      containsWords: [],
      action: "REDACT",
      redactionLabel: "[EMAIL]",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: piiTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
  },
});

export const LimitReachedError = meta.story({
  args: {
    title: piiTemplate.name,
    submitLabel: "Add guardrail",
    templateKind: "pii",
    availablePresets: piiTemplate.presets,
    initialValues: {
      name: "Extra PII rule",
      presets: [...piiTemplate.defaultPresets],
      secretPrefixes: [],
      containsWords: [],
      action: "BLOCK",
      targets: [EVERYONE_TARGET_OPTION],
    },
    isSubmitting: false,
    errorMessage: GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
    onContactSupport: fn(),
  },
});
