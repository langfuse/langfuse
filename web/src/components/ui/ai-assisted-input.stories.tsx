import { expect, fn, userEvent } from "storybook/test";

import preview from "../../../.storybook/preview";
import { AIAssistedInput } from "./ai-assisted-input";

const meta = preview.meta({ component: AIAssistedInput });

export const Available = meta.story({
  args: {
    id: "available-name",
    value: "Factual correctness",
    placeholder: "Evaluator name",
    onChange: fn(),
    aiAssistance: { state: "idle", onGenerate: fn() },
  },
});

export const DescriptionAvailable = meta.story({
  args: {
    id: "available-description",
    value: "Scores whether an answer is factually correct.",
    placeholder: "Evaluator description",
    fieldName: "description",
    onChange: fn(),
    aiAssistance: { state: "idle", onGenerate: fn() },
  },
});

export const Generating = meta.story({
  args: {
    id: "generating-name",
    value: "",
    placeholder: "Generating a name…",
    onChange: fn(),
    aiAssistance: { state: "generating" },
  },
});

export const Unavailable = meta.story({
  args: {
    id: "unavailable-name",
    value: "Manually named evaluator",
    placeholder: "Evaluator name",
    onChange: fn(),
    aiAssistance: { state: "unavailable" },
  },
});

const retriggerGeneration = fn();

export const RetriggersGeneration = meta.story({
  name: "(Test) Retriggers Generation",
  args: {
    id: "retrigger-name",
    value: "Factual correctness",
    placeholder: "Evaluator name",
    onChange: fn(),
    aiAssistance: {
      state: "idle",
      onGenerate: retriggerGeneration,
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Regenerate name with AI" }),
    );
    await expect(retriggerGeneration).toHaveBeenCalledOnce();
  },
});
