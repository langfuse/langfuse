import { useState } from "react";
import { DecisionModelQuestionType } from "@langfuse/shared";
import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import type {
  ActiveVariableMapping,
  VariableFieldState,
} from "@/src/features/evals/v2/types/variableMapping";
import { OpenAIDecisionModelStateEditor } from "./OpenAIDecisionModelStateEditor";

const QUESTIONS = [
  {
    id: "severity",
    type: DecisionModelQuestionType.SCORE,
    scoreName: "severity",
    instructions: "How severe is the issue in the input?",
    options: [
      { value: "", description: "" },
      { value: "", description: "" },
    ],
    levels: [
      { label: "Cosmetic", description: "Appearance only" },
      { label: "Blocked", description: "Cannot continue" },
    ],
    criteria: { true: "", false: "" },
  },
];

const meta = preview.meta({ component: OpenAIDecisionModelStateEditor });

const SAMPLE = {
  input: "I was charged twice. Please refund the extra charge.",
  output: "I've issued the refund.",
};

export const MappedInput = meta.story({
  args: {
    field: {
      key: "input",
      fieldState: { selectedColumnId: "input", jsonSelector: null },
    },
    activeMapping: null,
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    questions: QUESTIONS,
    sourceObject: SAMPLE,
    hasMatchingObservations: true,
  },
  render: (args) => {
    const [fieldState, setFieldState] = useState<VariableFieldState>(
      args.field.fieldState,
    );
    const [activeMapping, setActiveMapping] =
      useState<ActiveVariableMapping>(null);
    return (
      <OpenAIDecisionModelStateEditor
        {...args}
        field={{ key: "input", fieldState }}
        activeMapping={activeMapping}
        onActiveMappingChange={setActiveMapping}
        onChangeField={(next) => {
          setFieldState(next);
          args.onChangeField(next);
        }}
      />
    );
  },
});

export const NoSample = meta.story({
  args: {
    field: {
      key: "input",
      fieldState: { selectedColumnId: "input", jsonSelector: null },
    },
    activeMapping: null,
    onActiveMappingChange: fn(),
    onChangeField: fn(),
    questions: QUESTIONS,
    sourceObject: null,
    hasMatchingObservations: false,
    sourceUnavailableMessage:
      "Select a sample observation in the test panel to preview mapped values.",
  },
});
