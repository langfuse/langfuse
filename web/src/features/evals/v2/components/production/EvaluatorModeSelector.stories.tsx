import { useState } from "react";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import {
  EvaluatorModeSelector,
  type EvaluatorTab,
} from "./EvaluatorModeSelector";
import { JudgeModelPicker } from "./JudgeModelPicker";

const meta = preview.meta({ component: EvaluatorModeSelector });

type EvaluatorModeSelectorProps = Parameters<typeof EvaluatorModeSelector>[0];

function StatefulEvaluatorModeSelector(args: EvaluatorModeSelectorProps) {
  const [, updateArgs] = useArgs<EvaluatorModeSelectorProps>();

  return (
    <EvaluatorModeSelector
      {...args}
      onValueChange={(value) => {
        updateArgs({ value });
        args.onValueChange(value);
      }}
    />
  );
}

export const LlmJudge = meta.story({
  args: { value: "llm", onValueChange: fn() },
  render: StatefulEvaluatorModeSelector,
});
export const Python = meta.story({
  args: { value: "python", onValueChange: fn() },
  render: StatefulEvaluatorModeSelector,
});
export const TypeScript = meta.story({
  args: { value: "typescript", onValueChange: fn() },
  render: StatefulEvaluatorModeSelector,
});
export const LockedForEdit = meta.story({
  args: { value: "llm", disabled: true, onValueChange: fn() },
  render: StatefulEvaluatorModeSelector,
});

export const WithJudgeModel = meta.story({
  render: function Render() {
    const [evaluatorType, setEvaluatorType] = useState<EvaluatorTab>("llm");
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
        <EvaluatorModeSelector
          value={evaluatorType}
          onValueChange={setEvaluatorType}
        />
        {evaluatorType === "llm" ? (
          <>
            <span>with</span>
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
              onConfigureDefault={fn()}
            />
          </>
        ) : null}
      </div>
    );
  },
});
