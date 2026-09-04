import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { NameStep } from "./NameStep";

const meta = preview.meta({ component: NameStep });

export const Default = meta.story({
  args: {
    step: 3,
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
