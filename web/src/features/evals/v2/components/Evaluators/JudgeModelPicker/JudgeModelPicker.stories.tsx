import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
  type JudgeModelPickerProps,
} from "./JudgeModelPicker";

type EvaluatorJudgeModelPickerProps = Exclude<
  JudgeModelPickerProps,
  { purpose: "projectDefault" }
>;

function EvaluatorJudgeModelPicker(props: EvaluatorJudgeModelPickerProps) {
  return <JudgeModelPicker {...props} />;
}

const meta = preview.meta({ component: EvaluatorJudgeModelPicker });

function StatefulJudgeModelPicker(args: EvaluatorJudgeModelPickerProps) {
  const [, updateArgs] = useArgs<EvaluatorJudgeModelPickerProps>();

  return (
    <JudgeModelPicker
      {...args}
      onOpenChange={(open) => {
        updateArgs({ open });
        args.onOpenChange(open);
      }}
      onModeChange={(mode) => {
        updateArgs({ mode });
        args.onModeChange(mode);
      }}
      onSelectCustom={(selectedModel) => {
        updateArgs({ mode: "custom", selectedModel });
        args.onSelectCustom(selectedModel);
      }}
    >
      <PopoverTrigger asChild>
        <JudgeModelPickerTrigger
          mode={args.mode}
          defaultModel={args.defaultModel}
          selectedModel={args.selectedModel}
          disabled={false}
        />
      </PopoverTrigger>
    </JudgeModelPicker>
  );
}

const actions = {
  children: null,
  onOpenChange: fn(),
  onModeChange: fn(),
  onSelectCustom: fn(),
  onConfigureProviders: fn(),
  onConfigureModel: fn(),
  canSetProjectDefault: true,
  onSetProjectDefault: fn(),
};

export const ProjectDefault = meta.story({
  args: {
    ...actions,
    open: false,
    mode: "default",
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups: [["OpenAI", ["gpt-4.1-mini", "gpt-4.1"]]],
    selectedModel: null,
  },
  render: StatefulJudgeModelPicker,
});

export const Custom = meta.story({
  args: {
    ...actions,
    open: false,
    mode: "custom",
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups: [["Anthropic", ["claude-sonnet-4"]]],
    selectedModel: { provider: "Anthropic", model: "claude-sonnet-4" },
  },
  render: StatefulJudgeModelPicker,
});

export const CustomWithModelConfiguration = meta.story({
  args: {
    ...actions,
    open: true,
    mode: "custom",
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups: [["Anthropic", ["claude-sonnet-4"]]],
    selectedModel: { provider: "Anthropic", model: "claude-sonnet-4" },
    hasModelConfiguration: true,
  },
  render: StatefulJudgeModelPicker,
});

export const CustomWithoutSelection = meta.story({
  args: {
    ...actions,
    open: true,
    mode: "custom",
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups: [["OpenAI", ["gpt-4.1-mini", "gpt-4.1"]]],
    selectedModel: null,
  },
  render: StatefulJudgeModelPicker,
});

/** The custom selection is the project default, so promoting it is a no-op. */
export const SelectedModelMatchesProjectDefault = meta.story({
  args: {
    ...actions,
    open: true,
    mode: "custom",
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups: [["OpenAI", ["gpt-4.1-mini", "gpt-4.1"]]],
    selectedModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
  },
  render: StatefulJudgeModelPicker,
});

/** Without `evalDefaultModel:CUD` the promote action stays disabled. */
export const CannotSetProjectDefault = meta.story({
  args: {
    ...actions,
    open: true,
    mode: "custom",
    canSetProjectDefault: false,
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups: [["Anthropic", ["claude-sonnet-4"]]],
    selectedModel: { provider: "Anthropic", model: "claude-sonnet-4" },
  },
  render: StatefulJudgeModelPicker,
});

/**
 * Also what the list looks like while the LLM connections query is still
 * pending — the picker cannot tell "no providers configured" apart from
 * "providers not loaded yet". In the app the trigger is disabled meanwhile, so
 * the popover is not reachable in the pending case.
 */
export const NoModels = meta.story({
  args: {
    ...actions,
    open: true,
    mode: "default",
    defaultModel: null,
    providerGroups: [],
    selectedModel: null,
  },
  render: StatefulJudgeModelPicker,
});

export const NoProjectDefault = meta.story({
  args: {
    ...actions,
    open: true,
    mode: "default",
    defaultModel: null,
    providerGroups: [
      ["OpenAI", ["gpt-4.1-mini", "gpt-4.1"]],
      ["Anthropic", ["claude-sonnet-4"]],
    ],
    selectedModel: null,
  },
  render: StatefulJudgeModelPicker,
});
