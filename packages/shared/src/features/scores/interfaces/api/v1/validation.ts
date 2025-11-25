import z from "zod/v4";
import { GetScoreResponseDataV1 } from "./endpoints";

/**
 * @deprecated
 * Use `filterAndValidateV2GetScoreList` instead. This function is only used for the legacy v1 API where scores were only associated with traces.
 * Use this function when pulling a list of scores from the database before returning to the public API to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scores
 * @returns list of validated scores with trace information
 */
export const filterAndValidateV1GetScoreList = (
  scores: unknown[],
  // eslint-disable-next-line no-unused-vars
  onParseError?: (error: z.ZodError) => void,
): z.infer<typeof GetScoreResponseDataV1>[] =>
  scores.reduce(
    (acc: z.infer<typeof GetScoreResponseDataV1>[], ts) => {
      const result = GetScoreResponseDataV1.safeParse(ts);
      if (result.success) {
        acc.push(result.data);
      } else {
        console.error(`Score parsing error ${JSON.stringify(result.error)}`);
        onParseError?.(result.error);
      }
      return acc;
    },
    [] as z.infer<typeof GetScoreResponseDataV1>[],
  );
