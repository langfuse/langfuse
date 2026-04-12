export type EvaluationStrategyId =
  | "llm-judge"
  | "cost"
  | "latency"
  | "response-length"
  | "javascript"
  | "text-matcher";

export type EvaluationStrategy = {
  description: string;
  id: EvaluationStrategyId;
  label: string;
};

export type ThresholdComparator = "less than" | "greater than" | "equal to";
export type TextMatcherOperator = "contains" | "equals" | "starts with";
export type JudgeOutputType = "numeric" | "boolean" | "categorical";

export type EvaluationStrategyConfigs = {
  "llm-judge": {
    judgePrompt: string;
    outputType: JudgeOutputType;
  };
  cost: {
    thresholdOperator: ThresholdComparator;
    thresholdValue: string;
    thresholdUnit: "USD" | "EUR";
  };
  latency: {
    thresholdOperator: ThresholdComparator;
    thresholdValue: string;
    thresholdUnit: "ms" | "s";
  };
  "response-length": {
    thresholdOperator: ThresholdComparator;
    thresholdValue: string;
    thresholdUnit: "tokens" | "words" | "characters";
  };
  javascript: {
    code: string;
  };
  "text-matcher": {
    matcherOperator: TextMatcherOperator;
    matcherValue: string;
  };
};

export const evaluationStrategies: EvaluationStrategy[] = [
  {
    id: "llm-judge",
    label: "LLM as a Judge",
    description: "Evaluate using other models",
  },
  {
    id: "cost",
    label: "Cost",
    description: "Cost of the response",
  },
  {
    id: "latency",
    label: "Latency",
    description: "Time to get a full response",
  },
  {
    id: "response-length",
    label: "Response Length",
    description: "Word, character, or token count",
  },
  {
    id: "javascript",
    label: "JavaScript",
    description: "Write a JavaScript code",
  },
  {
    id: "text-matcher",
    label: "Text Matcher",
    description: "Match text with various operators",
  },
];

export const initialStrategyConfigs: EvaluationStrategyConfigs = {
  "llm-judge": {
    judgePrompt:
      "Score whether the output solves the user request clearly and correctly.",
    outputType: "boolean",
  },
  cost: {
    thresholdOperator: "less than",
    thresholdValue: "0.01",
    thresholdUnit: "USD",
  },
  latency: {
    thresholdOperator: "less than",
    thresholdValue: "1200",
    thresholdUnit: "ms",
  },
  "response-length": {
    thresholdOperator: "less than",
    thresholdValue: "250",
    thresholdUnit: "tokens",
  },
  javascript: {
    code: 'return output.includes("refund") ? 1 : 0;',
  },
  "text-matcher": {
    matcherOperator: "contains",
    matcherValue: "refund",
  },
};

export function patchStrategyConfig<T extends EvaluationStrategyId>(
  configs: EvaluationStrategyConfigs,
  id: T,
  patch: Partial<EvaluationStrategyConfigs[T]>,
): EvaluationStrategyConfigs {
  return {
    ...configs,
    [id]: {
      ...configs[id],
      ...patch,
    },
  } as EvaluationStrategyConfigs;
}
