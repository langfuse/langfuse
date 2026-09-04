import preview from "../../../../../../../.storybook/preview";
import { JudgeModelPickerTrigger } from "./JudgeModelPicker";

const meta = preview.meta({ component: JudgeModelPickerTrigger });

const projectDefault = { provider: "OpenAI", model: "gpt-4.1-mini" };

export const Default = meta.story({
  args: {
    mode: "default",
    defaultModel: projectDefault,
    selectedModel: null,
    disabled: false,
  },
});

export const CustomModel = meta.story({
  args: {
    mode: "custom",
    defaultModel: projectDefault,
    selectedModel: { provider: "Anthropic", model: "claude-sonnet-4" },
    disabled: false,
  },
});

export const CustomModelMatchingProjectDefault = meta.story({
  args: {
    mode: "custom",
    defaultModel: projectDefault,
    selectedModel: projectDefault,
    disabled: false,
  },
});

export const CustomWithoutSelection = meta.story({
  args: {
    mode: "custom",
    defaultModel: projectDefault,
    selectedModel: null,
    disabled: false,
  },
});

export const MissingProjectDefault = meta.story({
  args: {
    mode: "default",
    defaultModel: null,
    selectedModel: null,
    disabled: false,
  },
});

export const MissingProjectDefaultWithCustomLabel = meta.story({
  args: {
    mode: "default",
    defaultModel: null,
    selectedModel: null,
    missingDefaultLabel: "Set project default model",
    disabled: false,
  },
});

export const LongModelName = meta.story({
  args: {
    mode: "custom",
    defaultModel: projectDefault,
    selectedModel: {
      provider: "Amazon Bedrock (eu-central-1)",
      model: "anthropic.claude-sonnet-4-20250514-v1:0-with-a-very-long-suffix",
    },
    disabled: false,
  },
});

/**
 * While the project default model mutation is in flight: the chevron becomes a
 * spinner, so the label stays readable and the trigger keeps its width instead
 * of collapsing and shifting the header around it. `loadingText` is not
 * rendered; it becomes the button's accessible name.
 */
export const Loading = meta.story({
  args: {
    mode: "default",
    defaultModel: projectDefault,
    selectedModel: null,
    loading: true,
    loadingText: "Setting model...",
    disabled: true,
  },
});

/** Without `loadingText` the spinner carries no accessible announcement. */
export const LoadingWithoutText = meta.story({
  args: {
    mode: "default",
    defaultModel: projectDefault,
    selectedModel: null,
    loading: true,
    disabled: true,
  },
});

/**
 * The LLM connections query is still pending, so there are no providers to
 * choose from yet. Missing `evalDefaultModel:CUD` renders identically.
 */
export const Disabled = meta.story({
  args: {
    mode: "default",
    defaultModel: null,
    selectedModel: null,
    missingDefaultLabel: "Set project default model",
    disabled: true,
  },
});
