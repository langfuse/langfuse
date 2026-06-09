import type { ScoreDataTypeType } from "@langfuse/shared";
import { InternalServerError, ScoreDataTypeEnum } from "@langfuse/shared";

export {
  listScoresV3ForPublicApi,
  buildSelectColumns,
  transformBooleanValueForFilter,
} from "@langfuse/shared/src/server";

export function polymorphicValue(score: {
  dataType: ScoreDataTypeType;
  value: number;
  stringValue?: string | null;
  longStringValue?: string | null;
}): number | boolean | string {
  switch (score.dataType) {
    case ScoreDataTypeEnum.NUMERIC:
      return score.value;
    case ScoreDataTypeEnum.BOOLEAN:
      return score.value === 1;
    case ScoreDataTypeEnum.CATEGORICAL:
    case ScoreDataTypeEnum.TEXT:
      if (score.stringValue == null) {
        throw new InternalServerError(
          `Score with dataType ${score.dataType} is missing its stringValue`,
        );
      }
      return score.stringValue;
    case ScoreDataTypeEnum.CORRECTION:
      if (score.longStringValue == null) {
        throw new InternalServerError(
          "Score with dataType CORRECTION is missing its longStringValue",
        );
      }
      return score.longStringValue;
    default: {
      const _exhaustiveCheck: never = score.dataType;
      throw new InternalServerError(
        `Score has unknown dataType: ${_exhaustiveCheck as string}`,
      );
    }
  }
}
