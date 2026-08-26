import { useState } from "react";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

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
          <>
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
          </>
        ) : null}
      </div>
    );
  },
});
