import { type SingleValueOption, scoresTableCols } from "@langfuse/shared";

export { scoresTableCols };

type ScoreOptions = {
  name: Array<SingleValueOption>;
  tags: Array<SingleValueOption>;
  traceName: Array<SingleValueOption>;
  userId: Array<SingleValueOption>;
  stringValue: Array<SingleValueOption>;
  booleanValue: Array<SingleValueOption>;
};
