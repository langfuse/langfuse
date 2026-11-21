import z from "zod";
import { GetScoreResponseDataV1 } from "./endpoints";

export const filterAndValidateLegacyV1GetScoreList = (
  scores: unknown[],

  onParseError: (error: z.ZodError) => void = (error) =>
    console.error("Score parsing error: ", error),
): z.infer<typeof GetScoreResponseDataV1>[] =>
  scores.reduce(
    (acc: z.infer<typeof GetScoreResponseDataV1>[], ts) => {
      const result = GetScoreResponseDataV1.safeParse(ts);
      if (result.success) {
        acc.push(result.data);
      } else {
        onParseError(result.error);
      }
      return acc;
    },
    [] as z.infer<typeof GetScoreResponseDataV1>[],
  );

/**
 * @deprecated
 * @alias
 * Use `filterAndValidateV2GetScoreList` instead. This function is only used for the legacy v1 API where scores were only associated with traces.
 * Use this function when pulling a list of scores from the database before returning to the public API to ensure type safety.
 * All scores are expected to pass the validation. Invalid scores are omitted and reported through onParseError (console.error by default).
 * @param scores
 * @returns list of validated scores with trace information
 */
export const filterAndValidateV1GetScoreList =
  filterAndValidateLegacyV1GetScoreList;
