import type { ScoreDataTypeEnum } from "@langfuse/shared";

export type ScoreOutputDataType =
  | typeof ScoreDataTypeEnum.NUMERIC
  | typeof ScoreDataTypeEnum.CATEGORICAL
  | typeof ScoreDataTypeEnum.BOOLEAN;

/** One categorical choice row. Values remain strings while edited. */
export type ScoreOutputChoice = { label: string; value: string };

export type ScoreOutputFormState = {
  dataType: ScoreOutputDataType;
  scoreDescription: string;
  reasoningDescription: string;
  choices: ScoreOutputChoice[];
  minValue: string;
  maxValue: string;
};

export type ScoreOutputSelectorState = Pick<
  ScoreOutputFormState,
  "dataType" | "choices" | "minValue" | "maxValue"
>;
