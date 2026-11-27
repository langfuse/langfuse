import { useState } from "react";
import { useArgs } from "storybook/preview-api";
import { expect, fn, within } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { EvaluationTypeToggle } from "./EvaluationTypeToggle";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";

const meta = preview.meta({ component: EvaluationTypeToggle });

type EvaluationTypeToggleProps = Parameters<typeof EvaluationTypeToggle>[0];

function StatefulEvaluationTypeToggle(args: EvaluationTypeToggleProps) {
  const [, updateArgs] = useArgs<EvaluationTypeToggleProps>();

  return (
    <EvaluationTypeToggle
      {...args}
      onValueChange={(value) => {
        updateArgs({ value });
        args.onValueChange(value);
      }}
    />
  );
}

export const LlmJudge = meta.story({
  args: { value: EvalTemplateTypeEnum.LLM_AS_JUDGE, onValueChange: fn() },
  render: StatefulEvaluationTypeToggle,
});
export const Code = meta.story({
  args: { value: EvalTemplateTypeEnum.CODE, onValueChange: fn() },
  render: StatefulEvaluationTypeToggle,
});
export const Narrow = meta.story({
  globals: { viewport: { value: "evaluation-type-phone", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        "evaluation-type-phone": {
          name: "Phone",
          styles: { width: "390px", height: "844px" },
        },
      },
    },
  },
  args: { value: EvalTemplateTypeEnum.LLM_AS_JUDGE, onValueChange: fn() },
  render: StatefulEvaluationTypeToggle,
});
export const SwitchesToDropdownInNarrowSlot = meta.story({
  name: "(Test) Switches to a dropdown in a narrow slot",
  args: { value: EvalTemplateTypeEnum.LLM_AS_JUDGE, onValueChange: fn() },
  render: StatefulEvaluationTypeToggle,
  decorators: [
    (Story) => (
      <div className="flex w-80">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("combobox", { name: "Evaluation type" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("tab")).toBeNull();
  },
});
export const LockedForEdit = meta.story({
  args: {
    value: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    disabled: true,
    onValueChange: fn(),
  },
  render: StatefulEvaluationTypeToggle,
});

export const WithJudgeModel = meta.story({
  render: function Render() {
    const [evaluatorType, setEvaluatorType] = useState<EvalTemplateType>(
      EvalTemplateTypeEnum.LLM_AS_JUDGE,
    );
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const [judgeModelMode, setJudgeModelMode] = useState<"default" | "custom">(
      "default",
    );
    const [selectedModel, setSelectedModel] = useState<{
      provider: string;
      model: string;
    } | null>(null);

    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <EvaluationTypeToggle
          value={evaluatorType}
          onValueChange={setEvaluatorType}
        />
        {evaluatorType === EvalTemplateTypeEnum.LLM_AS_JUDGE ? (
          <JudgeModelPicker
            open={modelPickerOpen}
            onOpenChange={setModelPickerOpen}
            mode={judgeModelMode}
            defaultModel={{ provider: "OpenAI", model: "gpt-4.1-mini" }}
            providerGroups={[
              ["OpenAI", ["gpt-4.1-mini", "gpt-4.1"]],
              ["Anthropic", ["claude-sonnet-4"]],
            ]}
            selectedModel={selectedModel}
            onModeChange={setJudgeModelMode}
            onSelectCustom={(model) => {
              setSelectedModel(model);
              setJudgeModelMode("custom");
            }}
            onConfigureProviders={fn()}
            onConfigureModel={fn()}
            canSetProjectDefault
            onSetProjectDefault={fn()}
          >
            <PopoverTrigger asChild>
              <JudgeModelPickerTrigger
                mode={judgeModelMode}
                defaultModel={{
                  provider: "OpenAI",
                  model: "gpt-4.1-mini",
                }}
                selectedModel={selectedModel}
                disabled={false}
              />
            </PopoverTrigger>
          </JudgeModelPicker>
        ) : null}
      </div>
    );
  },
});
