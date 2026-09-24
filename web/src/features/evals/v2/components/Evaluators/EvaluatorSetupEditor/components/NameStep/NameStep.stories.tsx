import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { NameStep } from "./NameStep";

const meta = preview.meta({ component: NameStep });

export const Default = meta.story({
  args: {
    step: 3,
    variant: "default",
    open: true,
    onOpenChange: fn(),
    name: "Factual correctness",
    onNameChange: fn(),
    description: "Scores whether an answer is factually correct.",
    onDescriptionChange: fn(),
    nameAIAssistance: { state: "idle", onGenerate: fn() },
    descriptionAIAssistance: { state: "idle", onGenerate: fn() },
  },
});

export const SuggestingMetadata = meta.story({
  args: {
    step: 3,
    variant: "default",
    open: true,
    onOpenChange: fn(),
    name: "",
    onNameChange: fn(),
    description: "",
    onDescriptionChange: fn(),
    nameAIAssistance: { state: "generating" },
    descriptionAIAssistance: { state: "generating" },
  },
});

export const DecisionModel = meta.story({
  args: {
    step: 3,
    variant: "decisionModel",
    open: true,
    onOpenChange: fn(),
    name: "Technical depth",
    onNameChange: fn(),
    description: "Measures how technically detailed each question is.",
    onDescriptionChange: fn(),
    nameAIAssistance: { state: "idle", onGenerate: fn() },
    descriptionAIAssistance: { state: "idle", onGenerate: fn() },
  },
});
