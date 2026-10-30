import z from "zod";
import { APIScoreSchemaV3 } from "./schemas";

/**
 * Use this function when pulling a list of scores from the database before returning to the public API to ensure type safety.
 * All scores are expected to pass the validation. If a score fails validation, it will be logged.
 * @param scores
 * @returns list of validated v3 scores
 */
export const filterAndValidateV3GetScoreList = (
  scores: unknown[],
  onParseError?: (error: z.ZodError) => void,
): z.infer<typeof APIScoreSchemaV3>[] =>
  scores.reduce(
    (acc: z.infer<typeof APIScoreSchemaV3>[], ts) => {
      const result = APIScoreSchemaV3.safeParse(ts);
      if (result.success) {
        acc.push(result.data);
      } else {
        onParseError?.(result.error);
      }
      return acc;
    },
    [] as z.infer<typeof APIScoreSchemaV3>[],
  );
