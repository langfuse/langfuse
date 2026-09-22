import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { DefinitionStep } from "./DefinitionStep";

const meta = preview.meta({ component: DefinitionStep });

export const LlmAsJudge = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    type: "LLM_AS_JUDGE",
    onTypeChange: fn(),
    isEditing: false,
    showDecisionModel: false,
    typeConfiguration: <button type="button">Project default model</button>,
    promptEditor: <div className="rounded-md border p-3">Prompt editor</div>,
    scoreOutputEditor: (
      <div className="rounded-md border p-3">Score output</div>
    ),
  },
});

export const Code = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    type: "CODE",
    onTypeChange: fn(),
    isEditing: false,
    showDecisionModel: false,
    typeConfiguration: <button type="button">TypeScript</button>,
    codeEditor: <div className="rounded-md border p-3">Code editor</div>,
  },
});

export const DecisionModel = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    type: "DECISION_MODEL",
    onTypeChange: fn(),
    isEditing: false,
    showDecisionModel: true,
    typeConfiguration: <button type="button">typesafe: jev-1.13.0</button>,
    questionsEditor: <div className="rounded-md border p-3">Question list</div>,
  },
});
