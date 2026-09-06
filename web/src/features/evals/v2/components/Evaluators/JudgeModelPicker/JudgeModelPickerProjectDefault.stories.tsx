import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { PopoverTrigger } from "@/src/components/ui/popover";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
  type JudgeModelPickerProps,
} from "./JudgeModelPicker";

type ProjectDefaultJudgeModelPickerProps = Extract<
  JudgeModelPickerProps,
  { purpose: "projectDefault" }
>;

/** The picker as the evaluators overview renders it, to pick the project default. */
function JudgeModelPickerProjectDefault(
  props: ProjectDefaultJudgeModelPickerProps,
) {
  return <JudgeModelPicker {...props} />;
}

const meta = preview.meta({ component: JudgeModelPickerProjectDefault });

function StatefulJudgeModelPicker(args: ProjectDefaultJudgeModelPickerProps) {
  const [, updateArgs] = useArgs<ProjectDefaultJudgeModelPickerProps>();

  return (
    <JudgeModelPicker
      {...args}
      onOpenChange={(open) => {
        updateArgs({ open });
        args.onOpenChange(open);
      }}
      onSelectProjectDefault={(defaultModel: JudgeModel) => {
        updateArgs({ defaultModel });
        args.onSelectProjectDefault(defaultModel);
      }}
    >
      <PopoverTrigger asChild>
        <JudgeModelPickerTrigger
          mode="default"
          defaultModel={args.defaultModel}
          selectedModel={null}
          missingDefaultLabel="Set project default model"
          disabled={false}
        />
      </PopoverTrigger>
    </JudgeModelPicker>
  );
}

const actions = {
  purpose: "projectDefault" as const,
  children: null,
  onOpenChange: fn(),
  onSelectProjectDefault: fn(),
  onConfigureProviders: fn(),
  onConfigureModel: fn(),
};

const providerGroups: Array<[string, string[]]> = [
  ["OpenAI", ["gpt-4.1-mini", "gpt-4.1"]],
  ["Anthropic", ["claude-sonnet-4"]],
];

/** The current default is marked and cannot be re-selected. */
export const Default = meta.story({
  args: {
    ...actions,
    open: true,
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups,
  },
  render: StatefulJudgeModelPicker,
});

export const WithoutProjectDefault = meta.story({
  args: {
    ...actions,
    open: true,
    defaultModel: null,
    providerGroups,
  },
  render: StatefulJudgeModelPicker,
});

/** No configured providers, so there is nothing to promote to default. */
export const NoModels = meta.story({
  args: {
    ...actions,
    open: true,
    defaultModel: null,
    providerGroups: [],
  },
  render: StatefulJudgeModelPicker,
});

export const Closed = meta.story({
  args: {
    ...actions,
    open: false,
    defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
    providerGroups,
  },
  render: StatefulJudgeModelPicker,
});
