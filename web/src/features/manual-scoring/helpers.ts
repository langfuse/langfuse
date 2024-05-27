import { ScoreDataType } from "@langfuse/shared";

export const isNumeric = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.NUMERIC;
export const isCategorical = (dataType: ScoreDataType) =>
  dataType === ScoreDataType.CATEGORICAL;
