import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { JudgeModelPicker } from "./JudgeModelPicker";

const meta = preview.meta({ component: JudgeModelPicker });

type JudgeModelPickerProps = Parameters<typeof JudgeModelPicker>[0];

function StatefulJudgeModelPicker(args: JudgeModelPickerProps) {
  const [, updateArgs] = useArgs<JudgeModelPickerProps>();

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
    />
  );
}

const actions = {
  onOpenChange: fn(),
  onModeChange: fn(),
  onSelectCustom: fn(),
  onConfigureProviders: fn(),
  onConfigureDefault: fn(),
};

export const ProjectDefault = meta.story({
  args: {
    ...actions,
    open: false,
    mode: "default",
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups: [["OpenAI", ["gpt-4.1-mini", "gpt-4.1"]]],
    selectedModel: null,
    disabled: false,
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
    disabled: false,
  },
  render: StatefulJudgeModelPicker,
});

export const NoModels = meta.story({
  args: {
    ...actions,
    open: true,
    mode: "default",
    defaultModel: null,
    providerGroups: [],
    selectedModel: null,
    disabled: false,
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
    disabled: false,
  },
  render: StatefulJudgeModelPicker,
});
