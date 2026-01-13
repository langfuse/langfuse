import z from "zod/v4";
import { APIScoreSchemaV1, APIScoreV1 } from "../api/v1/schemas";
import {
  ScoreDomain,
  ScoreSchema,
  ScoreDataTypeType,
  ScoresByDataTypes,
} from "../../../../domain";

type ValidatedScore<
  IncludeHasMetadata extends boolean,
  DataTypes extends readonly ScoreDataTypeType[],
> = ScoresByDataTypes<DataTypes> & {
  hasMetadata: IncludeHasMetadata extends true ? boolean : never;
};

type InputScore = ScoreDomain & { hasMetadata?: boolean };

/**
 * Use this function when pulling a single score from the database before using in the application to ensure type safety.
 * The score is expected to pass the validation. If a score fails validation, an error will be thrown.
 * @param score
 * @returns validated score
 * @throws error if score fails validation
 */
export const validateDbScore = (score: unknown): ScoreDomain =>
  ScoreSchema.parse(score);

/**
 * Use this function when pulling a list of scores from the database before using in the application to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * This function filters scores by the specified data types and validates them.
 * @param scores - List of scores to filter and validate
 * @param dataTypes - Array of data types to filter by (required)
 * @param includeHasMetadata - Whether to include hasMetadata field
 * @param onParseError - Optional callback for parse errors
 * @returns list of validated and filtered scores
 */
export const filterAndValidateDbScoreList = <
  IncludeHasMetadata extends boolean,
  DataTypes extends readonly ScoreDataTypeType[],
>({
  scores,
  dataTypes,
  includeHasMetadata = false as IncludeHasMetadata,
  onParseError,
}: {
  scores: InputScore[];
  dataTypes: DataTypes;
  includeHasMetadata?: IncludeHasMetadata;

  onParseError?: (error: z.ZodError) => void;
}): ValidatedScore<IncludeHasMetadata, DataTypes>[] => {
  return scores.reduce(
    (acc, ts) => {
      // Filter by dataType first
      if (!dataTypes.includes(ts.dataType)) {
        return acc;
      }

      const result = ScoreSchema.safeParse(ts);
      if (result.success) {
        const score = { ...result.data };
        if (includeHasMetadata) {
          Object.assign(score, { hasMetadata: ts.hasMetadata ?? false });
        }
        acc.push(score as ValidatedScore<IncludeHasMetadata, DataTypes>);
      } else {
        console.error("Score parsing error: ", result.error);
        onParseError?.(result.error);
      }
      return acc;
    },
    [] as ValidatedScore<IncludeHasMetadata, DataTypes>[],
  );
};

type ValidatedAPITraceScore<IncludeHasMetadata extends boolean> = APIScoreV1 & {
  hasMetadata: IncludeHasMetadata extends true ? boolean : never;
};

/**
 * @deprecated
 * Use `filterAndValidateDbScoreList` instead. This function is only used for the legacy v1 API where scores were only associated with traces.
 * Use this function when pulling a list of scores from the database before using in the application to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scores
 * @returns list of validated scores
 */
export const filterAndValidateDbTraceScoreList = <
  IncludeHasMetadata extends boolean,
>({
  scores,
  includeHasMetadata = false as IncludeHasMetadata,
  onParseError,
}: {
  scores: InputScore[];
  includeHasMetadata?: IncludeHasMetadata;

  onParseError?: (error: z.ZodError) => void;
}): ValidatedAPITraceScore<IncludeHasMetadata>[] => {
  return scores.reduce((acc, ts) => {
    const result = APIScoreSchemaV1.safeParse(ts);
    if (result.success) {
      const score = { ...result.data };
      if (includeHasMetadata) {
        Object.assign(score, { hasMetadata: ts.hasMetadata ?? false });
      }
      acc.push(score as ValidatedAPITraceScore<IncludeHasMetadata>);
    } else {
      console.error("Score parsing error: ", result.error);
      onParseError?.(result.error);
    }
    return acc;
  }, [] as ValidatedAPITraceScore<IncludeHasMetadata>[]);
};
