import type { ScoreDataTypeEnum } from "@langfuse/shared";

export type ScoreOutputDataType =
  | typeof ScoreDataTypeEnum.NUMERIC
  | typeof ScoreDataTypeEnum.CATEGORICAL
  | typeof ScoreDataTypeEnum.BOOLEAN;

export type ScoreOutputChoice = { label: string };

export type ScoreOutputFormState = {
  dataType: ScoreOutputDataType;
  scoreDescription: string;
  reasoningDescription: string;
  choices: ScoreOutputChoice[];
  shouldAllowMultipleMatches: boolean;
  minValue: string;
  maxValue: string;
};

export type ScoreOutputSelectorState = Pick<
  ScoreOutputFormState,
  | "dataType"
  | "choices"
  | "shouldAllowMultipleMatches"
  | "minValue"
  | "maxValue"
>;
