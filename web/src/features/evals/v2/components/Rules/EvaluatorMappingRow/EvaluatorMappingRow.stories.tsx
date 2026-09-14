import preview from "../../../../../../../.storybook/preview";
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
      evaluatorType: "LLM_AS_JUDGE",
      defaultVariableMapping,
      variableMapping: null,
    },
  ],
});
const codeEvaluatorId = "exact-match";
const codeEvaluatorStore = createRuleSetupStore({
  name: "Experiment evaluators",
  filter: [],
  sampling: 1,
  assignments: [
    {
      evaluatorId: codeEvaluatorId,
      evaluatorName: "Exact Match",
      evaluatorType: "CODE",
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
    evaluatorType: "LLM_AS_JUDGE",
    defaultVariableMapping,
    store,
    sampleObject: null,
    costEstimate: null,
  },
});

export const CodeEvaluator = meta.story({
  args: {
    evaluatorId: codeEvaluatorId,
    evaluatorName: "Exact Match",
    evaluatorType: "CODE",
    defaultVariableMapping,
    store: codeEvaluatorStore,
    sampleObject: {
      input: "What is the capital of Germany?",
      output: "Berlin",
    },
    costEstimate: null,
  },
});
