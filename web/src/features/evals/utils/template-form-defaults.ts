import {
  getGeneratedReasoningDescription,
  getGeneratedScoreDescription,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

// The default descriptions are the generated ones (shared with evaluator
// execution, which falls back to them when a persisted description is empty).
export const numericOutputDefinitionDefaults = {
  scoreDataType: ScoreDataTypeEnum.NUMERIC,
  reasoningDescription: getGeneratedReasoningDescription({
    dataType: ScoreDataTypeEnum.NUMERIC,
  }),
  scoreDescription: getGeneratedScoreDescription({
    dataType: ScoreDataTypeEnum.NUMERIC,
  }),
  categories: [] as Array<{ value: string }>,
  shouldAllowMultipleMatches: false,
};

export const booleanOutputDefinitionDefaults = {
  scoreDataType: ScoreDataTypeEnum.BOOLEAN,
  reasoningDescription: getGeneratedReasoningDescription({
    dataType: ScoreDataTypeEnum.BOOLEAN,
  }),
  scoreDescription: getGeneratedScoreDescription({
    dataType: ScoreDataTypeEnum.BOOLEAN,
  }),
  categories: [] as Array<{ value: string }>,
  shouldAllowMultipleMatches: false,
};

export const categoricalSingleOutputDefinitionDefaults = {
  scoreDataType: ScoreDataTypeEnum.CATEGORICAL,
  reasoningDescription: getGeneratedReasoningDescription({
    dataType: ScoreDataTypeEnum.CATEGORICAL,
  }),
  scoreDescription: getGeneratedScoreDescription({
    dataType: ScoreDataTypeEnum.CATEGORICAL,
  }),
  categories: [] as Array<{ value: string }>,
  shouldAllowMultipleMatches: false,
};

export const categoricalMultiOutputDefinitionDefaults = {
  scoreDataType: ScoreDataTypeEnum.CATEGORICAL,
  reasoningDescription: getGeneratedReasoningDescription({
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    shouldAllowMultipleMatches: true,
  }),
  scoreDescription: getGeneratedScoreDescription({
    dataType: ScoreDataTypeEnum.CATEGORICAL,
    shouldAllowMultipleMatches: true,
  }),
  categories: [] as Array<{ value: string }>,
  shouldAllowMultipleMatches: true,
};

export const getDefaultOutputDefinitionFormValues = (params?: {
  scoreDataType?:
    | typeof ScoreDataTypeEnum.NUMERIC
    | typeof ScoreDataTypeEnum.BOOLEAN
    | typeof ScoreDataTypeEnum.CATEGORICAL;
  shouldAllowMultipleMatches?: boolean;
}) => {
  if (params?.scoreDataType === ScoreDataTypeEnum.CATEGORICAL) {
    return params.shouldAllowMultipleMatches
      ? categoricalMultiOutputDefinitionDefaults
      : categoricalSingleOutputDefinitionDefaults;
  }

  if (params?.scoreDataType === ScoreDataTypeEnum.BOOLEAN) {
    return booleanOutputDefinitionDefaults;
  }

  return numericOutputDefinitionDefaults;
};

const defaultReasoningDescriptions = new Set(
  [
    numericOutputDefinitionDefaults.reasoningDescription,
    booleanOutputDefinitionDefaults.reasoningDescription,
    categoricalSingleOutputDefinitionDefaults.reasoningDescription,
    categoricalMultiOutputDefinitionDefaults.reasoningDescription,
    "One sentence reasoning for the score",
  ].map((value) => value.trim()),
);

const defaultScoreDescriptions = new Set(
  [
    numericOutputDefinitionDefaults.scoreDescription,
    booleanOutputDefinitionDefaults.scoreDescription,
    categoricalSingleOutputDefinitionDefaults.scoreDescription,
    categoricalMultiOutputDefinitionDefaults.scoreDescription,
    "Score between 0 and 1. Score 0 if false or negative and 1 if true or positive.",
  ].map((value) => value.trim()),
);

export const shouldReplaceDefaultOutputDefinitionField = (params: {
  currentValue?: string;
  field: "reasoningDescription" | "scoreDescription";
}) => {
  const trimmedValue = params.currentValue?.trim() ?? "";

  if (!trimmedValue) {
    return true;
  }

  return params.field === "reasoningDescription"
    ? defaultReasoningDescriptions.has(trimmedValue)
    : defaultScoreDescriptions.has(trimmedValue);
};
