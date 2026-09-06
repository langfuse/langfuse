import { type ScoreDataTypeType, type ScoreSourceType } from "@langfuse/shared";

export type ScoreData = {
  key: string;
  name: string;
  dataType: ScoreDataTypeType;
  source: ScoreSourceType;
};
