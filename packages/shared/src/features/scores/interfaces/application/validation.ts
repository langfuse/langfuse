import z from "zod/v4";
import { APIScoreSchemaV1, APIScoreV1 } from "../api/v1/schemas";
import { ScoreDomain, ScoreSchema } from "../../../../domain";

type ValidatedScore<IncludeHasMetadata extends boolean> = ScoreDomain & {
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
 * @param scores
 * @returns list of validated scores
 */
export const filterAndValidateDbScoreList = <
  IncludeHasMetadata extends boolean,
>({
  scores,
  includeHasMetadata = false as IncludeHasMetadata,
  onParseError,
}: {
  scores: InputScore[];
  includeHasMetadata?: IncludeHasMetadata;
  // eslint-disable-next-line no-unused-vars
  onParseError?: (error: z.ZodError) => void;
}): ValidatedScore<IncludeHasMetadata>[] => {
  return scores.reduce((acc, ts) => {
    const result = ScoreSchema.safeParse(ts);
    if (result.success) {
      const score = { ...result.data };
      if (includeHasMetadata) {
        Object.assign(score, { hasMetadata: ts.hasMetadata ?? false });
      }
      acc.push(score as ValidatedScore<IncludeHasMetadata>);
    } else {
      console.error("Score parsing error: ", result.error);
      onParseError?.(result.error);
    }
    return acc;
  }, [] as ValidatedScore<IncludeHasMetadata>[]);
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
  // eslint-disable-next-line no-unused-vars
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
