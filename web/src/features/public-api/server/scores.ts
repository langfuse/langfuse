import {
  removeObjectKeys,
  ScoreDataTypeEnum,
  type ScoreDomain,
} from "@langfuse/shared";

export {
  _handleGenerateScoresForPublicApi,
  _handleGetScoresCountForPublicApi,
  type ScoreQueryType,
} from "@langfuse/shared/src/server";

type ScoreApiResult = Omit<ScoreDomain, "longStringValue"> & {
  stringValue?: string | null;
};
type TextScoreApiResult = Omit<ScoreDomain, "longStringValue" | "value"> & {
  stringValue?: string | null;
};

/**
 * Converts a ScoreDomain object to API format.
 * For CORRECTION scores, moves longStringValue to stringValue for API compatibility.
 * For TEXT scores, removes longStringValue and value (always 0, not meaningful).
 * For other score types, removes longStringValue.
 */
export function convertScoreToPublicApi(
  score: ScoreDomain & { dataType: "TEXT" },
): TextScoreApiResult;
export function convertScoreToPublicApi(score: ScoreDomain): ScoreApiResult;
export function convertScoreToPublicApi(
  score: ScoreDomain,
): ScoreApiResult | TextScoreApiResult {
  if (score.dataType === ScoreDataTypeEnum.CORRECTION) {
    const { longStringValue, ...rest } = score;
    return {
      ...rest,
      stringValue: longStringValue,
    };
  }

  if (score.dataType === ScoreDataTypeEnum.TEXT) {
    return removeObjectKeys(score, ["longStringValue", "value"]);
  }

  return removeObjectKeys(score, ["longStringValue"]);
}
