import { useState } from "react";
import { expect, fn, within } from "storybook/test";
import { KeyRound, User } from "@langfuse/icons";

import preview from "@/.storybook/preview";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
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

function StoryGuardrailFormDialog({
  title,
  onBack,
  ...props
}: Omit<GatewayGuardrailFormDialogProps, "targetPicker" | "onSubmit"> & {
  title: string;
  onBack?: () => void;
}) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const options = needle
    ? TARGET_OPTIONS.filter(
        (option) =>
          option.label.toLowerCase().includes(needle) ||
          option.secondaryLabel?.toLowerCase().includes(needle),
      )
    : TARGET_OPTIONS;

  const isExternal = Boolean(
    GATEWAY_GUARDRAIL_TEMPLATES.find(
      (template) => template.id === props.templateKind,
    )?.external,
  );

  return (
    <DialogController
      initialState={() => true}
      renderDialog={() => (
        <Dialog
          title={title}
          size={isExternal ? "md" : "lg"}
          noCapture
          back={
            onBack
              ? { onClick: onBack, label: "Back to guardrail types" }
              : undefined
          }
        >
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
        </Dialog>
      )}
    >
      {() => null}
    </DialogController>
  );
}

const piiTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find((t) => t.id === "pii")!;
const secretsTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
  (t) => t.id === "secrets",
)!;
const promptInjectionTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
  (t) => t.id === "prompt_injection",
)!;
const containsTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
  (t) => t.id === "contains",
)!;
const customRegexTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
  (t) => t.id === "custom_regex",
)!;
const bedrockTemplate = GATEWAY_GUARDRAIL_TEMPLATES.find(
  (t) => t.id === "bedrock",
)!;

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
      scope: "LAST_TURN",
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
      scope: "LAST_TURN",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: secretsTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
    onBack: fn(),
  },
});

export const CreatePromptInjection = meta.story({
  args: {
    title: promptInjectionTemplate.name,
    submitLabel: "Add guardrail",
    templateKind: "prompt_injection",
    availablePresets: promptInjectionTemplate.presets,
    initialValues: {
      name: promptInjectionTemplate.name,
      presets: [...promptInjectionTemplate.defaultPresets],
      secretPrefixes: [],
      containsWords: [],
      action: promptInjectionTemplate.defaultAction ?? "LOG",
      scope: "LAST_TURN",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: promptInjectionTemplate.sampleTestText,
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
      scope: "LAST_TURN",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: containsTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
    onBack: fn(),
  },
});

export const CreateCustomRegex = meta.story({
  args: {
    title: customRegexTemplate.name,
    submitLabel: "Add guardrail",
    templateKind: "custom_regex",
    availablePresets: [],
    initialValues: {
      name: customRegexTemplate.name,
      presets: [],
      secretPrefixes: [],
      containsWords: [],
      customRegex: String.raw`\bORD-\d{6}\b`,
      action: "BLOCK",
      scope: "LAST_TURN",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: customRegexTemplate.sampleTestText,
    customRegexPreview: {
      pattern: String.raw`\bORD-\d{6}\b`,
      text: customRegexTemplate.sampleTestText,
      isFetching: false,
      result: { valid: true, matches: [{ start: 6, end: 16 }] },
      onChange: fn(),
    },
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
      action: "ENFORCE",
      scope: "LAST_TURN",
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
      action: "ENFORCE",
      scope: "LAST_TURN_AND_OUTPUT",
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
      scope: "LAST_TURN",
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
      scope: "OUTPUT",
      redactionLabel: "[EMAIL]",
      targets: [EVERYONE_TARGET_OPTION],
    },
    initialTestText: piiTemplate.sampleTestText,
    isSubmitting: false,
    errorMessage: null,
  },
});

export const OutputStreamingNotice = meta.story({
  name: "(Test) Output guardrail shows streaming notice",
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
      scope: "OUTPUT",
      redactionLabel: "[EMAIL]",
      targets: [EVERYONE_TARGET_OPTION],
    },
    isSubmitting: false,
    errorMessage: null,
  },
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Streaming is turned off when checking output.",
    );
  },
});

export const InputHidesStreamingNotice = meta.story({
  name: "(Test) Input guardrail hides streaming notice",
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
      scope: "LAST_TURN",
      targets: [EVERYONE_TARGET_OPTION],
    },
    isSubmitting: false,
    errorMessage: null,
  },
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
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
      scope: "LAST_TURN",
      targets: [EVERYONE_TARGET_OPTION],
    },
    isSubmitting: false,
    errorMessage: GATEWAY_GUARDRAIL_LIMIT_ERROR_MESSAGE,
    onContactSupport: fn(),
  },
});
