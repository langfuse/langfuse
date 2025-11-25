import z from "zod/v4";
import { GetScoreResponseDataV2 } from "./endpoints";

/**
 * Use this function when pulling a list of scores from the database before returning to the public API to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scores
 * @returns list of validated scores with optional trace information in case of trace scores
 */
export const filterAndValidateV2GetScoreList = (
  scores: unknown[],
  // eslint-disable-next-line no-unused-vars
  onParseError?: (error: z.ZodError) => void,
): z.infer<typeof GetScoreResponseDataV2>[] =>
  scores.reduce(
    (acc: z.infer<typeof GetScoreResponseDataV2>[], ts) => {
      const result = GetScoreResponseDataV2.safeParse(ts);
      if (result.success) {
        acc.push(result.data);
      } else {
        console.error("Score parsing error: ", result.error);
        onParseError?.(result.error);
      }
      return acc;
    },
    [] as z.infer<typeof GetScoreResponseDataV2>[],
  );
