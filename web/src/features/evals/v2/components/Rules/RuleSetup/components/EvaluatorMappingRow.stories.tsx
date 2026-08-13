import preview from "../../../../../../../../.storybook/preview";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";

import { EvaluatorMappingRow } from "./EvaluatorMappingRow";

const evaluatorId = "conciseness";
const defaultVariableMapping = [
  {
    templateVariable: "input",
    selectedColumnId: "input",
    jsonSelector: null,
  },
  {
    templateVariable: "output",
    selectedColumnId: "output",
    jsonSelector: null,
  },
];
const store = createRuleSetupStore({
  name: "Rule",
  filter: [],
  sampling: 1,
  assignments: [
    {
      evaluatorId,
      evaluatorName: "Conciseness",
      defaultVariableMapping,
      variableMapping: null,
    },
  ],
});

const meta = preview.meta({ component: EvaluatorMappingRow });

export const FullyMapped = meta.story({
  args: {
    evaluatorId,
    evaluatorName: "Conciseness",
    defaultVariableMapping,
    store,
    sampleObject: null,
  },
});
